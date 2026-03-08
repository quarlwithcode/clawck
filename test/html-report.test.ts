import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Clawck } from '../src/core/clawck';
import { generateTimesheetHTML } from '../src/reports/html';
import { makeTmpConfig, makeEntry } from './helpers';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

describe('HTML Report', () => {
  it('generates valid HTML with DOCTYPE prefix', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08' });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('contains all tab sections', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08' });
    expect(html).toContain('data-tab="calendar"');
    expect(html).toContain('data-tab="table"');
    expect(html).toContain('data-tab="gantt"');
    expect(html).toContain('data-tab="csv"');
  });

  it('contains summary stats values', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
      cost_usd: 0.50,
      tokens_in: 5000,
      tokens_out: 2000,
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08' });
    expect(html).toContain('$0.50');
    expect(html).toContain('7,000');
  });

  it('handles empty summary gracefully', async () => {
    const c = await setup();
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08' });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('0');
  });

  it('writes to file successfully', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const rawEntries = c.query({ from: '2026-03-07T00:00:00.000Z', to: '2026-03-08T00:00:00.000Z' });
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', rawEntries });
    const outPath = path.join(os.tmpdir(), `clawck-test-report-${Date.now()}.html`);
    fs.writeFileSync(outPath, html);
    expect(fs.existsSync(outPath)).toBe(true);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content.startsWith('<!DOCTYPE html>')).toBe(true);
    fs.unlinkSync(outPath);
  });

  it('includes Gantt chart with raw entries', async () => {
    const c = await setup();
    c.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T11:00:00.000Z',
    }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const rawEntries = c.query({ from: '2026-03-07T00:00:00.000Z', to: '2026-03-08T00:00:00.000Z' });
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', rawEntries });
    expect(html).toContain('gantt-bar');
  });

  // ─── Style Tests ──────────────────────────────────────

  it('style=full shows all 4 tabs', async () => {
    const c = await setup();
    c.upsert(makeEntry({ start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const rawEntries = c.query({ from: '2026-03-07T00:00:00.000Z', to: '2026-03-08T00:00:00.000Z' });
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', rawEntries, style: 'full' });
    expect(html).toContain('data-tab="calendar"');
    expect(html).toContain('data-tab="table"');
    expect(html).toContain('data-tab="gantt"');
    expect(html).toContain('data-tab="csv"');
  });

  it('style=short shows summary cards but no tab-content divs', async () => {
    const c = await setup();
    c.upsert(makeEntry({ start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', style: 'short' });
    expect(html).toContain('card-label');
    expect(html).not.toContain('id="tab-');
  });

  it('style=table shows table tab only, no calendar/gantt/csv', async () => {
    const c = await setup();
    c.upsert(makeEntry({ start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', style: 'table' });
    expect(html).toContain('id="tab-table"');
    expect(html).not.toContain('id="tab-calendar"');
    expect(html).not.toContain('id="tab-gantt"');
    expect(html).not.toContain('id="tab-csv"');
  });

  it('style=visual shows gantt + calendar only', async () => {
    const c = await setup();
    c.upsert(makeEntry({ start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const rawEntries = c.query({ from: '2026-03-07T00:00:00.000Z', to: '2026-03-08T00:00:00.000Z' });
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', rawEntries, style: 'visual' });
    expect(html).toContain('id="tab-calendar"');
    expect(html).toContain('id="tab-gantt"');
    expect(html).not.toContain('id="tab-table"');
    expect(html).not.toContain('id="tab-csv"');
  });

  it('style=calendar shows calendar tab only', async () => {
    const c = await setup();
    c.upsert(makeEntry({ start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    const html = generateTimesheetHTML(ts, { dateRange: '2026-03-07 to 2026-03-08', style: 'calendar' });
    expect(html).toContain('id="tab-calendar"');
    expect(html).not.toContain('id="tab-table"');
    expect(html).not.toContain('id="tab-gantt"');
    expect(html).not.toContain('id="tab-csv"');
  });
});
