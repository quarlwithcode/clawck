/**
 * Discord Formatter
 * No markdown tables (use bullet lists), bold headers, emoji, 2000 char limit
 */

import { TimesheetSummary, ProductivityScore, Digest, CategoryTrends } from '../../core/types';
import { FormatOptions } from './index';

const MAX_LENGTH = 2000;

function truncateWithMore(lines: string[], maxLength: number): string {
  let result = '';
  let truncatedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const testResult = result + line + '\n';

    if (testResult.length > maxLength - 50) {
      truncatedCount = lines.length - i;
      break;
    }
    result = testResult;
  }

  if (truncatedCount > 0) {
    result += `...and ${truncatedCount} more entries`;
  }

  return result.trim();
}

function formatDuration(mins: number): string {
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const formatDiscord = {
  timesheet(summary: TimesheetSummary, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const clientLabel = options.clientName ? ` — ${options.clientName}` : '';

    lines.push(`**:clock3: Clawck Timesheet${clientLabel}**`);
    lines.push(`*${summary.period_start.split('T')[0]} to ${summary.period_end.split('T')[0]}*`);
    lines.push('');

    // Summary
    lines.push('**:chart_with_upwards_trend: Summary**');
    lines.push(`:alarm_clock: Total runtime: **${summary.total_agent_hours.toFixed(2)}h**`);
    lines.push(`:bust_in_silhouette: Human equiv: **${summary.total_human_equiv_hours.toFixed(2)}h**`);
    lines.push(`:moneybag: Cost: **$${summary.total_cost_usd.toFixed(2)}**`);
    lines.push(`:green_heart: Savings: **$${summary.total_savings_usd.toFixed(0)}**`);
    lines.push(`:1234: Entries: **${summary.total_entries}**`);
    lines.push('');

    if (options.summaryOnly) {
      // Project breakdown
      lines.push('**:file_folder: By Project**');
      for (const p of summary.by_project.slice(0, 10)) {
        lines.push(`• ${p.project}: ${p.agent_hours.toFixed(2)}h (${p.entries} entries)`);
      }
    } else {
      // Top entries (limited)
      lines.push('**:clipboard: Recent Entries**');
      const entries = summary.entries.slice(0, 10);
      for (const e of entries) {
        const task = options.redact ? `${e.category} task` : e.task.slice(0, 40);
        lines.push(`• ${task} — ${formatDuration(e.duration_minutes)} (${e.project})`);
      }

      if (summary.entries.length > 10) {
        lines.push(`...and ${summary.entries.length - 10} more entries`);
      }
    }

    return truncateWithMore(lines, options.maxLength || MAX_LENGTH);
  },

  score(score: ProductivityScore, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const trendEmoji = score.trend === 'up' ? ':arrow_up:' : score.trend === 'down' ? ':arrow_down:' : ':arrow_right:';

    lines.push('**:chart_with_upwards_trend: Productivity Score**');
    lines.push(`*${score.period_start.split('T')[0]} to ${score.period_end.split('T')[0]}*`);
    lines.push('');
    lines.push(`:bar_chart: Overall utilization: **${score.overall_utilization_percent}%** ${trendEmoji}`);
    lines.push(`:alarm_clock: Total agent time: **${score.total_agent_runtime_hours.toFixed(2)}h** / ${score.total_available_hours}h available`);
    lines.push(`:chart_increasing: Daily average: **${score.daily_average_hours.toFixed(2)}h**`);
    lines.push(`:trophy: Busiest category: **${score.busiest_category || 'n/a'}**`);
    lines.push(`:1234: Total entries: **${score.total_entries}**`);
    lines.push('');

    // Daily breakdown (limited)
    lines.push('**:calendar: Daily Breakdown**');
    for (const day of score.days.slice(-7)) {
      const dayTrend = day.trend === 'up' ? ':arrow_up:' : day.trend === 'down' ? ':arrow_down:' : ':arrow_right:';
      lines.push(`• ${day.date}: ${day.utilization_percent}% (${day.agent_runtime_hours.toFixed(2)}h) ${dayTrend}`);
    }

    return truncateWithMore(lines, options.maxLength || MAX_LENGTH);
  },

  digest(digest: Digest, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const periodLabel = digest.period === 'day' ? 'Daily' : 'Weekly';

    lines.push(`**:newspaper: ${periodLabel} Digest**`);
    lines.push(`*${digest.period_start.split('T')[0]}${digest.period === 'week' ? ` to ${digest.period_end.split('T')[0]}` : ''}*`);
    lines.push('');

    // Summary
    lines.push('**:chart_with_upwards_trend: Summary**');
    lines.push(`:clipboard: Entries: **${digest.summary.total_entries}** (${digest.summary.completed} completed, ${digest.summary.failed} failed)`);
    lines.push(`:alarm_clock: Agent time: **${digest.summary.total_agent_hours.toFixed(2)}h**`);
    lines.push(`:bust_in_silhouette: Human equiv: **${digest.summary.total_human_equiv_hours.toFixed(2)}h**`);
    lines.push(`:moneybag: Cost: **$${digest.summary.total_cost_usd.toFixed(2)}**`);
    lines.push(`:green_heart: Savings: **$${digest.summary.total_savings_usd.toFixed(0)}**`);
    lines.push('');

    // Highlights
    if (digest.highlights.length > 0) {
      lines.push('**:trophy: Highlights**');
      for (const h of digest.highlights.slice(0, 5)) {
        lines.push(`• ${h.label}: **${h.value}**`);
      }
      lines.push('');
    }

    // Top tasks
    if (digest.top_tasks.length > 0 && !options.redact) {
      lines.push('**:clipboard: Top Tasks**');
      for (const t of digest.top_tasks.slice(0, 5)) {
        lines.push(`• ${t.task.slice(0, 40)} (${formatDuration(t.duration_minutes)})`);
      }
    }

    return truncateWithMore(lines, options.maxLength || MAX_LENGTH);
  },

  trends(trends: CategoryTrends, options: FormatOptions = {}): string {
    const lines: string[] = [];

    lines.push('**:chart_with_upwards_trend: Category Trends**');
    lines.push(`*${trends.period_start.split('T')[0]} to ${trends.period_end.split('T')[0]}*`);
    lines.push('');

    if (trends.biggest_shift) {
      const arrow = trends.biggest_shift.direction === 'up' ? ':arrow_up:' : ':arrow_down:';
      const sign = trends.biggest_shift.delta_percent > 0 ? '+' : '';
      lines.push(`:bar_chart: Biggest shift: **${trends.biggest_shift.category}** ${arrow} ${sign}${trends.biggest_shift.delta_percent}%`);
      lines.push('');
    }

    for (const week of trends.weeks.slice(-4)) {
      lines.push(`**Week ${week.week_number}** (${week.week_start} to ${week.week_end})`);
      lines.push(`${week.total_entries} entries, ${week.total_hours.toFixed(2)}h total`);

      const topCats = week.categories.filter(c => c.percentage > 0).slice(0, 3);
      for (const cat of topCats) {
        const deltaStr = cat.delta_percent !== null ? ` (${cat.delta_percent > 0 ? '+' : ''}${cat.delta_percent}%)` : '';
        lines.push(`• ${cat.category}: ${cat.percentage}%${deltaStr}`);
      }
      lines.push('');
    }

    return truncateWithMore(lines, options.maxLength || MAX_LENGTH);
  },
};
