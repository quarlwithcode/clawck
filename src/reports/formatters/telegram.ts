/**
 * Telegram Formatter
 * Telegram HTML format: <b>, <code>, line breaks
 */

import { TimesheetSummary, ProductivityScore, Digest, CategoryTrends } from '../../core/types';
import { FormatOptions } from './index';

function formatDuration(mins: number): string {
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const formatTelegram = {
  timesheet(summary: TimesheetSummary, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const clientLabel = options.clientName ? ` — ${escapeHtml(options.clientName)}` : '';

    lines.push(`<b>Clawck Timesheet${clientLabel}</b>`);
    lines.push(`<i>${summary.period_start.split('T')[0]} to ${summary.period_end.split('T')[0]}</i>`);
    lines.push('');

    // Summary
    lines.push('<b>Summary</b>');
    lines.push(`Total runtime: <code>${summary.total_agent_hours.toFixed(2)}h</code>`);
    lines.push(`Human equiv: <code>${summary.total_human_equiv_hours.toFixed(2)}h</code>`);
    lines.push(`Cost: <code>$${summary.total_cost_usd.toFixed(2)}</code>`);
    lines.push(`Savings: <code>$${summary.total_savings_usd.toFixed(0)}</code>`);
    lines.push(`Entries: <code>${summary.total_entries}</code>`);
    lines.push('');

    if (options.summaryOnly) {
      // Project breakdown
      lines.push('<b>By Project</b>');
      for (const p of summary.by_project.slice(0, 10)) {
        lines.push(`- <b>${escapeHtml(p.project)}</b>: ${p.agent_hours.toFixed(2)}h (${p.entries} entries)`);
      }
    } else {
      // Top entries
      lines.push('<b>Recent Entries</b>');
      const entries = summary.entries.slice(0, 15);
      for (const e of entries) {
        const task = options.redact ? `${e.category} task` : escapeHtml(e.task.slice(0, 50));
        lines.push(`- ${task} — <code>${formatDuration(e.duration_minutes)}</code> (${escapeHtml(e.project)})`);
      }

      if (summary.entries.length > 15) {
        lines.push(`<i>...and ${summary.entries.length - 15} more entries</i>`);
      }
    }

    return lines.join('\n');
  },

  score(score: ProductivityScore, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const trendIcon = score.trend === 'up' ? '↑' : score.trend === 'down' ? '↓' : '→';

    lines.push('<b>Productivity Score</b>');
    lines.push(`<i>${score.period_start.split('T')[0]} to ${score.period_end.split('T')[0]}</i>`);
    lines.push('');
    lines.push(`Overall utilization: <b>${score.overall_utilization_percent}%</b> ${trendIcon}`);
    lines.push(`Total agent time: <code>${score.total_agent_runtime_hours.toFixed(2)}h</code> / ${score.total_available_hours}h available`);
    lines.push(`Daily average: <code>${score.daily_average_hours.toFixed(2)}h</code>`);
    lines.push(`Busiest category: <b>${score.busiest_category || 'n/a'}</b>`);
    lines.push(`Total entries: <code>${score.total_entries}</code>`);
    lines.push('');

    // Daily breakdown
    lines.push('<b>Daily Breakdown</b>');
    for (const day of score.days.slice(-7)) {
      const dayTrend = day.trend === 'up' ? '↑' : day.trend === 'down' ? '↓' : '→';
      lines.push(`${day.date}: ${day.utilization_percent}% (<code>${day.agent_runtime_hours.toFixed(2)}h</code>) ${dayTrend}`);
    }

    return lines.join('\n');
  },

  digest(digest: Digest, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const periodLabel = digest.period === 'day' ? 'Daily' : 'Weekly';

    lines.push(`<b>${periodLabel} Digest</b>`);
    lines.push(`<i>${digest.period_start.split('T')[0]}${digest.period === 'week' ? ` to ${digest.period_end.split('T')[0]}` : ''}</i>`);
    lines.push('');

    // Summary
    lines.push('<b>Summary</b>');
    lines.push(`Entries: <code>${digest.summary.total_entries}</code> (${digest.summary.completed} completed, ${digest.summary.failed} failed)`);
    lines.push(`Agent time: <code>${digest.summary.total_agent_hours.toFixed(2)}h</code>`);
    lines.push(`Human equiv: <code>${digest.summary.total_human_equiv_hours.toFixed(2)}h</code>`);
    lines.push(`Cost: <code>$${digest.summary.total_cost_usd.toFixed(2)}</code>`);
    lines.push(`Savings: <code>$${digest.summary.total_savings_usd.toFixed(0)}</code>`);
    lines.push('');

    // Comparison
    if (digest.comparison) {
      const cmp = digest.comparison.vs_previous_period;
      const arrow = cmp.direction === 'up' ? '↑' : cmp.direction === 'down' ? '↓' : '→';
      const entriesSign = cmp.entries_delta > 0 ? '+' : '';
      const hoursSign = cmp.hours_delta > 0 ? '+' : '';
      lines.push(`<b>vs previous ${digest.period}:</b> ${arrow} ${entriesSign}${cmp.entries_delta} entries, ${hoursSign}${cmp.hours_delta.toFixed(2)}h`);
      lines.push('');
    }

    // Highlights
    if (digest.highlights.length > 0) {
      lines.push('<b>Highlights</b>');
      for (const h of digest.highlights.slice(0, 5)) {
        lines.push(`- ${escapeHtml(h.label)}: <b>${escapeHtml(h.value)}</b>`);
      }
      lines.push('');
    }

    // Top tasks
    if (digest.top_tasks.length > 0 && !options.redact) {
      lines.push('<b>Top Tasks</b>');
      for (const t of digest.top_tasks.slice(0, 5)) {
        lines.push(`- ${escapeHtml(t.task.slice(0, 50))} (<code>${formatDuration(t.duration_minutes)}</code>)`);
      }
    }

    return lines.join('\n');
  },

  trends(trends: CategoryTrends, options: FormatOptions = {}): string {
    const lines: string[] = [];

    lines.push('<b>Category Trends</b>');
    lines.push(`<i>${trends.period_start.split('T')[0]} to ${trends.period_end.split('T')[0]}</i>`);
    lines.push('');

    if (trends.biggest_shift) {
      const arrow = trends.biggest_shift.direction === 'up' ? '↑' : '↓';
      const sign = trends.biggest_shift.delta_percent > 0 ? '+' : '';
      lines.push(`Biggest shift: <b>${trends.biggest_shift.category}</b> ${arrow} ${sign}${trends.biggest_shift.delta_percent}%`);
      lines.push('');
    }

    for (const week of trends.weeks.slice(-4)) {
      lines.push(`<b>Week ${week.week_number}</b> (${week.week_start} to ${week.week_end})`);
      lines.push(`<code>${week.total_entries}</code> entries, <code>${week.total_hours.toFixed(2)}h</code> total`);

      const topCats = week.categories.filter(c => c.percentage > 0).slice(0, 4);
      for (const cat of topCats) {
        const deltaStr = cat.delta_percent !== null ? ` (${cat.delta_percent > 0 ? '+' : ''}${cat.delta_percent}%)` : '';
        lines.push(`- ${cat.category}: ${cat.percentage}%${deltaStr}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  },
};
