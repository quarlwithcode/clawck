import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { generateDigestCard, generateTimesheetCard } from '../src/reports/share-card';
import { makeTmpConfig } from './helpers';
import fs from 'fs';

describe('Share Cards', () => {
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

  describe('generateDigestCard', () => {
    it('generates HTML card from empty digest', () => {
      const digest = clawck.digest({ period: 'day' });
      const card = generateDigestCard(digest);

      expect(card.html).toContain('<!DOCTYPE html>');
      expect(card.html).toContain('Daily Summary');
      expect(card.width).toBe(1200);
      expect(card.height).toBe(630);
    });

    it('generates card with custom title', () => {
      const digest = clawck.digest({ period: 'day' });
      const card = generateDigestCard(digest, { title: 'My Custom Title' });

      expect(card.html).toContain('My Custom Title');
      expect(card.title).toBe('My Custom Title');
    });

    it('generates weekly card with date range', () => {
      const digest = clawck.digest({ period: 'week' });
      const card = generateDigestCard(digest);

      expect(card.html).toContain('Weekly Summary');
      expect(card.html).toContain('—'); // Date range separator
    });

    it('includes task stats in description', () => {
      clawck.log({ task: 'Task 1', duration_minutes: 60, category: 'code' });
      clawck.log({ task: 'Task 2', duration_minutes: 30, category: 'research' });

      const digest = clawck.digest({ period: 'day' });
      const card = generateDigestCard(digest);

      expect(card.description).toContain('2 tasks');
    });

    it('supports light theme', () => {
      const digest = clawck.digest({ period: 'day' });
      const card = generateDigestCard(digest, { theme: 'light' });

      expect(card.html).toContain('#ffffff'); // Light background
      expect(card.html).toContain('#1a202c'); // Dark text
    });

    it('supports dark theme', () => {
      const digest = clawck.digest({ period: 'day' });
      const card = generateDigestCard(digest, { theme: 'dark' });

      expect(card.html).toContain('#1a1a2e'); // Dark background
    });

    it('can disable branding', () => {
      const digest = clawck.digest({ period: 'day' });
      const card = generateDigestCard(digest, { branding: false });

      expect(card.html).not.toContain('Clawck');
      expect(card.html).not.toContain('clawck.dev');
    });

    it('includes Open Graph meta tags', () => {
      const digest = clawck.digest({ period: 'day' });
      const card = generateDigestCard(digest);

      expect(card.html).toContain('og:title');
      expect(card.html).toContain('og:description');
      expect(card.html).toContain('twitter:card');
    });
  });

  describe('generateTimesheetCard', () => {
    it('generates HTML card from empty timesheet', () => {
      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      const to = new Date().toISOString();
      const summary = clawck.timesheet(from, to);
      const card = generateTimesheetCard(summary);

      expect(card.html).toContain('<!DOCTYPE html>');
      expect(card.html).toContain('Timesheet Summary');
      expect(card.width).toBe(1200);
      expect(card.height).toBe(630);
    });

    it('shows total entries and hours', () => {
      clawck.log({ task: 'Task 1', duration_minutes: 120, category: 'code', project: 'proj-a' });
      clawck.log({ task: 'Task 2', duration_minutes: 60, category: 'research', project: 'proj-a' });

      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      const to = new Date().toISOString();
      const summary = clawck.timesheet(from, to);
      const card = generateTimesheetCard(summary);

      expect(card.html).toContain('2'); // Total entries
      expect(card.html).toContain('Total Entries');
      expect(card.description).toContain('2 entries');
    });

    it('includes top project highlight', () => {
      clawck.log({ task: 'Task 1', duration_minutes: 60, category: 'code', project: 'my-project' });

      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      const to = new Date().toISOString();
      const summary = clawck.timesheet(from, to);
      const card = generateTimesheetCard(summary);

      expect(card.html).toContain('Top Project');
      expect(card.html).toContain('my-project');
    });

    it('supports gradient theme by default', () => {
      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      const to = new Date().toISOString();
      const summary = clawck.timesheet(from, to);
      const card = generateTimesheetCard(summary);

      expect(card.html).toContain('linear-gradient');
    });
  });
});
