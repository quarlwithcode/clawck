import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { makeTmpConfig } from './helpers';
import { createServer } from '../src/server/api';
import { Clawck } from '../src/core/clawck';
import express from 'express';

describe('Productivity Score', () => {
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

  it('score returns correct structure', async () => {
    await setup();

    const score = clawck.score({ days: 7 });

    expect(score).toHaveProperty('period_start');
    expect(score).toHaveProperty('period_end');
    expect(score).toHaveProperty('days');
    expect(score).toHaveProperty('total_agent_runtime_hours');
    expect(score).toHaveProperty('total_available_hours');
    expect(score).toHaveProperty('overall_utilization_percent');
    expect(score).toHaveProperty('busiest_category');
    expect(score).toHaveProperty('total_entries');
    expect(score).toHaveProperty('daily_average_hours');
    expect(score).toHaveProperty('trend');

    expect(Array.isArray(score.days)).toBe(true);
    expect(score.days.length).toBe(7);
  });

  it('score calculates utilization correctly', async () => {
    await setup();

    // Log a 4-hour task for today
    clawck.log({
      task: 'test task',
      duration_minutes: 240, // 4 hours
      category: 'code',
    });

    const score = clawck.score({ days: 1, available_hours_per_day: 8 });

    // Should be 50% utilization (4h / 8h available)
    expect(score.overall_utilization_percent).toBe(50);
    expect(score.total_agent_runtime_hours).toBeCloseTo(4, 0);
    expect(score.total_available_hours).toBe(8);
  });

  it('score identifies busiest category', async () => {
    await setup();

    // Log entries with different categories
    clawck.log({ task: 'code task 1', duration_minutes: 60, category: 'code' });
    clawck.log({ task: 'code task 2', duration_minutes: 60, category: 'code' });
    clawck.log({ task: 'code task 3', duration_minutes: 60, category: 'code' });
    clawck.log({ task: 'research task', duration_minutes: 60, category: 'research' });

    const score = clawck.score({ days: 1 });

    expect(score.busiest_category).toBe('code');
    expect(score.total_entries).toBe(4);
  });

  it('score respects available_hours_per_day option', async () => {
    await setup();

    clawck.log({ task: 'task', duration_minutes: 60, category: 'code' });

    const score4h = clawck.score({ days: 1, available_hours_per_day: 4 });
    const score8h = clawck.score({ days: 1, available_hours_per_day: 8 });

    // Same 1 hour of work, different available hours
    expect(score4h.overall_utilization_percent).toBe(25); // 1h / 4h
    expect(score8h.overall_utilization_percent).toBe(13); // 1h / 8h (rounded)
  });

  it('day scores include trend arrows', async () => {
    await setup();

    const score = clawck.score({ days: 3 });

    for (const day of score.days) {
      expect(['up', 'down', 'stable']).toContain(day.trend);
    }
  });

  it('API endpoint returns score', async () => {
    await setup();

    clawck.log({ task: 'test', duration_minutes: 120, category: 'research' });

    const res = await request(app).get('/api/score?days=7');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overall_utilization_percent');
    expect(res.body).toHaveProperty('days');
    expect(res.body).toHaveProperty('busiest_category');
  });

  it('API endpoint respects query params', async () => {
    await setup();

    clawck.log({ task: 'test', duration_minutes: 60, category: 'code' });

    const res = await request(app).get('/api/score?days=1&available_hours=4');
    expect(res.status).toBe(200);
    expect(res.body.days.length).toBe(1);
    // 1h / 4h available = 25%
    expect(res.body.overall_utilization_percent).toBe(25);
  });

  it('empty data returns zero utilization', async () => {
    await setup();

    const score = clawck.score({ days: 7 });

    expect(score.overall_utilization_percent).toBe(0);
    expect(score.total_agent_runtime_hours).toBe(0);
    expect(score.busiest_category).toBeNull();
  });
});
