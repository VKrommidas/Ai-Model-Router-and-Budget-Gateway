export interface TokenUsage {
  prompt: number;
  completion: number;
}

export interface ProviderConfig {
  enabled: boolean;
  priority: number;
  cheapModel: string;
  expertModel: string;
  healthy: boolean;
  lastChecked: string;
}

export interface GlobalConfig {
  monthlyBudget: number;
  totalSpend: number;
  currency: string;
  lastReset: string;
  providers: Record<string, ProviderConfig>;
  failoverOrder: string[];
  timeoutMs: number;
  maxRetries: number;
  uptimeSeconds?: number;
  difficultyThreshold?: number;
}

export interface LLMProvider {
  name: string;
  generate(prompt: string, options: { model: string; signal?: AbortSignal }): Promise<{ text: string; tokens: TokenUsage; model: string }>;
  estimateCost(tokens: TokenUsage, model: string): number;
  healthCheck(model: string): Promise<boolean>;
}
