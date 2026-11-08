import { LLMProvider, TokenUsage } from './llm-provider.js';

export class ClaudeProvider implements LLMProvider {
  name = 'claude';

  async generate(prompt: string, options: { model: string; signal?: AbortSignal }): Promise<{ text: string; tokens: TokenUsage; model: string }> {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key is not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '';
    const tokens = {
      prompt: data.usage?.input_tokens || 0,
      completion: data.usage?.output_tokens || 0,
    };

    return { text, tokens, model: options.model };
  }

  estimateCost(tokens: TokenUsage, model: string): number {
    const isPro = model.includes('sonnet');
    if (isPro) {
      return (tokens.prompt * (3.0 / 1000000)) + (tokens.completion * (15.0 / 1000000));
    } else {
      return (tokens.prompt * (0.8 / 1000000)) + (tokens.completion * (4.0 / 1000000));
    }
  }

  async healthCheck(model: string): Promise<boolean> {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return false;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-haiku-latest',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Ping' }],
        }),
      });
      return response.status === 200 || response.status === 400;
    } catch {
      return false;
    }
  }
}
