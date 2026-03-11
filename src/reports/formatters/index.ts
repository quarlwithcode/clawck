/**
 * Platform-Aware Output Formatters
 * Format reports for Discord, Slack, Telegram, and Markdown
 */

import { TimesheetSummary, ProductivityScore, Digest, CategoryTrends } from '../../core/types';
import { formatDiscord } from './discord';
import { formatSlack } from './slack';
import { formatTelegram } from './telegram';
import { formatMarkdown } from './markdown';

export type PlatformFormat = 'discord' | 'slack' | 'telegram' | 'markdown' | 'terminal';

export interface FormatOptions {
  redact?: boolean;
  summaryOnly?: boolean;
  clientName?: string;
  maxLength?: number;
}

/**
 * Format a timesheet for a specific platform
 */
export function formatTimesheet(
  summary: TimesheetSummary,
  platform: PlatformFormat,
  options: FormatOptions = {}
): string {
  switch (platform) {
    case 'discord':
      return formatDiscord.timesheet(summary, options);
    case 'slack':
      return formatSlack.timesheet(summary, options);
    case 'telegram':
      return formatTelegram.timesheet(summary, options);
    case 'markdown':
      return formatMarkdown.timesheet(summary, options);
    default:
      return formatMarkdown.timesheet(summary, options);
  }
}

/**
 * Format a productivity score for a specific platform
 */
export function formatScore(
  score: ProductivityScore,
  platform: PlatformFormat,
  options: FormatOptions = {}
): string {
  switch (platform) {
    case 'discord':
      return formatDiscord.score(score, options);
    case 'slack':
      return formatSlack.score(score, options);
    case 'telegram':
      return formatTelegram.score(score, options);
    case 'markdown':
      return formatMarkdown.score(score, options);
    default:
      return formatMarkdown.score(score, options);
  }
}

/**
 * Format a digest for a specific platform
 */
export function formatDigest(
  digest: Digest,
  platform: PlatformFormat,
  options: FormatOptions = {}
): string {
  switch (platform) {
    case 'discord':
      return formatDiscord.digest(digest, options);
    case 'slack':
      return formatSlack.digest(digest, options);
    case 'telegram':
      return formatTelegram.digest(digest, options);
    case 'markdown':
      return formatMarkdown.digest(digest, options);
    default:
      return formatMarkdown.digest(digest, options);
  }
}

/**
 * Format category trends for a specific platform
 */
export function formatTrends(
  trends: CategoryTrends,
  platform: PlatformFormat,
  options: FormatOptions = {}
): string {
  switch (platform) {
    case 'discord':
      return formatDiscord.trends(trends, options);
    case 'slack':
      return formatSlack.trends(trends, options);
    case 'telegram':
      return formatTelegram.trends(trends, options);
    case 'markdown':
      return formatMarkdown.trends(trends, options);
    default:
      return formatMarkdown.trends(trends, options);
  }
}

export { formatDiscord, formatSlack, formatTelegram, formatMarkdown };
