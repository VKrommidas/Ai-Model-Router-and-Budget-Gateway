import { GoogleGenAI } from '@google/genai';
import { LLMProvider, TokenUsage } from './llm-provider.js';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generate(prompt: string, options: { model: string; signal?: AbortSignal }): Promise<{ text: string; tokens: TokenUsage; model: string }> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key is not configured');
    }

    const executeCall = async (modelToUse: string) => {
      const call = this.genAI.models.generateContent({
        model: modelToUse,
        contents: prompt,
      });

      if (options.signal) {
        const signal = options.signal;
        const abortPromise = new Promise<any>((_, reject) => {
          if (signal.aborted) return reject(new Error('Request aborted'));
          signal.addEventListener('abort', () => reject(new Error('Request aborted')));
        });
        return Promise.race([call, abortPromise]);
      }
      return call;
    };

    try {
      const response = await executeCall(options.model);
      const text = response.text || '';
      const tokens = {
        prompt: response.usageMetadata?.promptTokenCount || 0,
        completion: response.usageMetadata?.candidatesTokenCount || 0,
      };
      return { text, tokens, model: options.model };
    } catch (err: any) {
      const errMsg = err.message || String(err);
      if (errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('NOT_FOUND') || errMsg.includes('404')) {
        console.warn(`[GeminiProvider] Model ${options.model} issue encountered (${errMsg.slice(0, 80)}...). Attempting modern model fallback...`);
        const fallbackCandidates = ['gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'];
        
        for (const candidate of fallbackCandidates) {
          if (candidate === options.model) continue;
          try {
            console.info(`[GeminiProvider] Trying fallback: ${candidate}...`);
            const fallbackResp = await executeCall(candidate);
            const text = fallbackResp.text || '';
            const tokens = {
              prompt: fallbackResp.usageMetadata?.promptTokenCount || 0,
              completion: fallbackResp.usageMetadata?.candidatesTokenCount || 0,
            };
            return { text, tokens, model: candidate };
          } catch (candErr: any) {
            console.warn(`[GeminiProvider] Fallback ${candidate} failed:`, candErr.message || candErr);
          }
        }
      }
      throw err;
    }
  }

  estimateCost(tokens: TokenUsage, model: string): number {
    const isPro = model.includes('pro');
    if (isPro) {
      return (tokens.prompt * (3.5 / 1000000)) + (tokens.completion * (10.5 / 1000000));
    } else {
      return (tokens.prompt * (0.075 / 1000000)) + (tokens.completion * (0.3 / 1000000));
    }
  }

  async healthCheck(model: string): Promise<boolean> {
    if (!process.env.GEMINI_API_KEY) return false;
    try {
      const response = await this.genAI.models.generateContent({
        model: model || 'gemini-1.5-flash',
        contents: 'Ping',
      });
      return !!response;
    } catch {
      return false;
    }
  }
}
