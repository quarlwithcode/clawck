import { describe, it, expect } from 'vitest';
import { resolvePeriod } from '../src/reports/periods';

describe('resolvePeriod', () => {
  it('period=day returns start of today', () => {
    const result = resolvePeriod({ period: 'day' });
    const fromDate = new Date(result.from);
    const now = new Date();
    expect(fromDate.getFullYear()).toBe(now.getFullYear());
    expect(fromDate.getMonth()).toBe(now.getMonth());
    expect(fromDate.getDate()).toBe(now.getDate());
    expect(fromDate.getHours()).toBe(0);
    expect(fromDate.getMinutes()).toBe(0);
    expect(result.period).toBe('day');
  });

  it('period=week returns 7 days ago at midnight', () => {
    const result = resolvePeriod({ period: 'week' });
    const fromDate = new Date(result.from);
    const expected = new Date(Date.now() - 7 * 86400000);
    expected.setHours(0, 0, 0, 0);
    expect(fromDate.getTime()).toBe(expected.getTime());
    expect(result.period).toBe('week');
  });

  it('period=month returns 1st of current month', () => {
    const result = resolvePeriod({ period: 'month' });
    const fromDate = new Date(result.from);
    const now = new Date();
    expect(fromDate.getFullYear()).toBe(now.getFullYear());
    expect(fromDate.getMonth()).toBe(now.getMonth());
    expect(fromDate.getDate()).toBe(1);
    expect(result.period).toBe('month');
  });

  it('period=year returns Jan 1 of current year', () => {
    const result = resolvePeriod({ period: 'year' });
    const fromDate = new Date(result.from);
    const now = new Date();
    expect(fromDate.getFullYear()).toBe(now.getFullYear());
    expect(fromDate.getMonth()).toBe(0);
    expect(fromDate.getDate()).toBe(1);
    expect(result.period).toBe('year');
  });

  it('--from/--to gives custom range', () => {
    const result = resolvePeriod({ from: '2026-01-01', to: '2026-01-31' });
    expect(result.period).toBe('custom');
    expect(new Date(result.from).toISOString()).toContain('2026-01-01');
    expect(new Date(result.to).toISOString()).toContain('2026-01-31');
  });

  it('--days 14 backward compat', () => {
    const result = resolvePeriod({ days: 14 });
    expect(result.period).toBe('custom');
    const fromMs = new Date(result.from).getTime();
    const toMs = new Date(result.to).getTime();
    const diffDays = (toMs - fromMs) / 86400000;
    expect(diffDays).toBeCloseTo(14, 0);
  });

  it('no args defaults to week', () => {
    const result = resolvePeriod({});
    expect(result.period).toBe('week');
    const fromDate = new Date(result.from);
    const expected = new Date(Date.now() - 7 * 86400000);
    expected.setHours(0, 0, 0, 0);
    expect(fromDate.getTime()).toBe(expected.getTime());
  });

  it('period=custom without from/to throws', () => {
    expect(() => resolvePeriod({ period: 'custom' })).toThrow();
  });
});
