import { collection, addDoc, query, getDocs, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { cosineSimilarity } from './router-logic.js';

export interface CacheEntry {
  id: string;
  prompt: string;
  response: string;
  embedding: number[];
  cost: number;
  duration: number;
  timestamp: string;
  similarity?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  totalCostSaved: number;
  totalLatencySaved: number;
}

export interface CacheProvider {
  search(embedding: number[], threshold: number): Promise<CacheEntry | null>;
  store(prompt: string, response: string, embedding: number[], cost: number, duration: number): Promise<void>;
  getStats(): Promise<CacheStats>;
  recordHit(costSaved: number, latencySaved: number): void;
  recordMiss(): void;
  clear(): Promise<void>;
}



export class FirestoreCacheProvider implements CacheProvider {
  private db: any;
  private cacheCollection = 'semantic_cache';
  private memoryFallback: CacheEntry[] = [];
  
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    totalCostSaved: 0,
    totalLatencySaved: 0,
  };

  constructor(db: any) {
    this.db = db;
  }

  private searchMemory(embedding: number[], threshold: number): CacheEntry | null {
    let bestMatch: CacheEntry | null = null;
    let highestSimilarity = -1;

    for (const entry of this.memoryFallback) {
      if (entry.embedding && Array.isArray(entry.embedding)) {
        const sim = cosineSimilarity(embedding, entry.embedding);
        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          bestMatch = { ...entry, similarity: sim };
        }
      }
    }

    if (bestMatch && highestSimilarity >= threshold) {
      console.info(`[CacheProvider:Memory] Best match similarity: ${(highestSimilarity * 100).toFixed(1)}% (Threshold: ${(threshold * 100).toFixed(1)}%)`);
      return bestMatch;
    }
    return null;
  }

  async search(embedding: number[], threshold: number): Promise<CacheEntry | null> {
    try {
      const q = query(collection(this.db, this.cacheCollection), orderBy('timestamp', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      
      let bestMatch: CacheEntry | null = null;
      let highestSimilarity = -1;

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const docEmbedding = data.embedding;
        if (docEmbedding && Array.isArray(docEmbedding)) {
          const sim = cosineSimilarity(embedding, docEmbedding);
          if (sim > highestSimilarity) {
            highestSimilarity = sim;
            bestMatch = { id: docSnap.id, ...data, similarity: sim } as CacheEntry;
          }
        }
      });

      if (bestMatch && highestSimilarity >= threshold) {
        console.info(`[CacheProvider:Firestore] Best match similarity: ${(highestSimilarity * 100).toFixed(1)}% (Threshold: ${(threshold * 100).toFixed(1)}%)`);
        return bestMatch;
      }
      
      // Fallback to in-memory entries if Firestore didn't have it
      return this.searchMemory(embedding, threshold);
    } catch (e: any) {
      // Permission denied or offline: seamlessly search in-memory cache
      console.info('[CacheProvider] Firestore access restricted, searching local memory cache...');
      return this.searchMemory(embedding, threshold);
    }
  }

  async store(prompt: string, response: string, embedding: number[], cost: number, duration: number): Promise<void> {
    if (!response || response.trim().length === 0 || response.toLowerCase().includes('error')) {
      return; 
    }

    const entry: CacheEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      prompt,
      response,
      embedding,
      cost,
      duration,
      timestamp: new Date().toISOString()
    };

    // Always store in memory cache
    this.memoryFallback.push(entry);
    if (this.memoryFallback.length > 200) {
      this.memoryFallback.shift(); // retain last 200 entries
    }
    
    // Attempt Firestore persistence
    try {
      await addDoc(collection(this.db, this.cacheCollection), {
        prompt,
        response,
        embedding,
        cost,
        duration,
        timestamp: entry.timestamp
      });
      console.info(`[CacheProvider] Stored entry to Firestore & local memory for: "${prompt.slice(0, 40)}..."`);
    } catch (e: any) {
      console.info(`[CacheProvider] Firestore sync skipped (${e.code || 'restricted rules'}); stored in local memory cache.`);
    }
  }

  async getStats(): Promise<CacheStats> {
    return this.stats;
  }
  
  recordHit(costSaved: number, latencySaved: number) {
    this.stats.hits++;
    this.stats.totalCostSaved += costSaved;
    this.stats.totalLatencySaved += latencySaved;
  }
  
  recordMiss() {
    this.stats.misses++;
  }

  async clear(): Promise<void> {
    try {
      const q = query(collection(this.db, this.cacheCollection), limit(500));
      const snapshot = await getDocs(q);
      const deletePromises: any[] = [];
      snapshot.forEach(d => {
        deletePromises.push(deleteDoc(doc(this.db, this.cacheCollection, d.id)));
      });
      await Promise.all(deletePromises);
      this.stats = { hits: 0, misses: 0, totalCostSaved: 0, totalLatencySaved: 0 };
    } catch (e) {
      console.error('[CacheProvider] Clear error:', e);
    }
  }
}

