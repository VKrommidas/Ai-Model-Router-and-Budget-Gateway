import { GoogleGenAI } from '@google/genai';

export class EmbeddingService {
  private genAI: GoogleGenAI | null = null;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  private getClient(): GoogleGenAI {
    if (!this.genAI) {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is required for embedding generation');
      }
      this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.genAI;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const client = this.getClient();

    try {
      // Modern Gemini embedding models
      const response = await client.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
      });

      const emb = (response as any).embedding?.values || (response as any).embeddings?.[0]?.values;
      if (emb && Array.isArray(emb)) {
        return emb as number[];
      }
    } catch (err: any) {
      console.warn('[EmbeddingService] gemini-embedding-001 attempt failed, trying gemini-embedding-2:', err.message);
      try {
        const response2 = await client.models.embedContent({
          model: 'gemini-embedding-2',
          contents: text,
        });
        const emb2 = (response2 as any).embedding?.values || (response2 as any).embeddings?.[0]?.values;
        if (emb2 && Array.isArray(emb2)) {
          return emb2 as number[];
        }
      } catch (err2: any) {
        console.error('[EmbeddingService] All embedding attempts failed:', err2.message);
        throw err2;
      }
    }

    throw new Error('Could not extract embedding vectors from provider response');
  }
}

