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

  it('total_time_saved_hours aggregates correctly', async () => {
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
    const expectedTotal = ts.entries.reduce((s, r) => s + r.time_saved_hours, 0);
    expect(ts.total_time_saved_hours).toBe(Math.round(expectedTotal * 100) / 100);
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
