import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateTimesheetPDF } from '../src/reports/pdf';
import { TimesheetSummary } from '../src/core/types';

describe('PDF report generation', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    tmpFiles.length = 0;
  });

  function tmpPath(): string {
    const p = path.join(os.tmpdir(), `clawck-test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    tmpFiles.push(p);
    return p;
  }

  const mockSummary: TimesheetSummary = {
    period_start: '2026-03-01T00:00:00.000Z',
    period_end: '2026-03-08T00:00:00.000Z',
    total_entries: 5,
    total_agent_hours: 12.5,
    total_human_equiv_hours: 87.5,
    total_cost_usd: 1.25,
    total_savings_usd: 4375,
    total_tokens: 150000,
    by_client: [
      { client: 'acme', agent_hours: 8, human_equiv_hours: 56, cost_usd: 0.80, savings_usd: 2800, entries: 3 },
      { client: 'globex', agent_hours: 4.5, human_equiv_hours: 31.5, cost_usd: 0.45, savings_usd: 1575, entries: 2 },
    ],
    by_agent: [
      { agent: 'bot-1', model: 'claude-sonnet-4', agent_hours: 10, human_equiv_hours: 70, cost_usd: 1.0, entries: 4, success_rate: 100 },
      { agent: 'bot-2', model: 'gpt-4o', agent_hours: 2.5, human_equiv_hours: 17.5, cost_usd: 0.25, entries: 1, success_rate: 100 },
    ],
    by_project: [
      { project: 'website', client: 'acme', agent_hours: 8, human_equiv_hours: 56, cost_usd: 0.80, entries: 3 },
      { project: 'seo', client: 'globex', agent_hours: 4.5, human_equiv_hours: 31.5, cost_usd: 0.45, entries: 2 },
    ],
    by_category: [
      { category: 'code', agent_hours: 8, human_equiv_hours: 48, cost_usd: 0.80, savings_usd: 3600, entries: 3 },
      { category: 'research', agent_hours: 4.5, human_equiv_hours: 54, cost_usd: 0.45, savings_usd: 2700, entries: 2 },
    ],
    entries: [],
  };

  it('generates a valid PDF file', async () => {
    const outputPath = tmpPath();
    await generateTimesheetPDF(mockSummary, {
      dateRange: '2026-03-01 to 2026-03-08',
      outputPath,
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(0);

    // Check PDF magic bytes
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(outputPath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    expect(buf.toString('ascii')).toBe('%PDF');
  });

  it('generates PDF with client name and title', async () => {
    const outputPath = tmpPath();
    await generateTimesheetPDF(mockSummary, {
      title: 'Custom Report',
      clientName: 'Acme Corp',
      dateRange: '2026-03-01 to 2026-03-08',
      outputPath,
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
  });

  it('handles empty summary gracefully', async () => {
    const outputPath = tmpPath();
    const emptySummary: TimesheetSummary = {
      period_start: '2026-03-01T00:00:00.000Z',
      period_end: '2026-03-08T00:00:00.000Z',
      total_entries: 0,
      total_agent_hours: 0,
      total_human_equiv_hours: 0,
      total_cost_usd: 0,
      total_savings_usd: 0,
      total_tokens: 0,
      by_client: [],
      by_agent: [],
      by_project: [],
      by_category: [],
      entries: [],
    };

    await generateTimesheetPDF(emptySummary, {
      dateRange: '2026-03-01 to 2026-03-08',
      outputPath,
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(outputPath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    expect(buf.toString('ascii')).toBe('%PDF');
  });
});
