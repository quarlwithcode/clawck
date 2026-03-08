import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { DEFAULT_HUMAN_EQUIVALENTS } from '../src/core/types';
import { makeTmpConfig } from './helpers';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

// ─── Lifecycle: start -> stop ─────────────────────────────

describe('Clawck lifecycle: start -> stop', () => {
  it('start creates a running entry with correct defaults', async () => {
    const c = await setup();
    const entry = c.start({ task: 'build feature' });
    expect(entry.id).toBeTruthy();
    expect(entry.status).toBe('running');
    expect(entry.end).toBeNull();
    expect(entry.task).toBe('build feature');
    expect(entry.start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.tokens_in).toBe(0);
    expect(entry.tokens_out).toBe(0);
  });

  it('stop transitions to completed with end timestamp and metadata', async () => {
    const c = await setup();
    const started = c.start({ task: 'do stuff' });
    const stopped = c.stop({
      id: started.id,
      summary: 'done',
      tokens_in: 500,
      tokens_out: 1000,
      cost_usd: 0.05,
      tool_calls: 10,
    });
    expect(stopped).not.toBeNull();
    expect(stopped!.status).toBe('completed');
    expect(stopped!.end).toBeTruthy();
    expect(stopped!.summary).toBe('done');
    expect(stopped!.tokens_in).toBe(500);
    expect(stopped!.tokens_out).toBe(1000);
    expect(stopped!.cost_usd).toBe(0.05);
    expect(stopped!.tool_calls).toBe(10);
  });

  it('stop with status=failed marks as failed', async () => {
    const c = await setup();
    const started = c.start({ task: 'failing task' });
    const stopped = c.stop({ id: started.id, status: 'failed' });
    expect(stopped!.status).toBe('failed');
  });

  it('stop returns null for nonexistent id', async () => {
    const c = await setup();
    const result = c.stop({ id: 'nonexistent-id' });
    expect(result).toBeNull();
  });

  it('running() returns only running entries', async () => {
    const c = await setup();
    const r1 = c.start({ task: 'running-1' });
    const r2 = c.start({ task: 'running-2' });
    c.stop({ id: r1.id });
    const running = c.running();
    expect(running).toHaveLength(1);
    expect(running[0].id).toBe(r2.id);
  });
});

// ─── Duration verification ───────────────────────────────

