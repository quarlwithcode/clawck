import { describe, it, expect, afterEach, vi } from 'vitest';
import { computeMergedRuntimeMs } from '../src/core/runtime';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig, makeEntry } from './helpers';

describe('computeMergedRuntimeMs', () => {
  it('returns 0 for empty entries', () => {
    expect(computeMergedRuntimeMs([])).toBe(0);
  });

  it('single entry returns that entry duration', () => {
    const ms = computeMergedRuntimeMs([
      { start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T10:30:00.000Z' },
    ]);
    expect(ms).toBe(30 * 60 * 1000);
  });

  it('no overlap: merged equals sum', () => {
    const ms = computeMergedRuntimeMs([
      { start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T10:30:00.000Z' },
      { start: '2026-03-07T11:00:00.000Z', end: '2026-03-07T11:30:00.000Z' },
    ]);
    // 30min + 30min = 60min
    expect(ms).toBe(60 * 60 * 1000);
  });

  it('full overlap: 3 entries same time = 1 entry duration', () => {
    const ms = computeMergedRuntimeMs([
      { start: '2026-03-07T13:00:00.000Z', end: '2026-03-07T13:30:00.000Z' },
      { start: '2026-03-07T13:00:00.000Z', end: '2026-03-07T13:30:00.000Z' },
      { start: '2026-03-07T13:00:00.000Z', end: '2026-03-07T13:30:00.000Z' },
    ]);
    // All overlap perfectly → merged = 30min
    expect(ms).toBe(30 * 60 * 1000);
  });

  it('partial overlap: correct merged value', () => {
    const ms = computeMergedRuntimeMs([
      { start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T10:40:00.000Z' },
      { start: '2026-03-07T10:20:00.000Z', end: '2026-03-07T11:00:00.000Z' },
    ]);
    // Merged: 10:00 - 11:00 = 60min
    expect(ms).toBe(60 * 60 * 1000);
  });

  it('still running (end: null) uses current time', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const startMs = now - 15 * 60 * 1000; // 15 min ago
    const ms = computeMergedRuntimeMs([
      { start: new Date(startMs).toISOString(), end: null },
    ]);
    expect(ms).toBe(15 * 60 * 1000);

    vi.useRealTimers();
  });

  it('mix of overlapping and non-overlapping', () => {
    const ms = computeMergedRuntimeMs([
      { start: '2026-03-07T09:00:00.000Z', end: '2026-03-07T09:30:00.000Z' },
      { start: '2026-03-07T09:15:00.000Z', end: '2026-03-07T09:45:00.000Z' },
      { start: '2026-03-07T11:00:00.000Z', end: '2026-03-07T11:30:00.000Z' },
    ]);
    // Group 1 merged: 09:00-09:45 = 45min
    // Group 2: 11:00-11:30 = 30min
    // Total merged = 75min
    expect(ms).toBe(75 * 60 * 1000);
  });
});

describe('getTimesheet populates total_agent_merged_runtime_hours', () => {
  let clawck: Clawck;

  afterEach(() => {
    try { clawck?.close(); } catch {}
  });

  it('returns merged runtime in timesheet summary', async () => {
    clawck = await new Clawck(makeTmpConfig()).ready();

    // Two overlapping entries: 10:00-10:30 and 10:15-10:45
    clawck.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T10:30:00.000Z',
    }));
    clawck.upsert(makeEntry({
      id: 'entry-2',
      start: '2026-03-07T10:15:00.000Z',
      end: '2026-03-07T10:45:00.000Z',
    }));

    const ts = clawck.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');

    // total_agent_hours = sum of both durations
    // merged = 10:00-10:45 = 45min = 0.75hrs
    expect(ts.total_agent_merged_runtime_hours).toBe(0.75);
  });

  it('non-overlapping entries: merged equals total', async () => {
    clawck = await new Clawck(makeTmpConfig()).ready();

    clawck.upsert(makeEntry({
      start: '2026-03-07T10:00:00.000Z',
      end: '2026-03-07T10:30:00.000Z',
    }));
    clawck.upsert(makeEntry({
      id: 'entry-2',
      start: '2026-03-07T11:00:00.000Z',
      end: '2026-03-07T11:30:00.000Z',
    }));

    const ts = clawck.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');

    // No overlap, merged = 30+30 = 60min = 1hr
    expect(ts.total_agent_merged_runtime_hours).toBe(1);
  });
});
