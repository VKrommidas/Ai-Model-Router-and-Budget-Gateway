import { LLMProvider, TokenUsage } from './llm-provider.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';

  async generate(prompt: string, options: { model: string; signal?: AbortSignal }): Promise<{ text: string; tokens: TokenUsage; model: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = {
      prompt: data.usage?.prompt_tokens || 0,
      completion: data.usage?.completion_tokens || 0,
    };

    return { text, tokens, model: options.model };
  }

  estimateCost(tokens: TokenUsage, model: string): number {
    const isPro = model === 'gpt-4o';
    if (isPro) {
      return (tokens.prompt * (2.5 / 1000000)) + (tokens.completion * (10.0 / 1000000));
    } else {
      return (tokens.prompt * (0.15 / 1000000)) + (tokens.completion * (0.6 / 1000000));
    }
  }

  async healthCheck(model: string): Promise<boolean> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return false;
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