describe('Clawck: duration verification', () => {
  it('start -> wait -> stop produces valid duration >= 50ms', async () => {
    const c = await setup();
    const entry = c.start({ task: 'duration test' });
    await new Promise(r => setTimeout(r, 60));
    const stopped = c.stop({ id: entry.id });
    expect(stopped).not.toBeNull();
    expect(stopped!.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(stopped!.end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const durationMs = new Date(stopped!.end!).getTime() - new Date(stopped!.start).getTime();
    expect(durationMs).toBeGreaterThanOrEqual(50);
  });
});

// ─── Cost flow-through to timesheet ──────────────────────

describe('Clawck: cost flow-through to timesheet', () => {
  it('stop() cost and tokens flow into timesheet totals', async () => {
    const c = await setup();
    const entry = c.start({ task: 'cost flow test' });
    c.stop({
      id: entry.id,
      tokens_in: 5000,
      tokens_out: 2000,
      cost_usd: 0.25,
    });
    const from = new Date(Date.now() - 3600000).toISOString();
    const to = new Date(Date.now() + 3600000).toISOString();
    const ts = c.timesheet(from, to);
    expect(ts.total_cost_usd).toBeCloseTo(0.25, 2);
    expect(ts.total_tokens).toBe(7000);
  });
});

// ─── Seed validation ─────────────────────────────────────

describe('Clawck: seed validation', () => {
  it('logging 10 entries produces 10 completed entries with valid timestamps', async () => {
    const c = await setup();
    for (let i = 0; i < 10; i++) {
      c.log({
        task: `seed task ${i}`,
        duration_minutes: 10 + i,
        project: 'test-proj',
        client: 'test-client',
        agent: 'test-agent',
        model: 'test-model',
      });
    }
    const entries = c.query();
    expect(entries).toHaveLength(10);
    for (const e of entries) {
      expect(e.status).toBe('completed');
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(e.end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

// ─── Timestamp audit trail ───────────────────────────────

describe('Clawck: timestamp audit trail', () => {
  it('created_at and updated_at are present on new entries', async () => {
    const c = await setup();
    const entry = c.start({ task: 'timestamp test' });
    const fetched = c.get(entry.id);
    expect(fetched!.created_at).toBeTruthy();
    expect(fetched!.updated_at).toBeTruthy();
  });

  it('updated_at changes on update, created_at stays the same', async () => {
    const c = await setup();
    const entry = c.start({ task: 'audit trail' });
    const original = c.get(entry.id);
    const originalCreated = original!.created_at;
    const originalUpdated = original!.updated_at;

    // Wait a moment so timestamps differ
    await new Promise(r => setTimeout(r, 1100));

    c.update(entry.id, { summary: 'updated' });
    const updated = c.get(entry.id);
    expect(updated!.created_at).toBe(originalCreated);
    expect(updated!.updated_at).not.toBe(originalUpdated);
  });
});

// ─── Lifecycle: log (retroactive) ─────────────────────────

describe('Clawck lifecycle: log (retroactive)', () => {
  it('log creates completed entry with calculated start/end matching duration', async () => {
    const c = await setup();
    const before = Date.now();
    const entry = c.log({ task: 'past work', duration_minutes: 30 });
    const after = Date.now();
    expect(entry.status).toBe('completed');
    expect(entry.end).toBeTruthy();
    const endMs = new Date(entry.end!).getTime();
    const startMs = new Date(entry.start).getTime();
    expect(endMs - startMs).toBeCloseTo(30 * 60000, -3);
    expect(endMs).toBeGreaterThanOrEqual(before);
    expect(endMs).toBeLessThanOrEqual(after + 100);
  });

  it('log applies all optional fields', async () => {
    const c = await setup();
    const entry = c.log({
      task: 'detailed task',
      duration_minutes: 15,
      project: 'proj-x',
      client: 'client-y',
      category: 'research',
      agent: 'agent-z',
      model: 'claude-4',
      tokens_in: 1000,
      tokens_out: 2000,
      cost_usd: 0.10,
      tool_calls: 20,
      summary: 'did research',
      tags: ['urgent', 'billing'],
    });
    expect(entry.project).toBe('proj-x');
    expect(entry.client).toBe('client-y');
    expect(entry.category).toBe('research');
    expect(entry.agent).toBe('agent-z');
    expect(entry.model).toBe('claude-4');
    expect(entry.tokens_in).toBe(1000);
    expect(entry.tokens_out).toBe(2000);
    expect(entry.cost_usd).toBe(0.10);
    expect(entry.tool_calls).toBe(20);
    expect(entry.summary).toBe('did research');
    expect(entry.tags).toEqual(['urgent', 'billing']);
  });
});

// ─── Update and Delete ────────────────────────────────────

describe('Clawck: update and delete', () => {
  it('update modifies specific fields, leaves others unchanged', async () => {
    const c = await setup();
    const entry = c.start({ task: 'original task' });
    const updated = c.update(entry.id, { summary: 'updated summary' });
    expect(updated).not.toBeNull();
    expect(updated!.summary).toBe('updated summary');
    expect(updated!.task).toBe('original task');
  });

  it('update returns null for nonexistent id', async () => {
    const c = await setup();
    const result = c.update('no-such-id', { summary: 'nope' });
    expect(result).toBeNull();
  });

  it('delete removes an entry', async () => {
    const c = await setup();
    const entry = c.start({ task: 'to delete' });
    expect(c.delete(entry.id)).toBe(true);
    expect(c.get(entry.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    const c = await setup();
    expect(c.delete('no-such-id')).toBe(false);
  });

  it('findByPrefix matches entries, returns empty for no match', async () => {
    const c = await setup();
    const entry = c.start({ task: 'prefix test' });
    const prefix = entry.id.substring(0, 8);
    const results = c.findByPrefix(prefix);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe(entry.id);
    expect(c.findByPrefix('zzz-no-match')).toHaveLength(0);
  });
});

// ─── Query and Filtering ─────────────────────────────────

describe('Clawck: query and filtering', () => {
  it('query by client', async () => {
    const c = await setup();
    c.log({ task: 't1', duration_minutes: 5, client: 'acme' });
    c.log({ task: 't2', duration_minutes: 5, client: 'globex' });
    const results = c.query({ client: 'acme' });
    expect(results).toHaveLength(1);
    expect(results[0].client).toBe('acme');
  });

  it('query by project', async () => {
    const c = await setup();
    c.log({ task: 't1', duration_minutes: 5, project: 'alpha' });
    c.log({ task: 't2', duration_minutes: 5, project: 'beta' });
    expect(c.query({ project: 'beta' })).toHaveLength(1);
  });

  it('query by agent', async () => {
    const c = await setup();
    c.log({ task: 't1', duration_minutes: 5, agent: 'bot-1' });
    c.log({ task: 't2', duration_minutes: 5, agent: 'bot-2' });
    expect(c.query({ agent: 'bot-1' })).toHaveLength(1);
  });

  it('query by status', async () => {
    const c = await setup();
    c.start({ task: 'still running' });
    c.log({ task: 'done', duration_minutes: 5 });
    expect(c.query({ status: 'running' })).toHaveLength(1);
    expect(c.query({ status: 'completed' })).toHaveLength(1);
  });

  it('query filters by date range (from/to)', async () => {
    const c = await setup();
    c.log({ task: 'old', duration_minutes: 5 }); // uses current time
    // Insert an entry with explicit old start via upsert
    const { makeEntry } = await import('./helpers');
    c.upsert(makeEntry({ start: '2025-01-01T00:00:00.000Z', end: '2025-01-01T01:00:00.000Z' }));
    const recent = c.query({ from: '2026-01-01T00:00:00.000Z' });
    expect(recent.length).toBeGreaterThanOrEqual(1);
    expect(recent.every(e => e.start >= '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('query respects limit parameter', async () => {
    const c = await setup();
    for (let i = 0; i < 5; i++) c.log({ task: `task-${i}`, duration_minutes: 1 });
    expect(c.query({ limit: 2 })).toHaveLength(2);
  });

  it('query with no filters returns all', async () => {
    const c = await setup();
    c.log({ task: 'a', duration_minutes: 1 });
    c.log({ task: 'b', duration_minutes: 1 });
    c.log({ task: 'c', duration_minutes: 1 });
    expect(c.query()).toHaveLength(3);
  });
});

// ─── Timesheet ────────────────────────────────────────────

describe('Clawck: timesheet', () => {
  it('calculates correct totals', async () => {
    const c = await setup();
    const { makeEntry } = await import('./helpers');
    // 1-hour entry: code category, cost $0.05, 300 tokens total
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: 'code',
      cost_usd: 0.05,
      tokens_in: 100,
      tokens_out: 200,
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.total_entries).toBe(1);
    expect(ts.total_agent_hours).toBeCloseTo(1, 1);
    expect(ts.total_cost_usd).toBeCloseTo(0.05, 2);
    expect(ts.total_tokens).toBe(300);
  });

  it('computes human_equiv_hours using category multipliers', async () => {
    const c = await setup();
    const { makeEntry } = await import('./helpers');
    // 1-hour code entry: multiplier = 6
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      category: 'code',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.total_human_equiv_hours).toBeCloseTo(6, 1);
    // cost saved = 6 hours * $75/hr = $450
    expect(ts.total_savings_usd).toBeCloseTo(450, 0);
  });

  it('groups by_client, by_project, by_agent, by_category', async () => {
    const c = await setup();
    const { makeEntry } = await import('./helpers');
    c.upsert(makeEntry({ client: 'acme', project: 'p1', agent: 'bot-1', category: 'code',
      start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
    c.upsert(makeEntry({ client: 'globex', project: 'p2', agent: 'bot-2', category: 'research',
      start: '2026-03-07T12:00:00.000Z', end: '2026-03-07T13:00:00.000Z' }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    expect(ts.by_client).toHaveLength(2);
    expect(ts.by_project).toHaveLength(2);
    expect(ts.by_agent).toHaveLength(2);
    expect(ts.by_category).toHaveLength(2);
  });

  it('filters by client/project/agent', async () => {
    const c = await setup();
    const { makeEntry } = await import('./helpers');
    c.upsert(makeEntry({ client: 'acme', start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
    c.upsert(makeEntry({ client: 'globex', start: '2026-03-07T12:00:00.000Z', end: '2026-03-07T13:00:00.000Z' }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z', { client: 'acme' });
    expect(ts.total_entries).toBe(1);
    expect(ts.by_client).toHaveLength(1);
    expect(ts.by_client[0].client).toBe('acme');
  });
});

// ─── Metadata ─────────────────────────────────────────────

describe('Clawck: metadata', () => {
  it('clients(), projects(), agents() return distinct sorted values', async () => {
    const c = await setup();
    c.log({ task: 't', duration_minutes: 1, client: 'beta', project: 'z-proj', agent: 'bot-b' });
    c.log({ task: 't', duration_minutes: 1, client: 'alpha', project: 'a-proj', agent: 'bot-a' });
    c.log({ task: 't', duration_minutes: 1, client: 'alpha', project: 'a-proj', agent: 'bot-a' });
    expect(c.clients()).toEqual(['alpha', 'beta']);
    expect(c.projects()).toEqual(['a-proj', 'z-proj']);
    expect(c.agents()).toEqual(['bot-a', 'bot-b']);
  });

  it('stats() returns correct aggregate counts', async () => {
    const c = await setup();
    c.start({ task: 'running' });
    c.log({ task: 'done', duration_minutes: 1, client: 'c1', project: 'p1', agent: 'a1' });
    const stats = c.stats();
    expect(stats.total_entries).toBe(2);
    expect(stats.running).toBe(1);
    expect(stats.clients).toBeGreaterThanOrEqual(1);
    expect(stats.projects).toBeGreaterThanOrEqual(1);
    expect(stats.agents).toBeGreaterThanOrEqual(1);
  });
});

// ─── Config Defaults ──────────────────────────────────────

describe('Clawck: config defaults', () => {
  it('uses config defaults when optional fields not provided', async () => {
    const c = await setup({
      default_client: 'cfg-client',
      default_project: 'cfg-project',
      default_agent: 'cfg-agent',
      default_model: 'cfg-model',
      default_source: 'cfg-source',
    });
    const entry = c.start({ task: 'test defaults' });
    expect(entry.client).toBe('cfg-client');
    expect(entry.project).toBe('cfg-project');
    expect(entry.agent).toBe('cfg-agent');
    expect(entry.model).toBe('cfg-model');
    expect(entry.source).toBe('cfg-source');
  });

  it('explicit input overrides config defaults', async () => {
    const c = await setup({
      default_client: 'cfg-client',
      default_project: 'cfg-project',
    });
    const entry = c.start({ task: 'override test', client: 'explicit-client', project: 'explicit-project' });
    expect(entry.client).toBe('explicit-client');
    expect(entry.project).toBe('explicit-project');
  });
});
