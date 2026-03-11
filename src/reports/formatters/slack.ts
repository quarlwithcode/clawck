/**
 * Slack Formatter
 * Slack mrkdwn format: bold with *, code blocks, bullet lists
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

export const formatSlack = {
  timesheet(summary: TimesheetSummary, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const clientLabel = options.clientName ? ` — ${options.clientName}` : '';

    lines.push(`:clock3: *Clawck Timesheet${clientLabel}*`);
    lines.push(`_${summary.period_start.split('T')[0]} to ${summary.period_end.split('T')[0]}_`);
    lines.push('');

    // Summary block
    lines.push('*:bar_chart: Summary*');
    lines.push(`• Total runtime: \`${summary.total_agent_hours.toFixed(2)}h\``);
    lines.push(`• Human equiv: \`${summary.total_human_equiv_hours.toFixed(2)}h\``);
    lines.push(`• Cost: \`$${summary.total_cost_usd.toFixed(2)}\``);
    lines.push(`• Savings: \`$${summary.total_savings_usd.toFixed(0)}\``);
    lines.push(`• Entries: \`${summary.total_entries}\``);
    lines.push('');

    if (options.summaryOnly) {
      // Project breakdown
      lines.push('*:file_folder: By Project*');
      for (const p of summary.by_project.slice(0, 10)) {
        lines.push(`• *${p.project}*: ${p.agent_hours.toFixed(2)}h (${p.entries} entries)`);
      }
    } else {
      // Top entries
      lines.push('*:clipboard: Recent Entries*');
      const entries = summary.entries.slice(0, 15);
      for (const e of entries) {
        const task = options.redact ? `${e.category} task` : e.task.slice(0, 50);
        lines.push(`• ${task} — \`${formatDuration(e.duration_minutes)}\` (${e.project})`);
      }

      if (summary.entries.length > 15) {
        lines.push(`_...and ${summary.entries.length - 15} more entries_`);
      }
    }

    return lines.join('\n');
  },

  score(score: ProductivityScore, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const trendIcon = score.trend === 'up' ? ':arrow_up:' : score.trend === 'down' ? ':arrow_down:' : ':arrow_right:';

    lines.push('*:bar_chart: Productivity Score*');
    lines.push(`_${score.period_start.split('T')[0]} to ${score.period_end.split('T')[0]}_`);
    lines.push('');
    lines.push(`• Overall utilization: *${score.overall_utilization_percent}%* ${trendIcon}`);
    lines.push(`• Total agent time: \`${score.total_agent_runtime_hours.toFixed(2)}h\` / ${score.total_available_hours}h available`);
    lines.push(`• Daily average: \`${score.daily_average_hours.toFixed(2)}h\``);
    lines.push(`• Busiest category: *${score.busiest_category || 'n/a'}*`);
    lines.push(`• Total entries: \`${score.total_entries}\``);
    lines.push('');

    // Daily breakdown
    lines.push('*:calendar: Daily Breakdown*');
    lines.push('```');
    lines.push('Date         Util   Hours   Entries  Trend');
    for (const day of score.days.slice(-7)) {
      const dayTrend = day.trend === 'up' ? '↑' : day.trend === 'down' ? '↓' : '→';
      lines.push(`${day.date}  ${(day.utilization_percent + '%').padEnd(6)} ${day.agent_runtime_hours.toFixed(2).padEnd(7)} ${String(day.entry_count).padEnd(8)} ${dayTrend}`);
    }
    lines.push('```');

    return lines.join('\n');
  },

  digest(digest: Digest, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const periodLabel = digest.period === 'day' ? 'Daily' : 'Weekly';

    lines.push(`*:newspaper: ${periodLabel} Digest*`);
    lines.push(`_${digest.period_start.split('T')[0]}${digest.period === 'week' ? ` to ${digest.period_end.split('T')[0]}` : ''}_`);
    lines.push('');

    // Summary
    lines.push('*:bar_chart: Summary*');
    lines.push(`• Entries: \`${digest.summary.total_entries}\` (${digest.summary.completed} completed, ${digest.summary.failed} failed)`);
    lines.push(`• Agent time: \`${digest.summary.total_agent_hours.toFixed(2)}h\``);
    lines.push(`• Human equiv: \`${digest.summary.total_human_equiv_hours.toFixed(2)}h\``);
    lines.push(`• Cost: \`$${digest.summary.total_cost_usd.toFixed(2)}\``);
    lines.push(`• Savings: \`$${digest.summary.total_savings_usd.toFixed(0)}\``);
    lines.push('');

    // Comparison
    if (digest.comparison) {
      const cmp = digest.comparison.vs_previous_period;
      const arrow = cmp.direction === 'up' ? ':arrow_up:' : cmp.direction === 'down' ? ':arrow_down:' : ':arrow_right:';
      const entriesSign = cmp.entries_delta > 0 ? '+' : '';
      const hoursSign = cmp.hours_delta > 0 ? '+' : '';
      lines.push(`*vs previous ${digest.period}:* ${arrow} ${entriesSign}${cmp.entries_delta} entries, ${hoursSign}${cmp.hours_delta.toFixed(2)}h`);
      lines.push('');
    }

    // Highlights
    if (digest.highlights.length > 0) {
      lines.push('*:trophy: Highlights*');
      for (const h of digest.highlights.slice(0, 5)) {
        lines.push(`• ${h.label}: *${h.value}*`);
      }
      lines.push('');
    }

    // Top tasks
    if (digest.top_tasks.length > 0 && !options.redact) {
      lines.push('*:clipboard: Top Tasks*');
      for (const t of digest.top_tasks.slice(0, 5)) {
        lines.push(`• ${t.task.slice(0, 50)} (\`${formatDuration(t.duration_minutes)}\`)`);
      }
    }

    return lines.join('\n');
  },

  trends(trends: CategoryTrends, options: FormatOptions = {}): string {
    const lines: string[] = [];

    lines.push('*:bar_chart: Category Trends*');
    lines.push(`_${trends.period_start.split('T')[0]} to ${trends.period_end.split('T')[0]}_`);
    lines.push('');

    if (trends.biggest_shift) {
      const arrow = trends.biggest_shift.direction === 'up' ? ':arrow_up:' : ':arrow_down:';
      const sign = trends.biggest_shift.delta_percent > 0 ? '+' : '';
      lines.push(`:bar_chart: Biggest shift: *${trends.biggest_shift.category}* ${arrow} ${sign}${trends.biggest_shift.delta_percent}%`);
      lines.push('');
    }

    for (const week of trends.weeks.slice(-4)) {
      lines.push(`*Week ${week.week_number}* (${week.week_start} to ${week.week_end})`);
      lines.push(`\`${week.total_entries}\` entries, \`${week.total_hours.toFixed(2)}h\` total`);

      const topCats = week.categories.filter(c => c.percentage > 0).slice(0, 4);
      for (const cat of topCats) {
        const deltaStr = cat.delta_percent !== null ? ` (${cat.delta_percent > 0 ? '+' : ''}${cat.delta_percent}%)` : '';
        lines.push(`• ${cat.category}: ${cat.percentage}%${deltaStr}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  },
};
