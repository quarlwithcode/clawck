import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';
import fs from 'fs';

describe('Digest', () => {
  let clawck: Clawck;
  let tmpDir: string;

  beforeEach(async () => {
    const config = makeTmpConfig();
    tmpDir = config.data_dir;
    clawck = await new Clawck(config).ready();
  });

  afterEach(() => {
    clawck.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty digest for day with no entries', () => {
    const digest = clawck.digest({ period: 'day' });
    expect(digest.period).toBe('day');
    expect(digest.summary.total_entries).toBe(0);
    expect(digest.summary.total_agent_hours).toBe(0);
    expect(digest.highlights).toEqual([]);
    expect(digest.top_tasks).toEqual([]);
  });

  it('returns empty digest for week with no entries', () => {
    const digest = clawck.digest({ period: 'week' });
    expect(digest.period).toBe('week');
    expect(digest.summary.total_entries).toBe(0);
    expect(digest.by_day).toBeDefined();
  });

  it('calculates daily digest with entries', () => {
    // Add entries for today
    clawck.log({ task: 'Task 1', duration_minutes: 60, category: 'code', project: 'proj-a' });
    clawck.log({ task: 'Task 2', duration_minutes: 30, category: 'research', project: 'proj-a' });
    clawck.log({ task: 'Task 3', duration_minutes: 45, category: 'code', project: 'proj-b' });

    const digest = clawck.digest({ period: 'day' });

    expect(digest.summary.total_entries).toBe(3);
    expect(digest.summary.total_agent_hours).toBeGreaterThan(0);
    expect(digest.summary.completed).toBe(3);
    expect(digest.summary.failed).toBe(0);

    // Should have highlights
    expect(digest.highlights.length).toBeGreaterThan(0);

    // Top project should be proj-a (2 entries, more hours)
    const topProject = digest.highlights.find(h => h.type === 'top_project');
    expect(topProject).toBeDefined();
    expect(topProject!.value).toBe('proj-a');

    // Top tasks
    expect(digest.top_tasks.length).toBe(3);
  });

  it('calculates weekly digest with by_day breakdown', () => {
    // Add entries for today
    clawck.log({ task: 'Task today', duration_minutes: 60, category: 'code' });

    const digest = clawck.digest({ period: 'week' });

    expect(digest.period).toBe('week');
    expect(digest.by_day).toBeDefined();
    expect(digest.by_day!.length).toBeGreaterThanOrEqual(1);

    // Today's entry should be in the breakdown
    const today = new Date().toISOString().split('T')[0];
    const todayData = digest.by_day!.find(d => d.date === today);
    expect(todayData).toBeDefined();
    expect(todayData!.entries).toBe(1);
  });

  it('includes comparison with previous period', () => {
    // Log an entry for today
    clawck.log({ task: 'Today task', duration_minutes: 60, category: 'code' });

    const digest = clawck.digest({ period: 'day' });

    expect(digest.comparison).toBeDefined();
    expect(digest.comparison!.vs_previous_period).toBeDefined();
    // Since yesterday has no entries, direction should be 'up'
    expect(digest.comparison!.vs_previous_period.direction).toBe('up');
  });

  it('highlights longest task', () => {
    clawck.log({ task: 'Short task', duration_minutes: 15, category: 'code' });
    clawck.log({ task: 'Long task', duration_minutes: 180, category: 'research' });
    clawck.log({ task: 'Medium task', duration_minutes: 45, category: 'testing' });

    const digest = clawck.digest({ period: 'day' });

    const longestTask = digest.highlights.find(h => h.type === 'longest_task');
    expect(longestTask).toBeDefined();
    expect(longestTask!.value).toBe('Long task');
    expect(longestTask!.metric).toBe(180);
  });

  it('adds milestone highlight for 10+ tasks', () => {
    for (let i = 0; i < 12; i++) {
      clawck.log({ task: `Task ${i + 1}`, duration_minutes: 10, category: 'code' });
    }

    const digest = clawck.digest({ period: 'day' });

    const milestone = digest.highlights.find(h => h.type === 'milestone');
    expect(milestone).toBeDefined();
    expect(milestone!.value).toContain('12');
  });

  it('supports custom date parameter', () => {
    // Use a fixed date that's clearly in the past
    const targetDate = '2025-01-15';

    const digest = clawck.digest({ period: 'day', date: targetDate });

    // The period_start should be close to Jan 15, 2025
    // (accounting for timezone - the ISO string may show 14th or 15th depending on TZ)
    expect(digest.period_start).toMatch(/2025-01-1[45]/);
    expect(digest.period).toBe('day');
    expect(digest.summary.total_entries).toBe(0); // No entries for this old date
  });
});
