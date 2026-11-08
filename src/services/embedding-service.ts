import { GoogleGenAI } from '@google/genai';

export class EmbeddingService {
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for embedding generation');
    }

    try {
      const response = await this.genAI.models.embedContent({
        model: 'embedding-001',
        contents: text,
      });
      
      const emb = (response as any).embeddings?.[0]?.values;
      if (emb) return emb as number[];
      
      throw new Error('Failed to extract embedding from response');
    } catch (error) {
      console.error('[EmbeddingService] Error generating embedding:', error);
      throw error;
    }
  }
}
