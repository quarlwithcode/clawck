import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';
import { ReportMetadata } from '../src/core/types';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup() {
  clawck = await new Clawck(makeTmpConfig()).ready();
  return clawck;
}

describe('Report Persistence', () => {
  it('saves and retrieves HTML report by ID', async () => {
    const c = await setup();
    const content = '<html><body>Test report</body></html>';
    const metadata: ReportMetadata = { total_entries: 5, total_agent_hours: 10, total_cost_usd: 1.50, total_savings_usd: 500 };
    const saved = c.saveReport({
      name: 'Weekly review',
      period: 'week',
      period_start: '2026-03-01T00:00:00.000Z',
      period_end: '2026-03-08T00:00:00.000Z',
      style: 'full',
      format: 'html',
      content,
      metadata,
    });
    expect(saved.id).toBeTruthy();
    const retrieved = c.getReport(saved.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe(content);
    expect(retrieved!.name).toBe('Weekly review');
  });

  it('saves and retrieves terminal report', async () => {
    const c = await setup();
    const content = JSON.stringify({ total_entries: 3 });
    const saved = c.saveReport({
      name: 'Terminal test',
      period: 'day',
      period_start: '2026-03-08T00:00:00.000Z',
      period_end: '2026-03-08T23:59:59.000Z',
      style: 'short',
      format: 'terminal',
      content,
      metadata: { total_entries: 3, total_agent_hours: 1, total_cost_usd: 0.10, total_savings_usd: 50 },
    });
    const retrieved = c.getReport(saved.id);
    expect(retrieved!.content).toBe(content);
  });

  it('lists reports in newest-first order', async () => {
    const c = await setup();
    const base = { period: 'week' as const, period_start: '2026-03-01T00:00:00.000Z', period_end: '2026-03-08T00:00:00.000Z', style: 'full' as const, format: 'terminal' as const, content: 'data', metadata: { total_entries: 0, total_agent_hours: 0, total_cost_usd: 0, total_savings_usd: 0 } };
    c.saveReport({ ...base, name: 'First' });
    c.saveReport({ ...base, name: 'Second' });
    c.saveReport({ ...base, name: 'Third' });
    const list = c.listReports();
    expect(list.length).toBe(3);
    // Newest first
    expect(list[0].name).toBe('Third');
  });

  it('list returns reports without content (lightweight)', async () => {
    const c = await setup();
    c.saveReport({
      name: 'Big report',
      period: 'month',
      period_start: '2026-03-01T00:00:00.000Z',
      period_end: '2026-03-31T00:00:00.000Z',
      style: 'full',
      format: 'html',
      content: '<html>'.repeat(10000),
      metadata: { total_entries: 100, total_agent_hours: 50, total_cost_usd: 10, total_savings_usd: 5000 },
    });
    const list = c.listReports();
    expect(list.length).toBe(1);
    expect(list[0].content).toBe('');
  });

  it('deletes a report', async () => {
    const c = await setup();
    const saved = c.saveReport({
      name: 'To delete',
      period: 'day',
      period_start: '2026-03-08T00:00:00.000Z',
      period_end: '2026-03-08T23:59:59.000Z',
      style: 'full',
      format: 'terminal',
      content: 'data',
      metadata: { total_entries: 0, total_agent_hours: 0, total_cost_usd: 0, total_savings_usd: 0 },
    });
    expect(c.deleteReport(saved.id)).toBe(true);
    expect(c.getReport(saved.id)).toBeNull();
  });

  it('get nonexistent returns null', async () => {
    const c = await setup();
    expect(c.getReport('nonexistent-id')).toBeNull();
  });

  it('stores and parses metadata correctly', async () => {
    const c = await setup();
    const metadata: ReportMetadata = {
      filters: { client: 'acme', project: 'website' },
      total_entries: 42,
      total_agent_hours: 15.5,
      total_cost_usd: 3.25,
      total_savings_usd: 1200,
    };
    const saved = c.saveReport({
      name: 'Metadata test',
      period: 'custom',
      period_start: '2026-01-01T00:00:00.000Z',
      period_end: '2026-03-01T00:00:00.000Z',
      style: 'full',
      format: 'terminal',
      content: 'data',
      metadata,
    });
    const retrieved = c.getReport(saved.id);
    expect(retrieved!.metadata.filters?.client).toBe('acme');
    expect(retrieved!.metadata.total_entries).toBe(42);
    expect(retrieved!.metadata.total_savings_usd).toBe(1200);
  });

  it('saves PDF content as Buffer and retrieves', async () => {
    const c = await setup();
    const pdfContent = Buffer.from('%PDF-1.4 fake pdf content');
    const saved = c.saveReport({
      name: 'PDF report',
      period: 'week',
      period_start: '2026-03-01T00:00:00.000Z',
      period_end: '2026-03-08T00:00:00.000Z',
      style: 'full',
      format: 'pdf',
      content: pdfContent,
      metadata: { total_entries: 5, total_agent_hours: 10, total_cost_usd: 1, total_savings_usd: 500 },
    });
    const retrieved = c.getReport(saved.id);
    expect(retrieved).not.toBeNull();
    // PDF content comes back as Buffer
    expect(Buffer.isBuffer(retrieved!.content)).toBe(true);
    expect((retrieved!.content as Buffer).toString()).toContain('%PDF');
  });
});
