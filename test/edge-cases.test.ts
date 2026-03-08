import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { DEFAULT_HUMAN_EQUIVALENTS } from '../src/core/types';
import { makeTmpConfig, makeEntry } from './helpers';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

// ─── Database Integrity ──────────────────────────────────

describe('Database integrity', () => {
  it('tags JSON roundtrip (array -> stored -> array)', async () => {
    const c = await setup();
    const entry = c.log({ task: 'tags test', duration_minutes: 1, tags: ['a', 'b', 'c'] });
    const fetched = c.get(entry.id);
    expect(fetched!.tags).toEqual(['a', 'b', 'c']);
    expect(Array.isArray(fetched!.tags)).toBe(true);
  });

  it('empty tags roundtrip', async () => {
    const c = await setup();
    const entry = c.log({ task: 'no tags', duration_minutes: 1, tags: [] });
    const fetched = c.get(entry.id);
    expect(fetched!.tags).toEqual([]);
  });

  it('end=null preserved for running entries', async () => {
    const c = await setup();
    const entry = c.start({ task: 'still going' });
    const fetched = c.get(entry.id);
    expect(fetched!.end).toBeNull();
    expect(fetched!.status).toBe('running');
  });

  it('special characters in task/summary survive storage', async () => {
    const c = await setup();
    const special = 'Hello "world" <b>bold</b> & \'quotes\' 日本語 🦀';
    const entry = c.log({ task: special, duration_minutes: 1, summary: special });
    const fetched = c.get(entry.id);
    expect(fetched!.task).toBe(special);
    expect(fetched!.summary).toBe(special);
  });

  it('concurrent entries get unique IDs', async () => {
    const c = await setup();
    const entries = Array.from({ length: 20 }, (_, i) =>
      c.start({ task: `concurrent-${i}` })
    );
    const ids = new Set(entries.map(e => e.id));
    expect(ids.size).toBe(20);
  });
});

// ─── Timesheet Edge Cases ────────────────────────────────

describe('Timesheet edge cases', () => {
  it('empty timesheet returns zero totals', async () => {
    const c = await setup();
    const ts = c.timesheet('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    expect(ts.total_entries).toBe(0);
    expect(ts.total_agent_hours).toBe(0);
    expect(ts.total_human_equiv_hours).toBe(0);
    expect(ts.total_cost_usd).toBe(0);
    expect(ts.total_savings_usd).toBe(0);
    expect(ts.total_tokens).toBe(0);
    expect(ts.entries).toHaveLength(0);
  });

  it('running entry uses current time for duration calculation', async () => {
    const c = await setup();
    // Insert a running entry that started 30 minutes ago
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();
    c.upsert(makeEntry({
      start: thirtyMinAgo,
      end: null,
      status: 'running',
    }));
    const ts = c.timesheet(
      new Date(Date.now() - 3600000).toISOString(),
      new Date(Date.now() + 3600000).toISOString()
    );
    expect(ts.total_entries).toBe(1);
    // Duration should be ~30 minutes = ~0.5 hours
    expect(ts.total_agent_hours).toBeGreaterThan(0.4);
    expect(ts.total_agent_hours).toBeLessThan(0.6);
  });

  it('correct multiplier per category (data_entry=20x, design=5x)', async () => {
    const c = await setup();
    // 1-hour data_entry entry
    c.upsert(makeEntry({
      id: 'de-1',
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: 'data_entry',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.total_human_equiv_hours).toBeCloseTo(20, 1);

    // Now test design
    const c2 = await new Clawck(makeTmpConfig()).ready();
    c2.upsert(makeEntry({
      id: 'dsgn-1',
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: 'design',
    }));
    const ts2 = c2.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts2.total_human_equiv_hours).toBeCloseTo(5, 1);
    c2.close();
  });

  it('cost savings = human_equiv_hours * human_rate_usd', async () => {
    const c = await setup();
    // 1-hour research entry: multiplier=12, rate=$50 -> savings = 12 * $50 = $600
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: 'research',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.total_savings_usd).toBeCloseTo(600, 0);
  });
});

// ─── Missing Multiplier Categories ───────────────────────

describe('Multiplier categories (parameterized)', () => {
  const cases: [string, number][] = [
    ['content', 10],
    ['communication', 8],
    ['analysis', 10],
    ['testing', 8],
    ['planning', 6],
    ['other', 8],
  ];

  it.each(cases)('%s category has multiplier %d', async (category, expectedMultiplier) => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: category as any,
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.total_human_equiv_hours).toBeCloseTo(expectedMultiplier, 1);
  });
});

