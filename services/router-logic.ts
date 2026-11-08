/**
 * Router Domain Logic & FinOps Calculation Engine
 * 
 * Pure functions for:
 * 1. Heuristic Prompt Complexity Estimation
 * 2. Blended Meta-Scoring (Heuristic 30% + LLM Classifier 70%)
 * 3. FinOps Budget Enforcement & Circuit Breaker Logic
 * 4. Vector Cosine Similarity Calculation for Semantic Cache
 */

export interface RoutingDecision {
  tier: 'cheap' | 'expert';
  isSuspended: boolean;
  isFrugalityMode: boolean;
  budgetUsage: number;
}

/**
 * Calculates heuristic difficulty based on prompt length and keyword triggers.
 * Range: [0.0, 1.0]
 * - Baseline: 0.1
 * - Length > 500 chars: +0.3
 * - Explanatory/analysis terms: +0.2
 * - Code/debugging terms: +0.4
 * - Step-by-step reasoning terms: +0.3
 */
export function calculateHeuristicDifficulty(prompt: string): number {
  if (!prompt || typeof prompt !== 'string') return 0.0;
  
  let score = 0.1;
  const lower = prompt.toLowerCase();

  if (prompt.length > 500) score += 0.3;
  if (lower.includes('explain') || lower.includes('analyze') || lower.includes('compare')) score += 0.2;
  if (lower.includes('code') || lower.includes('function') || lower.includes('debug')) score += 0.4;
  if (lower.includes('step-by-step') || lower.includes('reasoning')) score += 0.3;

  const clamped = Math.min(1.0, Math.max(0.0, score));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Combines fast heuristic score with LLM meta-classifier score.
 * Formula: (heuristic * 0.3) + (llmScore * 0.7)
 * Range: [0.0, 1.0]
 */
export function blendDifficulty(heuristicScore: number, llmScore: number): number {
  const h = Math.min(1.0, Math.max(0.0, heuristicScore));
  const l = Math.min(1.0, Math.max(0.0, llmScore));
  const blended = (h * 0.3) + (l * 0.7);
  const clamped = Math.min(1.0, Math.max(0.0, blended));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Evaluates budget consumption against monthly limit and determines routing tier.
 * Rules:
 * - Budget Usage >= 1.0 (100%): Hard suspension (HTTP 402)
 * - Budget Usage > 0.9 (90%): Aggressive Frugality Mode (force 'cheap' tier)
 * - Otherwise: If difficulty > threshold (default 0.60) -> 'expert', else 'cheap'
 */
export function evaluateRoutingDecision(
  difficulty: number,
  totalSpend: number,
  monthlyBudget: number,
  threshold = 0.60
): RoutingDecision {
  const safeSpend = Math.max(0, Number(totalSpend) || 0);
  const safeBudget = Number(monthlyBudget) || 0;

  // If budget is zero or negative, check if any spend occurred
  const budgetUsage = safeBudget > 0 ? safeSpend / safeBudget : (safeSpend > 0 ? 1.0 : 0.0);

  if (budgetUsage >= 1.0) {
    return {
      tier: 'cheap',
      isSuspended: true,
      isFrugalityMode: false,
      budgetUsage: Math.round(budgetUsage * 10000) / 10000
    };
  }

  if (budgetUsage > 0.9) {
    return {
      tier: 'cheap',
      isSuspended: false,
      isFrugalityMode: true,
      budgetUsage: Math.round(budgetUsage * 10000) / 10000
    };
  }

  const selectedTier = difficulty > threshold ? 'expert' : 'cheap';
  return {
    tier: selectedTier,
    isSuspended: false,
    isFrugalityMode: false,
    budgetUsage: Math.round(budgetUsage * 10000) / 10000
  };
}

/**
 * Calculates cosine similarity between two dense embedding vectors.
 * Formula: (A . B) / (||A|| * ||B||)
 * Returns value in range [-1.0, 1.0], or 0 for invalid/empty inputs.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(vecA.length, vecB.length);

  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.round(sim * 10000) / 10000;
}

