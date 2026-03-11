import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateTimesheetPDF, generateInvoicePDF } from '../src/reports/pdf';
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
    total_tokens_in: 100000,
    total_tokens_out: 50000,
    total_time_saved_hours: 75,
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
    total_agent_merged_runtime_hours: 10,
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
      total_tokens_in: 0,
      total_tokens_out: 0,
      total_time_saved_hours: 0,
      total_agent_merged_runtime_hours: 0,
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

  // ─── Style Tests ──────────────────────────────────────

  it('style=short produces valid smaller PDF', async () => {
    const fullPath = tmpPath();
    const shortPath = tmpPath();
    await generateTimesheetPDF(mockSummary, { dateRange: '2026-03-01 to 2026-03-08', outputPath: fullPath, style: 'full' });
    await generateTimesheetPDF(mockSummary, { dateRange: '2026-03-01 to 2026-03-08', outputPath: shortPath, style: 'short' });

    const fullSize = fs.statSync(fullPath).size;
    const shortSize = fs.statSync(shortPath).size;
    expect(shortSize).toBeGreaterThan(0);
    expect(shortSize).toBeLessThanOrEqual(fullSize);

    const buf = Buffer.alloc(4);
    const fd = fs.openSync(shortPath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    expect(buf.toString('ascii')).toBe('%PDF');
  });

  it('style=table produces valid PDF', async () => {
    const summaryWithEntries = {
      ...mockSummary,
      entries: [
        { date: '2026-03-07', start_time: '2026-03-07T10:00:00.000Z', end_time: '2026-03-07T11:00:00.000Z', agent: 'bot-1', client: 'acme', project: 'website', task: 'Build feature', category: 'code' as const, duration_minutes: 60, tokens_in: 3000, tokens_out: 2000, tokens_total: 5000, cost_usd: 0.10, human_equiv_hours: 6, human_equiv_cost_saved: 450, time_saved_hours: 5, status: 'completed' as const, approved: true },
      ],
    };
    const outputPath = tmpPath();
    await generateTimesheetPDF(summaryWithEntries, { dateRange: '2026-03-01 to 2026-03-08', outputPath, style: 'table' });

    expect(fs.existsSync(outputPath)).toBe(true);
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(outputPath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    expect(buf.toString('ascii')).toBe('%PDF');
  });

  it('style=full produces unchanged behavior', async () => {
    const outputPath = tmpPath();
    await generateTimesheetPDF(mockSummary, { dateRange: '2026-03-01 to 2026-03-08', outputPath, style: 'full' });

    expect(fs.existsSync(outputPath)).toBe(true);
    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});

// ─── Invoice PDF Generation ────────────────────────────────

describe('Invoice PDF generation', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    tmpFiles.length = 0;
  });

  function tmpPath(): string {
    const p = path.join(os.tmpdir(), `clawck-invoice-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    tmpFiles.push(p);
    return p;
  }

  const mockSummaryWithEntries: TimesheetSummary = {
    period_start: '2026-03-01T00:00:00.000Z',
    period_end: '2026-03-08T00:00:00.000Z',
    total_entries: 3,
    total_agent_hours: 10.5,
    total_human_equiv_hours: 73.5,
    total_cost_usd: 1.05,
    total_savings_usd: 3675,
    total_tokens: 120000,
    total_tokens_in: 80000,
    total_tokens_out: 40000,
    total_time_saved_hours: 63,
    by_client: [
      { client: 'acme', agent_hours: 10.5, human_equiv_hours: 73.5, cost_usd: 1.05, savings_usd: 3675, entries: 3 },
    ],
    by_agent: [
      { agent: 'bot-1', model: 'claude-sonnet-4', agent_hours: 10.5, human_equiv_hours: 73.5, cost_usd: 1.05, entries: 3, success_rate: 100 },
    ],
    by_project: [
      { project: 'website', client: 'acme', agent_hours: 6, human_equiv_hours: 42, cost_usd: 0.60, entries: 2 },
      { project: 'api', client: 'acme', agent_hours: 4.5, human_equiv_hours: 31.5, cost_usd: 0.45, entries: 1 },
    ],
    by_category: [
      { category: 'code', agent_hours: 10.5, human_equiv_hours: 63, cost_usd: 1.05, savings_usd: 4725, entries: 3 },
    ],
    total_agent_merged_runtime_hours: 9,
    entries: [
      { date: '2026-03-07', start_time: '2026-03-07T10:00:00.000Z', end_time: '2026-03-07T13:00:00.000Z', agent: 'bot-1', client: 'acme', project: 'website', task: 'Implement user authentication feature', category: 'code' as const, duration_minutes: 180, tokens_in: 30000, tokens_out: 15000, tokens_total: 45000, cost_usd: 0.35, human_equiv_hours: 18, human_equiv_cost_saved: 1350, time_saved_hours: 15, status: 'completed' as const, approved: true },
      { date: '2026-03-06', start_time: '2026-03-06T14:00:00.000Z', end_time: '2026-03-06T17:00:00.000Z', agent: 'bot-1', client: 'acme', project: 'website', task: 'Build dashboard components', category: 'code' as const, duration_minutes: 180, tokens_in: 25000, tokens_out: 12000, tokens_total: 37000, cost_usd: 0.30, human_equiv_hours: 18, human_equiv_cost_saved: 1350, time_saved_hours: 15, status: 'completed' as const, approved: true },
      { date: '2026-03-05', start_time: '2026-03-05T09:00:00.000Z', end_time: '2026-03-05T13:30:00.000Z', agent: 'bot-1', client: 'acme', project: 'api', task: 'Refactor REST API endpoints', category: 'code' as const, duration_minutes: 270, tokens_in: 25000, tokens_out: 13000, tokens_total: 38000, cost_usd: 0.40, human_equiv_hours: 27, human_equiv_cost_saved: 2025, time_saved_hours: 22.5, status: 'completed' as const, approved: true },
    ],
  };

  it('generates a valid invoice PDF without rate', async () => {
    const outputPath = tmpPath();
    await generateInvoicePDF(mockSummaryWithEntries, {
      clientName: 'Acme Corp',
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

  it('generates invoice PDF with hourly rate', async () => {
    const outputPath = tmpPath();
    await generateInvoicePDF(mockSummaryWithEntries, {
      clientName: 'Acme Corp',
      dateRange: '2026-03-01 to 2026-03-08',
      outputPath,
      rate: 150,
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
  });

  it('generates invoice with custom footer and terms', async () => {
    const outputPath = tmpPath();
    await generateInvoicePDF(mockSummaryWithEntries, {
      clientName: 'Acme Corp',
      dateRange: '2026-03-01 to 2026-03-08',
      outputPath,
      rate: 100,
      footer: 'Thank you for your business!',
      terms: 'Net 30',
      invoiceNumber: 'INV-2026-001',
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(outputPath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    expect(buf.toString('ascii')).toBe('%PDF');
  });
});
