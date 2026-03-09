import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { estimateCost, DEFAULT_PRICING, MODEL_PRICING } from '../src/core/pricing';
import { makeTmpConfig, makeEntry } from './helpers';
import { generateTimesheetHTML } from '../src/reports/html';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

describe('Time Savings', () => {
  it('time_saved_hours = human_equiv_hours - agent_hours per row', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: 'code', // multiplier=6
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const row = ts.entries[0];
    expect(row.time_saved_hours).toBe(
      Math.round((row.human_equiv_hours - row.duration_minutes / 60) * 100) / 100
    );
  });

  it('total_time_saved_hours aggregates correctly for non-overlapping entries', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      id: 'ts1',
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: 'code',
    }));
    c.upsert(makeEntry({
      id: 'ts2',
      start: '2026-03-07T12:00:00.000Z',
      end: '2026-03-07T13:00:00.000Z',
      category: 'research',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    // Non-overlapping: merged runtime == additive total, so total_time_saved = sum of per-row
    const expectedTotal = ts.entries.reduce((s, r) => s + r.time_saved_hours, 0);
    expect(ts.total_time_saved_hours).toBe(Math.round(expectedTotal * 100) / 100);
  });

  it('total_time_saved_hours accounts for concurrent agents', async () => {
    const c = await setup();
    // 3 agents all running 10:00-10:30, category=code (multiplier 6)
    c.upsert(makeEntry({
      id: 'concurrent-1',
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T10:30:00.000Z',
      category: 'code',
    }));
    c.upsert(makeEntry({
      id: 'concurrent-2',
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T10:30:00.000Z',
      category: 'code',
    }));
    c.upsert(makeEntry({
      id: 'concurrent-3',
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T10:30:00.000Z',
      category: 'code',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');

    // Additive hours: 3 * 0.5 = 1.5h
    // Human equiv: 1.5 * 6 = 9h
    // Merged runtime: 0.5h (all overlap)
    // Time saved = human_equiv - merged = 9 - 0.5 = 8.5
    expect(ts.total_agent_merged_runtime_hours).toBe(0.5);
    expect(ts.total_human_equiv_hours).toBe(9);
    expect(ts.total_time_saved_hours).toBe(8.5);

    // Per-row time_saved still uses individual calculation
    for (const row of ts.entries) {
      expect(row.time_saved_hours).toBe(
        Math.round((row.human_equiv_hours - row.duration_minutes / 60) * 100) / 100
      );
    }
  });

  it('timesheet includes total_tokens_in and total_tokens_out', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      tokens_in: 5000,
      tokens_out: 2000,
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.total_tokens_in).toBe(5000);
    expect(ts.total_tokens_out).toBe(2000);
    expect(ts.total_tokens).toBe(7000);
  });

  it('rows include tokens_in and tokens_out', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      tokens_in: 3000,
      tokens_out: 1500,
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.entries[0].tokens_in).toBe(3000);
    expect(ts.entries[0].tokens_out).toBe(1500);
    expect(ts.entries[0].tokens_total).toBe(4500);
  });
});

describe('Cost Auto-Estimation', () => {
  it('known model produces correct cost', () => {
    // claude-sonnet-4: 3/1M input, 15/1M output
    const cost = estimateCost('claude-sonnet-4-20250514', 1_000_000, 100_000);
    expect(cost).toBeCloseTo(3 + 1.5, 4);
  });

  it('unknown model returns null without fallback', () => {
    const cost = estimateCost('mystery-model', 1_000_000, 100_000);
    expect(cost).toBeNull();
  });

  it('unknown model uses fallback pricing when useFallback=true', () => {
    const cost = estimateCost('mystery-model', 1_000_000, 100_000, true);
    expect(cost).not.toBeNull();
    // DEFAULT_PRICING: 3/1M input, 15/1M output (same as Sonnet)
    expect(cost).toBeCloseTo(3 + 1.5, 4);
  });

  it('zero tokens produce zero cost even with fallback', () => {
    const cost = estimateCost('mystery-model', 0, 0, true);
    expect(cost).toBe(0);
  });

  it('hook-provided cost_usd is used directly', async () => {
    const c = await setup();
    const entry = c.start({ task: 'test', model: 'claude-sonnet-4' });
    c.stop({ id: entry.id, cost_usd: 1.23, tokens_in: 5000, tokens_out: 2000 });
    const updated = c.get(entry.id);
    expect(updated?.cost_usd).toBe(1.23);
  });

  it('auto-estimates cost when cost_usd is 0 and tokens exist', async () => {
    const c = await setup();
    const entry = c.start({ task: 'test', model: 'claude-sonnet-4' });
    c.stop({ id: entry.id, cost_usd: 0, tokens_in: 1_000_000, tokens_out: 100_000 });
    const updated = c.get(entry.id);
    expect(updated?.cost_usd).toBeGreaterThan(0);
  });

  it('auto-estimates with fallback for unknown model', async () => {
    const c = await setup();
    const entry = c.start({ task: 'test', model: 'unknown-model-xyz' });
    c.stop({ id: entry.id, cost_usd: 0, tokens_in: 1_000_000, tokens_out: 100_000 });
    const updated = c.get(entry.id);
    // With fallback pricing, should be non-zero
    expect(updated?.cost_usd).toBeGreaterThan(0);
  });
});

