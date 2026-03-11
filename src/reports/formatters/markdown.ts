/**
 * Markdown Formatter
 * Clean markdown with tables and formatting
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

export const formatMarkdown = {
  timesheet(summary: TimesheetSummary, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const clientLabel = options.clientName ? ` — ${options.clientName}` : '';

    lines.push(`# Clawck Timesheet${clientLabel}`);
    lines.push(`*${summary.period_start.split('T')[0]} to ${summary.period_end.split('T')[0]}*`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total runtime | ${summary.total_agent_hours.toFixed(2)}h |`);
    lines.push(`| Human equiv | ${summary.total_human_equiv_hours.toFixed(2)}h |`);
    lines.push(`| Cost | $${summary.total_cost_usd.toFixed(2)} |`);
    lines.push(`| Savings | $${summary.total_savings_usd.toFixed(0)} |`);
    lines.push(`| Entries | ${summary.total_entries} |`);
    lines.push('');

    if (options.summaryOnly) {
      // Project breakdown
      lines.push('## By Project');
      lines.push('| Project | Hours | Entries |');
      lines.push('|---------|-------|---------|');
      for (const p of summary.by_project) {
        lines.push(`| ${p.project} | ${p.agent_hours.toFixed(2)}h | ${p.entries} |`);
      }
    } else {
      // Entries table
      lines.push('## Entries');
      lines.push('| Date | Task | Duration | Project | Category |');
      lines.push('|------|------|----------|---------|----------|');
      for (const e of summary.entries.slice(0, 50)) {
        const task = options.redact ? `${e.category} task` : e.task.slice(0, 40);
        lines.push(`| ${e.date} | ${task} | ${formatDuration(e.duration_minutes)} | ${e.project} | ${e.category} |`);
      }

      if (summary.entries.length > 50) {
        lines.push(`\n*...and ${summary.entries.length - 50} more entries*`);
      }

      // Project subtotals
      lines.push('');
      lines.push('## By Project');
      for (const p of summary.by_project) {
        lines.push(`- **${p.project}**: ${p.agent_hours.toFixed(2)}h (${p.entries} entries)`);
      }
    }

    return lines.join('\n');
  },

  score(score: ProductivityScore, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const trendIcon = score.trend === 'up' ? '↑' : score.trend === 'down' ? '↓' : '→';

    lines.push('# Productivity Score');
    lines.push(`*${score.period_start.split('T')[0]} to ${score.period_end.split('T')[0]}*`);
    lines.push('');
    lines.push(`- **Overall utilization**: ${score.overall_utilization_percent}% ${trendIcon}`);
    lines.push(`- **Total agent time**: ${score.total_agent_runtime_hours.toFixed(2)}h / ${score.total_available_hours}h available`);
    lines.push(`- **Daily average**: ${score.daily_average_hours.toFixed(2)}h`);
    lines.push(`- **Busiest category**: ${score.busiest_category || 'n/a'}`);
    lines.push(`- **Total entries**: ${score.total_entries}`);
    lines.push('');

    // Daily breakdown
    lines.push('## Daily Breakdown');
    lines.push('| Date | Util | Hours | Entries | Top Category | Trend |');
    lines.push('|------|------|-------|---------|--------------|-------|');
    for (const day of score.days) {
      const dayTrend = day.trend === 'up' ? '↑' : day.trend === 'down' ? '↓' : '→';
      lines.push(`| ${day.date} | ${day.utilization_percent}% | ${day.agent_runtime_hours.toFixed(2)} | ${day.entry_count} | ${day.top_category || '-'} | ${dayTrend} |`);
    }

    return lines.join('\n');
  },

  digest(digest: Digest, options: FormatOptions = {}): string {
    const lines: string[] = [];
    const periodLabel = digest.period === 'day' ? 'Daily' : 'Weekly';

    lines.push(`# ${periodLabel} Digest`);
    lines.push(`*${digest.period_start.split('T')[0]}${digest.period === 'week' ? ` to ${digest.period_end.split('T')[0]}` : ''}*`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`- **Entries**: ${digest.summary.total_entries} (${digest.summary.completed} completed, ${digest.summary.failed} failed, ${digest.summary.running} running)`);
    lines.push(`- **Agent time**: ${digest.summary.total_agent_hours.toFixed(2)}h`);
    lines.push(`- **Human equiv**: ${digest.summary.total_human_equiv_hours.toFixed(2)}h`);
    lines.push(`- **Cost**: $${digest.summary.total_cost_usd.toFixed(2)}`);
    lines.push(`- **Savings**: $${digest.summary.total_savings_usd.toFixed(0)}`);
    lines.push('');

    // Comparison
    if (digest.comparison) {
      const cmp = digest.comparison.vs_previous_period;
      const arrow = cmp.direction === 'up' ? '↑' : cmp.direction === 'down' ? '↓' : '→';
      const entriesSign = cmp.entries_delta > 0 ? '+' : '';
      const hoursSign = cmp.hours_delta > 0 ? '+' : '';
      lines.push(`**vs previous ${digest.period}**: ${arrow} ${entriesSign}${cmp.entries_delta} entries, ${hoursSign}${cmp.hours_delta.toFixed(2)}h`);
      lines.push('');
    }

    // Highlights
    if (digest.highlights.length > 0) {
      lines.push('## Highlights');
      for (const h of digest.highlights) {
        lines.push(`- ${h.label}: **${h.value}**`);
      }
      lines.push('');
    }

    // Top tasks
    if (digest.top_tasks.length > 0 && !options.redact) {
      lines.push('## Top Tasks');
      for (const t of digest.top_tasks.slice(0, 10)) {
        lines.push(`- ${t.task} (${formatDuration(t.duration_minutes)})`);
      }
    }

    // Daily breakdown for weekly digest
    if (digest.period === 'week' && digest.by_day && digest.by_day.length > 0) {
      lines.push('');
      lines.push('## Daily Breakdown');
      lines.push('| Date | Entries | Hours | Top Category |');
      lines.push('|------|---------|-------|--------------|');
      for (const d of digest.by_day) {
        lines.push(`| ${d.date} | ${d.entries} | ${d.agent_hours.toFixed(2)}h | ${d.top_category || '-'} |`);
      }
    }

    return lines.join('\n');
  },

  trends(trends: CategoryTrends, options: FormatOptions = {}): string {
    const lines: string[] = [];

    lines.push('# Category Trends');
    lines.push(`*${trends.period_start.split('T')[0]} to ${trends.period_end.split('T')[0]}*`);
    lines.push('');

    if (trends.biggest_shift) {
      const arrow = trends.biggest_shift.direction === 'up' ? '↑' : '↓';
      const sign = trends.biggest_shift.delta_percent > 0 ? '+' : '';
      lines.push(`**Biggest shift**: ${trends.biggest_shift.category} ${arrow} ${sign}${trends.biggest_shift.delta_percent}%`);
      lines.push('');
    }

    for (const week of trends.weeks) {
      lines.push(`## Week ${week.week_number} (${week.week_start} to ${week.week_end})`);
      lines.push(`${week.total_entries} entries, ${week.total_hours.toFixed(2)}h total`);
      lines.push('');
      lines.push('| Category | % | Hours | Entries | Delta |');
      lines.push('|----------|---|-------|---------|-------|');

      const topCats = week.categories.filter(c => c.percentage > 0);
      for (const cat of topCats) {
        const deltaStr = cat.delta_percent !== null ? `${cat.delta_percent > 0 ? '+' : ''}${cat.delta_percent}%` : '-';
        lines.push(`| ${cat.category} | ${cat.percentage}% | ${cat.hours.toFixed(2)}h | ${cat.entries} | ${deltaStr} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  },
};
