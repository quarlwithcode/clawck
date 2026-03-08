import { describe, it, expect } from 'vitest';
import { estimateCost, getModelPricing, MODEL_PRICING } from '../src/core/pricing';

describe('pricing', () => {
  describe('getModelPricing', () => {
    it('returns pricing for known model prefix', () => {
      const pricing = getModelPricing('claude-sonnet-4-20250514');
      expect(pricing).not.toBeNull();
      expect(pricing!.input_per_1m).toBe(3);
      expect(pricing!.output_per_1m).toBe(15);
    });

    it('returns pricing for exact prefix match', () => {
      const pricing = getModelPricing('claude-opus-4');
      expect(pricing).not.toBeNull();
      expect(pricing!.input_per_1m).toBe(15);
    });

    it('returns null for unknown model', () => {
      expect(getModelPricing('gpt-4o')).toBeNull();
      expect(getModelPricing('unknown-model')).toBeNull();
    });

    it('matches haiku models', () => {
      const pricing = getModelPricing('claude-haiku-4-20250514');
      expect(pricing).not.toBeNull();
      expect(pricing!.input_per_1m).toBe(0.80);
    });
  });

  describe('estimateCost', () => {
    it('estimates cost for known model', () => {
      const cost = estimateCost('claude-sonnet-4-20250514', 1_000_000, 100_000);
      expect(cost).not.toBeNull();
      // 1M input * $3/1M + 100K output * $15/1M = $3 + $1.50 = $4.50
      expect(cost).toBeCloseTo(4.5, 2);
    });

    it('returns null for unknown model', () => {
      expect(estimateCost('unknown-model', 1000, 500)).toBeNull();
    });

    it('returns 0 for zero tokens', () => {
      const cost = estimateCost('claude-sonnet-4-20250514', 0, 0);
      expect(cost).toBe(0);
    });

    it('handles small token counts', () => {
      const cost = estimateCost('claude-sonnet-4-20250514', 1000, 500);
      expect(cost).not.toBeNull();
      expect(cost!).toBeGreaterThan(0);
      expect(cost!).toBeLessThan(0.1);
    });
  });

  describe('MODEL_PRICING', () => {
    it('has entries for claude model families', () => {
      expect(Object.keys(MODEL_PRICING).length).toBeGreaterThanOrEqual(6);
    });

    it('all entries have positive pricing', () => {
      for (const [, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.input_per_1m).toBeGreaterThan(0);
        expect(pricing.output_per_1m).toBeGreaterThan(0);
      }
    });
  });
});
