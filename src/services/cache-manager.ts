import { collection, addDoc, query, getDocs, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';

export interface CacheEntry {
  id: string;
  prompt: string;
  response: string;
  embedding: number[];
  cost: number;
  duration: number;
  timestamp: string;
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

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class FirestoreCacheProvider implements CacheProvider {
  private db: any;
  private cacheCollection = 'semantic_cache';
  
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    totalCostSaved: 0,
    totalLatencySaved: 0,
  };

  constructor(db: any) {
    this.db = db;
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
            bestMatch = { id: docSnap.id, ...data } as CacheEntry;
          }
        }
      });

      if (bestMatch && highestSimilarity >= threshold) {
        return bestMatch;
      }
      return null;
    } catch (e) {
      console.error('[CacheProvider] Search error:', e);
      return null;
    }
  }

  async store(prompt: string, response: string, embedding: number[], cost: number, duration: number): Promise<void> {
    if (!response || response.trim().length === 0 || response.includes('Error')) {
      return; 
    }
    
    // Prevent exactly identical prompts from duplicating, basic check
    try {
      const entry = {
        prompt,
        response,
        embedding,
        cost,
        duration,
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(this.db, this.cacheCollection), entry);
    } catch (e) {
      console.error('[CacheProvider] Store error:', e);
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
