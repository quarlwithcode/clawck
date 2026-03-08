import { describe, it, expect } from 'vitest';
import { INDUSTRY_BENCHMARKS, lookupBenchmark, getCategoryMedian, computeIndustryMultiplier } from '../src/core/benchmarks';
import { TASK_CATEGORIES } from '../src/core/types';

describe('Industry Benchmarks', () => {
  it('all 10 categories have at least one benchmark', () => {
    for (const cat of TASK_CATEGORIES) {
      const benchmarks = INDUSTRY_BENCHMARKS.filter(b => b.category === cat);
      expect(benchmarks.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every benchmark has valid structure', () => {
    for (const b of INDUSTRY_BENCHMARKS) {
      expect(b.category).toBeTruthy();
      expect(b.task_type).toBeTruthy();
      expect(b.human_median_minutes).toBeGreaterThan(0);
      expect(b.human_p25_minutes).toBeGreaterThan(0);
      expect(b.human_p75_minutes).toBeGreaterThan(0);
      expect(b.human_p25_minutes).toBeLessThanOrEqual(b.human_median_minutes);
      expect(b.human_p75_minutes).toBeGreaterThanOrEqual(b.human_median_minutes);
      expect(b.source).toBeTruthy();
      expect(b.year).toBeGreaterThan(2000);
    }
  });

  it('lookup by category returns correct data', () => {
    const result = lookupBenchmark('code');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('code');
  });

  it('lookup with keyword matching finds specific task', () => {
    const result = lookupBenchmark('code', 'Review this pull request');
    expect(result).not.toBeNull();
    expect(result!.task_type).toBe('pr_review');
  });

  it('lookup for nonexistent category-like input returns first match', () => {
    const result = lookupBenchmark('research', 'something unusual');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('research');
  });

  it('category median calculation is correct', () => {
    const median = getCategoryMedian('communication');
    // meeting_summary=30, status_report=45 → median = 37.5
    expect(median).toBe(37.5);
  });

  it('multiplier computation produces valid HumanEquivalent', () => {
    const equiv = computeIndustryMultiplier('code');
    expect(equiv.multiplier).toBeGreaterThan(0);
    expect(equiv.human_rate_usd).toBe(75);
  });
});
