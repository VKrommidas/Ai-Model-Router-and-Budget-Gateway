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
    this.cacheEnabled = process.env.CACHE_ENABLED === 'true';
    const ttlHours = parseFloat(process.env.CACHE_TTL_HOURS || '24');
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  isEnabled(): boolean {
    return this.cacheEnabled;
  }

  async searchCache(prompt: string): Promise<{ hit: boolean, entry?: CacheEntry, embedding?: number[] }> {
    if (!this.isEnabled()) return { hit: false };

    try {
      // 1. Generate embedding
      const embedding = await this.embeddingService.generateEmbedding(prompt);
      
      // 2. Search for similar items
      const match = await this.cacheProvider.search(embedding, this.similarityThreshold);

      if (match) {
        // 3. Check expiration (Stale Responses)
        const age = Date.now() - new Date(match.timestamp).getTime();
        if (age > this.ttlMs) {
          console.log('[SemanticSearch] Cache hit but stale.');
          return { hit: false, embedding };
        }
        
        console.log(`[SemanticSearch] Cache HIT! Similarity above ${this.similarityThreshold}`);
        return { hit: true, entry: match, embedding };
      }

      console.log(`[SemanticSearch] Cache MISS.`);
      return { hit: false, embedding };
    } catch (e) {
      console.error('[SemanticSearch] Error during cache search:', e);
      return { hit: false };
    }
  }

  async storeCache(prompt: string, response: string, embedding: number[], cost: number, duration: number): Promise<void> {
    if (!this.isEnabled()) return;
    await this.cacheProvider.store(prompt, response, embedding, cost, duration);
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
