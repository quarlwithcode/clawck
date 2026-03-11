import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { makeTmpConfig } from './helpers';
import { createServer } from '../src/server/api';
import { Clawck } from '../src/core/clawck';
import express from 'express';
import { v4 as uuid } from 'uuid';
import { SPEC_VERSION } from '../src/core/types';

describe('Category Trends', () => {
  let clawck: Clawck;
  let app: express.Express;

  async function setup() {
    const result = await createServer(makeTmpConfig());
    app = result.app;
    clawck = result.clawck;
  }

  afterEach(() => {
    try { clawck?.close(); } catch {}
  });

  it('trends returns correct structure', async () => {
    await setup();

    const trends = clawck.trends({ weeks: 4 });

    expect(trends).toHaveProperty('period_start');
    expect(trends).toHaveProperty('period_end');
    expect(trends).toHaveProperty('weeks');
    expect(trends).toHaveProperty('biggest_shift');
    expect(Array.isArray(trends.weeks)).toBe(true);
  });

  it('trends groups entries by week', async () => {
    await setup();

    // Add entries for current week
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const start = new Date(now.getTime() - i * 86400000);
      const end = new Date(start.getTime() + 3600000);
      clawck.upsert({
        id: uuid(),
        task: `task ${i}`,
        category: 'code',
        start: start.toISOString(),
        end: end.toISOString(),
        status: 'completed',
        agent: 'test', model: 'test', client: 'test', project: 'test',
        tokens_in: 0, tokens_out: 0, cost_usd: 0, tool_calls: 0,
        summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
        agent_runtime_ms: 3600000,
      });
    }

    const trends = clawck.trends({ weeks: 2 });

    expect(trends.weeks.length).toBeGreaterThan(0);
    const lastWeek = trends.weeks[trends.weeks.length - 1];
    expect(lastWeek.total_entries).toBe(3);
  });

  it('trends calculates category percentages', async () => {
    await setup();

    const now = new Date();
    // Add 2 code entries (2h) and 1 research entry (1h)
    const categories = ['code', 'code', 'research'];
    for (let i = 0; i < categories.length; i++) {
      const start = new Date(now.getTime() - i * 3600000);
      const end = new Date(start.getTime() + 3600000);
      clawck.upsert({
        id: uuid(),
        task: `task ${i}`,
        category: categories[i] as any,
        start: start.toISOString(),
        end: end.toISOString(),
        status: 'completed',
        agent: 'test', model: 'test', client: 'test', project: 'test',
        tokens_in: 0, tokens_out: 0, cost_usd: 0, tool_calls: 0,
        summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
        agent_runtime_ms: 3600000,
      });
    }

    const trends = clawck.trends({ weeks: 1 });
    const week = trends.weeks[trends.weeks.length - 1];

    const codeCat = week.categories.find(c => c.category === 'code');
    const researchCat = week.categories.find(c => c.category === 'research');

    expect(codeCat).toBeDefined();
    expect(researchCat).toBeDefined();
    expect(codeCat!.percentage).toBe(67); // 2/3
    expect(researchCat!.percentage).toBe(33); // 1/3
  });

  it('trends calculates week-over-week delta', async () => {
    await setup();

    // Week 1: 100% code
    const week1Start = new Date(Date.now() - 14 * 86400000);
    clawck.upsert({
      id: uuid(),
      task: 'week1 code',
      category: 'code',
      start: week1Start.toISOString(),
      end: new Date(week1Start.getTime() + 3600000).toISOString(),
      status: 'completed',
      agent: 'test', model: 'test', client: 'test', project: 'test',
      tokens_in: 0, tokens_out: 0, cost_usd: 0, tool_calls: 0,
      summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 3600000,
    });

    // Week 2: 50% code, 50% research
    const week2Start = new Date(Date.now() - 5 * 86400000);
    clawck.upsert({
      id: uuid(),
      task: 'week2 code',
      category: 'code',
      start: week2Start.toISOString(),
      end: new Date(week2Start.getTime() + 3600000).toISOString(),
      status: 'completed',
      agent: 'test', model: 'test', client: 'test', project: 'test',
      tokens_in: 0, tokens_out: 0, cost_usd: 0, tool_calls: 0,
      summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 3600000,
    });
    clawck.upsert({
      id: uuid(),
      task: 'week2 research',
      category: 'research',
      start: week2Start.toISOString(),
      end: new Date(week2Start.getTime() + 3600000).toISOString(),
      status: 'completed',
      agent: 'test', model: 'test', client: 'test', project: 'test',
      tokens_in: 0, tokens_out: 0, cost_usd: 0, tool_calls: 0,
      summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 3600000,
    });

    const trends = clawck.trends({ weeks: 3 });

    // Find week 2 and check delta
    const week2 = trends.weeks.find(w => w.week_number === 2);
    if (week2) {
      const codeCat = week2.categories.find(c => c.category === 'code');
      // Code went from 100% to 50%, so delta should be -50
      expect(codeCat?.delta_percent).toBe(-50);
    }
  });

  it('trends identifies biggest shift', async () => {
    await setup();

    // Week 1: 100% code
    const week1Start = new Date(Date.now() - 14 * 86400000);
    clawck.upsert({
      id: uuid(), task: 'w1', category: 'code',
      start: week1Start.toISOString(),
      end: new Date(week1Start.getTime() + 3600000).toISOString(),
      status: 'completed', agent: 'test', model: 'test', client: 'test', project: 'test',
      tokens_in: 0, tokens_out: 0, cost_usd: 0, tool_calls: 0,
      summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 3600000,
    });

    // Week 2: 100% research (big shift)
    const week2Start = new Date(Date.now() - 5 * 86400000);
    clawck.upsert({
      id: uuid(), task: 'w2', category: 'research',
      start: week2Start.toISOString(),
      end: new Date(week2Start.getTime() + 3600000).toISOString(),
      status: 'completed', agent: 'test', model: 'test', client: 'test', project: 'test',
      tokens_in: 0, tokens_out: 0, cost_usd: 0, tool_calls: 0,
      summary: '', tags: [], source: 'test', spec_version: SPEC_VERSION,
      agent_runtime_ms: 3600000,
    });

    const trends = clawck.trends({ weeks: 3 });

    expect(trends.biggest_shift).not.toBeNull();
    // Either code (down 100%) or research (up 100%)
    expect(Math.abs(trends.biggest_shift!.delta_percent)).toBe(100);
  });

  it('API endpoint returns trends', async () => {
    await setup();

    clawck.log({ task: 'test', duration_minutes: 60, category: 'code' });

    const res = await request(app).get('/api/trends?weeks=4');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('weeks');
    expect(res.body).toHaveProperty('biggest_shift');
  });

  it('empty data returns empty weeks', async () => {
    await setup();

    const trends = clawck.trends({ weeks: 4 });

    expect(trends.weeks.length).toBe(0);
    expect(trends.biggest_shift).toBeNull();
  });
});
