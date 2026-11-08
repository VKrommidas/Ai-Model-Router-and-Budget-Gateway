import { LLMProvider, TokenUsage } from './llm-provider.js';

export class OllamaProvider implements LLMProvider {
  name = 'ollama';

  async generate(prompt: string, options: { model: string; signal?: AbortSignal }): Promise<{ text: string; tokens: TokenUsage; model: string }> {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        prompt: prompt,
        stream: false,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    const text = data.response || '';
    const tokens = {
      prompt: data.prompt_eval_count || 0,
      completion: data.eval_count || 0,
    };

    return { text, tokens, model: options.model };
  }

  estimateCost(tokens: TokenUsage, model: string): number {
    return 0; // Local models are completely free
  }

  async healthCheck(model: string): Promise<boolean> {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) return false;

      const data = await response.json() as any;
      const modelsList = data.models || [];
      if (model) {
        return modelsList.some((m: any) => m.name === model || m.name.startsWith(model + ':'));
      }
      return true;
    } catch {
      return false;
    }
  }
}