// ─── Mixed Running + Completed in Timesheet ──────────────

describe('Mixed running + completed in timesheet', () => {
  it('timesheet includes both running and completed entries', async () => {
    const c = await setup();
    // 1-hour completed entry
    c.upsert(makeEntry({
      id: 'completed-1',
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      status: 'completed',
    }));
    // Running entry started 30 min ago
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();
    c.upsert(makeEntry({
      id: 'running-1',
      start: thirtyMinAgo,
      end: null,
      status: 'running',
    }));
    const ts = c.timesheet(
      '2026-03-07T00:00:00.000Z',
      new Date(Date.now() + 3600000).toISOString()
    );
    expect(ts.total_entries).toBe(2);
  });
});

// ─── Query Edge Cases ─────────────────────────────────────

describe('Query edge cases', () => {
  it('combined filters return correct intersection', async () => {
    const c = await setup();
    c.log({ task: 'match', duration_minutes: 1, client: 'acme', agent: 'bot-1' });
    c.log({ task: 'no-client', duration_minutes: 1, client: 'other', agent: 'bot-1' });
    c.log({ task: 'no-agent', duration_minutes: 1, client: 'acme', agent: 'bot-2' });
    const results = c.query({ client: 'acme', agent: 'bot-1' });
    expect(results).toHaveLength(1);
    expect(results[0].task).toBe('match');
  });

  it('findByPrefix returns max 10 results', async () => {
    const c = await setup();
    for (let i = 0; i < 15; i++) {
      c.upsert(makeEntry({ id: `prefix-test-${i}` }));
    }
    const results = c.findByPrefix('prefix-test-');
    expect(results.length).toBeLessThanOrEqual(10);
  });
});

// ─── Ingest Resilience ────────────────────────────────────

describe('Ingest resilience', () => {
  it('minimal entry with only required fields', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      id: 'minimal-1',
      agent: 'a',
      model: 'unknown',
      client: 'default',
      project: 'default',
      task: 'min',
      category: 'other',
      start: '2026-03-07T10:00:00.000Z',
      end: null,
      status: 'running',
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      tool_calls: 0,
      summary: '',
      tags: [],
      source: 'test',
      spec_version: '0.1.0',
    }));
    const fetched = c.get('minimal-1');
    expect(fetched).not.toBeNull();
    expect(fetched!.task).toBe('min');
  });

  it('duplicate IDs in same batch (last write wins)', async () => {
    const c = await setup();
    const db = c.database;
    const entries = [
      makeEntry({ id: 'dup-1', summary: 'first' }),
      makeEntry({ id: 'dup-1', summary: 'second' }),
    ];
    db.bulkUpsert(entries);
    const fetched = c.get('dup-1');
    expect(fetched!.summary).toBe('second');
  });

  it('two Clawck instances with different data_dirs are independent', async () => {
    const c1 = await new Clawck(makeTmpConfig()).ready();
    const c2 = await new Clawck(makeTmpConfig()).ready();

    c1.log({ task: 'only-in-c1', duration_minutes: 1 });
    c2.log({ task: 'only-in-c2', duration_minutes: 1 });

    expect(c1.query()).toHaveLength(1);
    expect(c1.query()[0].task).toBe('only-in-c1');
    expect(c2.query()).toHaveLength(1);
    expect(c2.query()[0].task).toBe('only-in-c2');

    c1.close();
    c2.close();
  });
});
