import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';
import { compareEntry, PersonalBaseline } from '../src/core/personal';
import { INDUSTRY_BENCHMARKS } from '../src/core/benchmarks';
import { ClawckEntry, SPEC_VERSION } from '../src/core/types';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(overrides = {}) {
  clawck = await new Clawck(makeTmpConfig(overrides)).ready();
  return clawck;
}

describe('Personal Baselines: CRUD', () => {
  it('add and list baselines', async () => {
    const c = await setup();
    const bl = c.addBaseline({
      category: 'code',
      task_type: 'code_review',
      description: 'Review a PR',
      my_minutes: 30,
    });
    expect(bl.id).toBeTruthy();
    expect(bl.category).toBe('code');
    expect(bl.task_type).toBe('code_review');
    expect(bl.my_minutes).toBe(30);

    const all = c.getBaselines();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(bl.id);
  });

  it('remove baseline', async () => {
    const c = await setup();
    const bl = c.addBaseline({ category: 'content', task_type: 'blog_post', my_minutes: 180 });
    expect(c.getBaselines().length).toBe(1);

    const removed = c.removeBaseline(bl.id);
    expect(removed).toBe(true);
    expect(c.getBaselines().length).toBe(0);
  });

  it('remove non-existent baseline returns false', async () => {
    const c = await setup();
    expect(c.removeBaseline('nonexistent')).toBe(false);
  });
});

describe('Personal Comparisons', () => {
  it('comparison with personal-only data', () => {
    const entry: ClawckEntry = {
      id: 'test-1', agent: 'agent', model: 'claude-sonnet-4', client: 'c', project: 'p',
      task: 'Review code', category: 'code', start: '2026-03-07T10:00:00Z',
      end: '2026-03-07T10:05:00Z', status: 'completed', tokens_in: 0, tokens_out: 0,
      cost_usd: 0, tool_calls: 0, summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 300000, // 5 minutes
    };

    const baselines: PersonalBaseline[] = [{
      id: 'b1', category: 'code', task_type: 'code_review',
      description: 'Review PR', my_minutes: 30,
      created_at: '', updated_at: '',
    }];

    const result = compareEntry(entry, baselines, [], 75);
    expect(result.agent_minutes).toBe(5);
    expect(result.personal_minutes).toBe(30);
    expect(result.personal_speedup).toBe(6);
    expect(result.personal_savings_usd).toBeGreaterThan(0);
  });

  it('comparison with industry-only data', () => {
    const entry: ClawckEntry = {
      id: 'test-2', agent: 'agent', model: 'claude-sonnet-4', client: 'c', project: 'p',
      task: 'Write a blog post', category: 'content', start: '2026-03-07T10:00:00Z',
      end: '2026-03-07T10:10:00Z', status: 'completed', tokens_in: 0, tokens_out: 0,
      cost_usd: 0, tool_calls: 0, summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 600000, // 10 minutes
    };

    const result = compareEntry(entry, [], INDUSTRY_BENCHMARKS, 50);
    expect(result.agent_minutes).toBe(10);
    expect(result.personal_minutes).toBeNull();
    expect(result.industry_median_minutes).toBeGreaterThan(0);
    expect(result.industry_speedup).toBeGreaterThan(0);
  });

  it('three-way comparison (agent + personal + industry)', () => {
    const entry: ClawckEntry = {
      id: 'test-3', agent: 'agent', model: 'claude-sonnet-4', client: 'c', project: 'p',
      task: 'Review code changes', category: 'code', start: '2026-03-07T10:00:00Z',
      end: '2026-03-07T10:05:00Z', status: 'completed', tokens_in: 0, tokens_out: 0,
      cost_usd: 0, tool_calls: 0, summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 300000,
    };

    const baselines: PersonalBaseline[] = [{
      id: 'b1', category: 'code', task_type: 'code_review',
      description: 'Review PR', my_minutes: 30,
      created_at: '', updated_at: '',
    }];

    const result = compareEntry(entry, baselines, INDUSTRY_BENCHMARKS, 75);
    expect(result.agent_minutes).toBe(5);
    expect(result.personal_minutes).toBe(30);
    expect(result.industry_median_minutes).toBeGreaterThan(0);
    expect(result.personal_speedup).not.toBeNull();
    expect(result.industry_speedup).not.toBeNull();
  });

  it('missing baseline returns null for personal fields', () => {
    const entry: ClawckEntry = {
      id: 'test-4', agent: 'agent', model: 'm', client: 'c', project: 'p',
      task: 'Random task', category: 'design', start: '2026-03-07T10:00:00Z',
      end: '2026-03-07T10:05:00Z', status: 'completed', tokens_in: 0, tokens_out: 0,
      cost_usd: 0, tool_calls: 0, summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 300000,
    };

    const result = compareEntry(entry, [], [], 50);
    expect(result.personal_minutes).toBeNull();
    expect(result.personal_speedup).toBeNull();
    expect(result.personal_savings_usd).toBeNull();
  });

  it('savings calculation correctness', () => {
    const entry: ClawckEntry = {
      id: 'test-5', agent: 'agent', model: 'm', client: 'c', project: 'p',
      task: 'code review', category: 'code', start: '2026-03-07T10:00:00Z',
      end: '2026-03-07T10:10:00Z', status: 'completed', tokens_in: 0, tokens_out: 0,
      cost_usd: 0, tool_calls: 0, summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 600000, // 10 min agent
    };

    const baselines: PersonalBaseline[] = [{
      id: 'b1', category: 'code', task_type: 'code_review',
      description: '', my_minutes: 70, // 70 min personal
      created_at: '', updated_at: '',
    }];

    const result = compareEntry(entry, baselines, [], 60); // $60/hr
    // Savings = (70 - 10) / 60 * 60 = $60
    expect(result.personal_savings_usd).toBe(60);
  });
});

describe('Clawck.compareEntryById', () => {
  it('returns comparison for existing entry', async () => {
    const c = await setup();
    const entry = c.log({ task: 'Review code', category: 'code', duration_minutes: 10, tokens_out: 400, tool_calls: 2 });
    c.addBaseline({ category: 'code', task_type: 'code_review', my_minutes: 30 });

    const result = c.compareEntryById(entry.id);
    expect(result).not.toBeNull();
    expect(result!.agent_minutes).toBeGreaterThan(0);
  });

  it('returns null for non-existent entry', async () => {
    const c = await setup();
    expect(c.compareEntryById('nonexistent')).toBeNull();
  });
});
