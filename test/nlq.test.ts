import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';
import { processNLQ, getAskHelp } from '../src/core/nlq';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

async function seedData(c: Clawck) {
  // Seed some entries for testing
  c.log({ task: 'Build website feature', duration_minutes: 120, project: 'website', client: 'acme', category: 'code', agent: 'agent-1' });
  c.log({ task: 'Research API options', duration_minutes: 60, project: 'api', client: 'acme', category: 'research', agent: 'agent-2' });
  c.log({ task: 'Write documentation', duration_minutes: 45, project: 'docs', client: 'globex', category: 'content', agent: 'agent-1' });
  c.log({ task: 'Fix bug in auth', duration_minutes: 30, project: 'website', client: 'acme', category: 'code', agent: 'agent-1' });
  c.log({ task: 'Design mockups', duration_minutes: 90, project: 'design', client: 'globex', category: 'design', agent: 'agent-3' });
}

// ─── Help Text ───────────────────────────────────────────────

describe('getAskHelp', () => {
  it('returns help text with example questions', () => {
    const help = getAskHelp();
    expect(help).toContain('Natural Language Queries');
    expect(help).toContain('How much time');
    expect(help).toContain('busiest day');
    expect(help.toLowerCase()).toContain('compare');
  });
});

// ─── Time on Project ─────────────────────────────────────────

describe('NLQ: time on project', () => {
  it('parses "how much time on project X" query', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('how much time on project website', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('time_on_project');
    expect(result.response).toContain('website');
    expect(result.data?.total_hours).toBeGreaterThan(0);
  });

  it('handles time period "this week"', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('how much time on website this week', c.database);
    expect(result.understood).toBe(true);
    expect(result.response).toContain('this week');
  });

  it('handles "how long" phrasing', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('how long did I spend on client acme', c.database);
    expect(result.understood).toBe(true);
    expect(result.data?.total_hours).toBeGreaterThan(0);
  });
});

// ─── Busiest Day/Project/Category ────────────────────────────

describe('NLQ: busiest queries', () => {
  it('parses "busiest day" query', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('what was my busiest day', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('busiest_day');
    expect(result.data?.date).toBeTruthy();
  });

  it('parses "busiest project" query', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('what was my busiest project', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('busiest_project');
    expect(result.data?.project).toBe('website'); // 2.5h total
  });

  it('parses "busiest category" query', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('what was my busiest category', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('busiest_category');
    expect(result.data?.category).toBe('code'); // 2.5h total
  });
});

// ─── Task Count ──────────────────────────────────────────────

describe('NLQ: task count', () => {
  it('parses "how many tasks today"', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('how many tasks today', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('task_count');
    expect(result.data?.count).toBe(5);
  });

  it('handles "entries" synonym', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('how many entries this week', c.database);
    expect(result.understood).toBe(true);
    expect(result.data?.count).toBe(5);
  });
});

// ─── Agent Work ──────────────────────────────────────────────

describe('NLQ: agent work', () => {
  it('parses "what did agent-1 work on"', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('what did agent-1 work on today', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('agent_work');
    expect(result.data?.entries.length).toBe(3); // agent-1 has 3 tasks
  });
});

// ─── Compare Projects ────────────────────────────────────────

describe('NLQ: compare projects', () => {
  it('parses "compare project A vs project B"', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('compare website vs api', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('compare_projects');
    expect(result.data?.website).toBeTruthy();
    expect(result.data?.api).toBeTruthy();
    expect(result.response).toContain('website');
    expect(result.response).toContain('api');
  });
});

// ─── Total Cost ──────────────────────────────────────────────

describe('NLQ: total cost', () => {
  it('parses "total cost this month"', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('total cost this month', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('total_cost');
    expect(result.data?.cost_usd).toBeDefined();
    expect(result.response).toContain('$');
  });

  it('handles "how much did I spend"', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('how much did I spend this week', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('total_cost');
  });
});

// ─── Most Productive Agent ───────────────────────────────────

describe('NLQ: most productive agent', () => {
  it('parses "who is the most productive agent"', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('who is the most productive agent', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('top_agent');
    expect(result.data?.agent).toBe('agent-1'); // Has 3.25h total
  });

  it('handles "top agent" phrasing', async () => {
    const c = await setup();
    await seedData(c);

    const result = processNLQ('which is the top agent this week', c.database);
    expect(result.understood).toBe(true);
    expect(result.query_type).toBe('top_agent');
  });
});

// ─── Unrecognized Queries ────────────────────────────────────

describe('NLQ: unrecognized', () => {
  it('returns suggestion for unknown queries', async () => {
    const c = await setup();

    const result = processNLQ('what is the meaning of life', c.database);
    expect(result.understood).toBe(false);
    expect(result.suggestion).toContain("don't understand");
    expect(result.suggestion).toContain('How much time');
  });
});
