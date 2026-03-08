/**
 * ⏱️🦀 Clawck — Model Pricing
 * Token-based cost estimation when cost_usd is not provided directly.
 */

export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  input_per_1m: number;
  /** Cost per 1M output tokens in USD */
  output_per_1m: number;
}

/**
 * Pricing table for known models.
 * Keys are matched as prefixes against the model string.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4': { input_per_1m: 15, output_per_1m: 75 },
  'claude-sonnet-4': { input_per_1m: 3, output_per_1m: 15 },
  'claude-haiku-4': { input_per_1m: 0.80, output_per_1m: 4 },
  'claude-3-5-sonnet': { input_per_1m: 3, output_per_1m: 15 },
  'claude-3-5-haiku': { input_per_1m: 0.80, output_per_1m: 4 },
  'claude-3-opus': { input_per_1m: 15, output_per_1m: 75 },
  'claude-3-sonnet': { input_per_1m: 3, output_per_1m: 15 },
  'claude-3-haiku': { input_per_1m: 0.25, output_per_1m: 1.25 },
};

/**
 * Look up pricing for a model string. Matches by prefix.
 */
export function getModelPricing(model: string): ModelPricing | null {
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) return pricing;
  }
  return null;
}

/** Sensible default pricing (Sonnet-class) for unknown models */
export const DEFAULT_PRICING: ModelPricing = { input_per_1m: 3, output_per_1m: 15 };

/**
 * Estimate cost from token counts and model name.
 * Returns null if model is unknown and useFallback is false.
 * When useFallback is true, uses Sonnet-class default pricing for unknown models.
 */
export function estimateCost(model: string, tokens_in: number, tokens_out: number, useFallback = false): number | null {
  const pricing = getModelPricing(model) || (useFallback ? DEFAULT_PRICING : null);
  if (!pricing) return null;
  return (tokens_in / 1_000_000) * pricing.input_per_1m +
         (tokens_out / 1_000_000) * pricing.output_per_1m;
}
