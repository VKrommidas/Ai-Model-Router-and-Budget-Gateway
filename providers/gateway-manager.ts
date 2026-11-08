import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LLMProvider, TokenUsage, GlobalConfig, ProviderConfig } from './llm-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { OllamaProvider } from './ollama-provider.js';

export class GatewayManager {
  private providers: Map<string, LLMProvider> = new Map();
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.providers.set('gemini', new GeminiProvider());
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('claude', new ClaudeProvider());
    this.providers.set('ollama', new OllamaProvider());
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  async getOrInitConfig(): Promise<GlobalConfig> {
    const configDocRef = doc(this.db, 'config', 'global');
    const configDoc = await getDoc(configDocRef);

    const defaultConfig: GlobalConfig = {
      monthlyBudget: 5.0,
      totalSpend: 0,
      currency: 'USD',
      lastReset: new Date().toISOString(),
      providers: {
        gemini: {
          enabled: true,
          priority: 1,
          cheapModel: 'gemini-3-flash-preview',
          expertModel: 'gemini-3.1-pro-preview',
          healthy: true,
          lastChecked: new Date().toISOString(),
        },
        openai: {
          enabled: false,
          priority: 2,
          cheapModel: 'gpt-4o-mini',
          expertModel: 'gpt-4o',
          healthy: false,
          lastChecked: new Date().toISOString(),
        },
        claude: {
          enabled: false,
          priority: 3,
          cheapModel: 'claude-3-5-haiku-latest',
          expertModel: 'claude-3-5-sonnet-latest',
          healthy: false,
          lastChecked: new Date().toISOString(),
        },
        ollama: {
          enabled: false,
          priority: 4,
          cheapModel: 'llama3.2',
          expertModel: 'llama3',
          healthy: false,
          lastChecked: new Date().toISOString(),
        },
      },
      failoverOrder: ['gemini', 'openai', 'claude', 'ollama'],
      timeoutMs: 15000,
      maxRetries: 2,
    };

    if (!configDoc.exists()) {
      await setDoc(configDocRef, defaultConfig);
      return defaultConfig;
    }

    const data = configDoc.data() as any;
    let updated = false;

    if (!data.providers) {
      data.providers = defaultConfig.providers;
      updated = true;
    }
    if (!data.failoverOrder) {
      data.failoverOrder = defaultConfig.failoverOrder;
      updated = true;
    }
    if (data.timeoutMs === undefined) {
      data.timeoutMs = defaultConfig.timeoutMs;
      updated = true;
    }
    if (data.maxRetries === undefined) {
      data.maxRetries = defaultConfig.maxRetries;
      updated = true;
    }

    if (updated) {
      await setDoc(configDocRef, data, { merge: true });
    }

    return data as GlobalConfig;
  }

  async updateProviderConfig(providerName: string, updates: Partial<ProviderConfig>): Promise<GlobalConfig> {
    const configDocRef = doc(this.db, 'config', 'global');
    const config = await this.getOrInitConfig();

    if (!config.providers[providerName]) {
      throw new Error(`Provider ${providerName} does not exist`);
    }

    config.providers[providerName] = {
      ...config.providers[providerName],
      ...updates,
    };

    await setDoc(configDocRef, config, { merge: true });
    return config;
  }

  async checkAllProvidersHealth(): Promise<Record<string, boolean>> {
    const configDocRef = doc(this.db, 'config', 'global');
    const config = await this.getOrInitConfig();
    const results: Record<string, boolean> = {};

    for (const [name, provider] of this.providers.entries()) {
      const pConfig = config.providers[name];
      if (pConfig && pConfig.enabled) {
        const healthy = await provider.healthCheck(pConfig.cheapModel);
        results[name] = healthy;

        config.providers[name] = {
          ...pConfig,
          healthy,
          lastChecked: new Date().toISOString(),
        };
      } else {
        results[name] = false;
      }
    }

    await setDoc(configDocRef, config, { merge: true });
    return results;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generateWithFailover(
    prompt: string,
    tier: 'cheap' | 'expert'
  ): Promise<{
    text: string;
    tokens: TokenUsage;
    model: string;
    provider: string;
    attempts: Array<{ provider: string; model: string; error: string }>;
  }> {
    const config = await this.getOrInitConfig();
    const { failoverOrder, timeoutMs, maxRetries } = config;
    const effectiveTimeout = Math.max(60000, Number(timeoutMs) || 60000);

    const attempts: Array<{ provider: string; model: string; error: string }> = [];

    // Prioritize providers based on active priority and configuration order
    const enabledProviders = failoverOrder.filter(name => {
      const pConfig = config.providers[name];
      return pConfig && pConfig.enabled;
    });

    if (enabledProviders.length === 0) {
      throw new Error('No enabled providers configured in the gateway');
    }

    for (const providerName of enabledProviders) {
      const provider = this.providers.get(providerName);
      const pConfig = config.providers[providerName];

      if (!provider || !pConfig) continue;

      const model = tier === 'expert' ? pConfig.expertModel : pConfig.cheapModel;

      if (!pConfig.healthy && enabledProviders.length > 1) {
        attempts.push({ provider: providerName, model, error: 'Skipped: marked unhealthy' });
        continue;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let controller: AbortController | null = null;
        let timeoutId: any = null;

        try {
          if (attempt > 0) {
            const backoff = 500 * Math.pow(2, attempt - 1);
            await this.sleep(backoff);
          }

          controller = new AbortController();
          timeoutId = setTimeout(() => controller?.abort(), effectiveTimeout);

          const result = await provider.generate(prompt, {
            model,
            signal: controller.signal,
          });

          if (timeoutId) clearTimeout(timeoutId);

          if (!pConfig.healthy) {
            await this.updateProviderConfig(providerName, { healthy: true, lastChecked: new Date().toISOString() });
          }

          return {
            text: result.text,
            tokens: result.tokens,
            model: result.model,
            provider: providerName,
            attempts,
          };
        } catch (err: any) {
          clearTimeout(timeoutId);
          const errMsg = err.message || String(err);
          console.warn(`Attempt ${attempt + 1} failed on provider ${providerName} (${model}): ${errMsg}`);

          if (attempt === maxRetries) {
            attempts.push({ provider: providerName, model, error: errMsg });
            await this.updateProviderConfig(providerName, { healthy: false, lastChecked: new Date().toISOString() });
          }
        }
      }
    }

    throw new Error(`All enabled providers failed to respond. Attempts: ${JSON.stringify(attempts)}`);
  }
}
