import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, setDoc, query, orderBy, limit, getDocs, Timestamp, increment } from 'firebase/firestore';
import fs from 'fs';
import { GatewayManager } from './providers/gateway-manager.js';
import { FirestoreCacheProvider } from './services/cache-manager.js';
import { SemanticSearchService } from './services/semantic-search.js';
import { calculateHeuristicDifficulty, blendDifficulty, evaluateRoutingDecision } from './services/router-logic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const PORT = 3000;
const COST_FLASH = 0.0001; // Flat estimate for demo
const COST_PRO = 0.0025;   // Flat estimate for demo
const serverStartTime = Date.now();

// Models
const MODEL_CHEAP = 'gemini-3.5-flash-lite';
const MODEL_EXPERT = 'gemini-3.1-pro-preview';

// Errors
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Load config
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));
  const firebaseApp = initializeApp(firebaseConfig);
  const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

  // Initialize Gateway & Semantic Cache
  const gateway = new GatewayManager(db);
  const cacheProvider = new FirestoreCacheProvider(db);
  const semanticSearch = new SemanticSearchService(cacheProvider);

  // API Routes
  app.get('/api/config', async (req, res) => {
    try {
      const config = await gateway.getOrInitConfig();
      const cacheStats = await semanticSearch.getStats();
      res.json({
        ...config,
        uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
        difficultyThreshold: 0.60,
        cacheStats
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'config/global');
    }
  });

  app.post('/api/config/global', async (req, res) => {
    const { monthlyBudget, timeoutMs, maxRetries } = req.body;
    try {
      const updates: any = {};
      if (monthlyBudget !== undefined) updates.monthlyBudget = Number(monthlyBudget);
      if (timeoutMs !== undefined) updates.timeoutMs = Number(timeoutMs);
      if (maxRetries !== undefined) updates.maxRetries = Number(maxRetries);
      
      const configDocRef = doc(db, 'config', 'global');
      await updateDoc(configDocRef, updates);
      
      const latest = await gateway.getOrInitConfig();
      res.json(latest);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update global config' });
    }
  });

  app.post('/api/config/providers', async (req, res) => {
    const { provider, enabled, priority, cheapModel, expertModel } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider name is required' });
    
    try {
      const updates: any = {};
      if (enabled !== undefined) updates.enabled = !!enabled;
      if (priority !== undefined) updates.priority = Number(priority);
      if (cheapModel !== undefined) updates.cheapModel = String(cheapModel);
      if (expertModel !== undefined) updates.expertModel = String(expertModel);
      
      const config = await gateway.updateProviderConfig(provider, updates);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update provider config' });
    }
  });

  app.post('/api/health', async (req, res) => {
    try {
      const healthResults = await gateway.checkAllProvidersHealth();
      res.json(healthResults);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Health check failed' });
    }
  });

  app.get('/api/logs', async (req, res) => {
    const p = 'logs';
    try {
      const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(logs);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, p);
    }
  });

  app.post('/api/route', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Prompt is required and must be a string' });
    if (prompt.length > 10000) return res.status(400).json({ error: 'Prompt exceeds maximum allowed length of 10,000 characters' });

    try {
      // 0. Semantic Cache Lookup (Vector Cosine Similarity >= 0.90)
      const cacheStartTime = Date.now();
      const cacheLookup = await semanticSearch.searchCache(prompt);
      if (cacheLookup.hit && cacheLookup.entry) {
        const cacheDuration = Date.now() - cacheStartTime;
        const config = await gateway.getOrInitConfig();
        semanticSearch.recordHit(cacheLookup.entry.cost || 0.0001, cacheDuration);

        const cachedLogEntry = {
          timestamp: new Date().toISOString(),
          prompt,
          response: cacheLookup.entry.response,
          model: 'semantic-cache',
          provider: 'cache',
          cost: 0,
          tokens: { prompt: 0, completion: 0 },
          difficulty: 0,
          classification: 'cached',
          duration: cacheDuration,
          cached: true
        };

        try {
          await addDoc(collection(db, 'logs'), cachedLogEntry);
        } catch (e) {
          console.warn('[SemanticCache] Failed to write cache hit log:', e);
        }

        return res.json({
          ...cachedLogEntry,
          budgetInfo: {
            remaining: config.monthlyBudget - config.totalSpend,
            currentSpend: config.totalSpend
          }
        });
      }

      // 1. Difficulty Estimation
      let difficulty = calculateHeuristicDifficulty(prompt);
      
      try {
        const classifierPrompt = `Analyze the complexity of the following user query for an LLM. Consider reasoning steps, specialized knowledge (like coding or math), and length. Return ONLY a single float number between 0.0 (very easy) and 1.0 (extremely hard). Query: "${prompt}"`;
        const classifierRes = await gateway.generateWithFailover(classifierPrompt, 'cheap');
        const llmScore = parseFloat(classifierRes.text || '0');
        if (!isNaN(llmScore)) {
          difficulty = blendDifficulty(difficulty, llmScore);
        }
      } catch (err) {
        console.warn('Classifier LLM failed, falling back to heuristics only', err);
      }

      // 2. Budget Check & Enforcement
      const config = await gateway.getOrInitConfig();
      const routing = evaluateRoutingDecision(difficulty, config.totalSpend, config.monthlyBudget, 0.60);

      if (routing.isSuspended) {
        return res.status(402).json({ 
          error: 'Monthly budget exhausted. Service suspended until reset.',
          budgetInfo: { currentSpend: config.totalSpend, limit: config.monthlyBudget }
        });
      }

      if (routing.isFrugalityMode) {
        console.info('Budget usage high (>90%). Forcing Efficient Tier routing.');
      }

      const selectedTier = routing.tier;

      // 3. Call Model with Dynamic Failover Routing
      const startTime = Date.now();
      const generationResult = await gateway.generateWithFailover(prompt, selectedTier);
      const duration = Date.now() - startTime;

      // 4. Log and Track Cost
      const providerInstance = gateway.getProvider(generationResult.provider);
      let cost = 0;
      if (providerInstance) {
        cost = providerInstance.estimateCost(generationResult.tokens, generationResult.model);
      }
      if (cost === 0 && generationResult.provider !== 'ollama') {
        cost = selectedTier === 'expert' ? COST_PRO : COST_FLASH;
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        prompt,
        response: generationResult.text,
        model: generationResult.model,
        provider: generationResult.provider,
        cost,
        tokens: generationResult.tokens,
        difficulty,
        classification: difficulty > 0.7 ? 'hard' : (difficulty > 0.3 ? 'medium' : 'easy'),
        duration
      };

      try {
        await addDoc(collection(db, 'logs'), logEntry);
        await updateDoc(doc(db, 'config', 'global'), {
          totalSpend: increment(cost)
        });

        // Asynchronously persist response and embedding to Semantic Cache
        if (generationResult.text && !generationResult.text.toLowerCase().includes('error')) {
          semanticSearch.storeCache(
            prompt,
            generationResult.text,
            cacheLookup.embedding || [],
            cost,
            duration
          ).catch(err => console.warn('[SemanticCache] Background store skipped:', err));
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'logs/config');
      }

      res.json({
        ...logEntry,
        budgetInfo: {
          remaining: config.monthlyBudget - (config.totalSpend + cost),
          currentSpend: config.totalSpend + cost
        }
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Routing failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
