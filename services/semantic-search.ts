import { EmbeddingService } from './embedding-service.js';
import { CacheProvider, CacheEntry, CacheStats } from './cache-manager.js';

export class SemanticSearchService {
  private embeddingService: EmbeddingService;
  private cacheProvider: CacheProvider;
  private similarityThreshold: number;
  private cacheEnabled: boolean;
  private ttlMs: number;

  constructor(cacheProvider: CacheProvider) {
    this.cacheProvider = cacheProvider;
    this.embeddingService = new EmbeddingService();
    this.similarityThreshold = parseFloat(process.env.SEMANTIC_SIMILARITY_THRESHOLD || '0.90');
    // Default to true unless explicitly 'false'
    this.cacheEnabled = process.env.CACHE_ENABLED !== 'false';
    const ttlHours = parseFloat(process.env.CACHE_TTL_HOURS || '24');
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  isEnabled(): boolean {
    return this.cacheEnabled;
  }

  getThreshold(): number {
    return this.similarityThreshold;
  }

  async searchCache(prompt: string): Promise<{ hit: boolean; entry?: CacheEntry; embedding?: number[] }> {
    if (!this.isEnabled()) return { hit: false };

    try {
      // 1. Generate embedding vector for the incoming prompt
      const embedding = await this.embeddingService.generateEmbedding(prompt);
      
      // 2. Perform Cosine Similarity Search over cached prompt vectors
      const match = await this.cacheProvider.search(embedding, this.similarityThreshold);

      if (match) {
        // 3. TTL Check
        const age = Date.now() - new Date(match.timestamp).getTime();
        if (age > this.ttlMs) {
          console.info('[SemanticSearch] Cache candidate found but exceeded TTL (stale).');
          return { hit: false, embedding };
        }
        
        console.info(`[SemanticSearch] Cache HIT! (${( (match.similarity || 0) * 100 ).toFixed(1)}% match)`);
        return { hit: true, entry: match, embedding };
      }

      console.info('[SemanticSearch] Cache MISS (no matches >= threshold).');
      return { hit: false, embedding };
    } catch (e: any) {
      console.warn('[SemanticSearch] Cache bypass due to lookup/embedding warning:', e.message);
      return { hit: false };
    }
  }

  async storeCache(prompt: string, response: string, embedding: number[], cost: number, duration: number): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      let vec = embedding;
      if (!vec || vec.length === 0) {
        vec = await this.embeddingService.generateEmbedding(prompt);
      }
      await this.cacheProvider.store(prompt, response, vec, cost, duration);
    } catch (e: any) {
      console.warn('[SemanticSearch] storeCache skipped due to error:', e.message);
    }
  }

  recordHit(costSaved: number, latencySaved: number) {
    this.cacheProvider.recordHit(costSaved, latencySaved);
  }

  recordMiss() {
    this.cacheProvider.recordMiss();
  }

  async getStats(): Promise<CacheStats> {
    return this.cacheProvider.getStats();
  }

  async clearCache(): Promise<void> {
    return this.cacheProvider.clear();
  }
}
