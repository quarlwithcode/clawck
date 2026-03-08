import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';
import { generateTimesheetHTML } from '../src/reports/html';
import { generateTimesheetPDF } from '../src/reports/pdf';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(overrides = {}) {
  clawck = await new Clawck(makeTmpConfig(overrides)).ready();
  return clawck;
}

describe('Demo seed', () => {
  it('creates entries with agent_runtime_ms', async () => {
    const c = await setup();

    // Simulate demo seeding
    c.upsert({
      id: uuid(), task: 'Demo task', project: 'demo', client: 'demo',
      category: 'code', agent: 'demo-agent', model: 'claude-sonnet-4',
      start: new Date(Date.now() - 3600000).toISOString(),
      end: new Date().toISOString(),
      status: 'completed', tokens_in: 1000, tokens_out: 5000,
      cost_usd: 0.05, tool_calls: 3, summary: 'Demo',
      tags: ['demo'], source: 'demo', spec_version: '0.2.0',
      agent_runtime_ms: 68500, // 5000/80*1000 + 3*2000
      wall_clock_ms: 3600000,
    });

    const entries = c.query({});
    expect(entries.length).toBe(1);
    expect(entries[0].agent_runtime_ms).toBe(68500);
    expect(entries[0].wall_clock_ms).toBe(3600000);
  });

  it('creates personal baselines', async () => {
    const c = await setup();
    c.addBaseline({ category: 'code', task_type: 'code_review', my_minutes: 30 });
    c.addBaseline({ category: 'content', task_type: 'blog_post', my_minutes: 180 });

    const baselines = c.getBaselines();
    expect(baselines.length).toBe(2);
    expect(baselines[0].category).toBeTruthy();
    expect(baselines[0].my_minutes).toBeGreaterThan(0);
  });

  it('HTML report generates without error with runtime data', async () => {
    const c = await setup();

    // Seed entries with runtime data
    for (let i = 0; i < 5; i++) {
      c.upsert({
        id: uuid(), task: `Task ${i}`, project: 'demo', client: 'demo',
        category: 'code', agent: 'agent', model: 'claude-sonnet-4',
        start: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
        end: new Date(Date.now() - i * 3600000).toISOString(),
        status: 'completed', tokens_in: 500, tokens_out: 2000,
        cost_usd: 0.02, tool_calls: 2, summary: '', tags: [],
        source: 'test', spec_version: '0.2.0',
        agent_runtime_ms: 29000,
        wall_clock_ms: 3600000,
      });
    }

    const from = new Date(Date.now() - 14 * 86400000).toISOString();
    const to = new Date().toISOString();
    const ts = c.timesheet(from, to);
    const rawEntries = c.query({ from, to });

    const html = generateTimesheetHTML(ts, { dateRange: '2026-02-22 to 2026-03-08', rawEntries });
    expect(html).toContain('Agent Runtime');
    expect(html).toContain('Wall Clock');
  });

  it('PDF report generates without error with runtime data', async () => {
    const c = await setup();

    c.upsert({
      id: uuid(), task: 'PDF test task', project: 'demo', client: 'demo',
      category: 'code', agent: 'agent', model: 'claude-sonnet-4',
      start: new Date(Date.now() - 3600000).toISOString(),
      end: new Date().toISOString(),
      status: 'completed', tokens_in: 500, tokens_out: 2000,
      cost_usd: 0.02, tool_calls: 2, summary: '', tags: [],
      source: 'test', spec_version: '0.2.0',
      agent_runtime_ms: 29000, wall_clock_ms: 3600000,
    });

    const from = new Date(Date.now() - 14 * 86400000).toISOString();
    const to = new Date().toISOString();
    const ts = c.timesheet(from, to);
    const outputPath = path.join(path.dirname(c.database['dbPath']), 'test-report.pdf');

    await generateTimesheetPDF(ts, { dateRange: '2026-02-22 to 2026-03-08', outputPath });
    expect(fs.existsSync(outputPath)).toBe(true);
    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});