describe('Token/Cost Estimation Fallbacks', () => {
  it('stop() reverse-estimates tokens from wall clock when no token data', async () => {
    const c = await setup();
    // Use upsert to create entry with a backdated start (60s ago)
    c.upsert(makeEntry({
      id: 'hook-est-1',
      start: new Date(Date.now() - 60000).toISOString(),
      end: null as any,
      status: 'running',
      model: 'claude-sonnet-4',
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      tool_calls: 0,
    }));
    // Simulate hook stop: no tokens, no cost
    c.stop({ id: 'hook-est-1' });
    const updated = c.get('hook-est-1');
    expect(updated?.tokens_out).toBeGreaterThan(0);
    expect(updated?.cost_usd).toBeGreaterThan(0);
  });

  it('stop() does NOT override explicit tokens with estimate', async () => {
    const c = await setup();
    const entry = c.start({ task: 'explicit-test', model: 'claude-sonnet-4' });
    c.stop({ id: entry.id, tokens_in: 5000, tokens_out: 2000 });
    const updated = c.get(entry.id);
    expect(updated?.tokens_in).toBe(5000);
    expect(updated?.tokens_out).toBe(2000);
  });

  it('log() estimates cost from tokens when cost_usd absent', async () => {
    const c = await setup();
    const entry = c.log({
      task: 'log-cost-test',
      duration_minutes: 10,
      model: 'claude-sonnet-4',
      tokens_in: 100000,
      tokens_out: 50000,
    });
    expect(entry.cost_usd).toBeGreaterThan(0);
  });

  it('log() preserves explicit cost_usd', async () => {
    const c = await setup();
    const entry = c.log({
      task: 'log-explicit-cost',
      duration_minutes: 10,
      model: 'claude-sonnet-4',
      tokens_in: 100000,
      tokens_out: 50000,
      cost_usd: 1.23,
    });
    expect(entry.cost_usd).toBe(1.23);
  });
});

describe('HTML Report: Time Saved and Timeline', () => {
  it('HTML includes Time Saved card', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08' });
    expect(html).toContain('Time Saved');
    expect(html).toContain('hrs');
  });

  it('HTML shows token breakdown (in/out)', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      tokens_in: 5000,
      tokens_out: 2000,
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08' });
    expect(html).toContain('Tokens In');
    expect(html).toContain('Tokens Out');
    expect(html).toContain('5,000');
    expect(html).toContain('2,000');
  });

  it('timeline entries within a date are newest-first', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      id: 'early',
      start: '2026-03-07T08:00:00.000Z',
      end: '2026-03-07T09:00:00.000Z',
      task: 'early-task',
    }));
    c.upsert(makeEntry({
      id: 'late',
      start: '2026-03-07T14:00:00.000Z',
      end: '2026-03-07T15:00:00.000Z',
      task: 'late-task',
    }));
    const rawEntries = c.query({ from: '2026-03-07T00:00:00.000Z', to: '2026-03-08T00:00:00.000Z' });
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', rawEntries });
    const lateIdx = html.indexOf('late-task');
    const earlyIdx = html.indexOf('early-task');
    // late-task should appear before early-task in the timeline
    expect(lateIdx).toBeLessThan(earlyIdx);
  });
});
