#!/usr/bin/env node

/**
 * ⏱️🦀 Clawck — CLI
 * Command-line interface for managing AI agent time tracking.
 * 
 * Usage:
 *   clawck init              Create .clawck/ directory
 *   clawck serve             Start API server + dashboard
 *   clawck mcp               Start MCP server (stdio)
 *   clawck status            Show running tasks and stats
 *   clawck report [--days N] Show timesheet summary
 */

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { startServer } from '../server/api';
import { startMCPServer } from '../server/mcp';
import { Clawck } from '../core/clawck';
import { validateConfig } from '../core/config';
import { DEFAULT_CONFIG, ClawckConfig, ClawckEntry, DEFAULT_HUMAN_EQUIVALENTS, TrackingPattern, SPEC_VERSION, APP_VERSION } from '../core/types';
import { generateTimesheetPDF } from '../reports/pdf';
import { generateTimesheetHTML } from '../reports/html';
import { resolvePeriod } from '../reports/periods';
import { ReportStyle, ReportFormat, ReportPeriod } from '../core/types';
import { DEFAULT_PATTERNS } from '../core/patterns';
import { readStdin, normalize, handleHookStart, handleHookStop, PLATFORMS, PLATFORM_NAMES, Platform } from '../hooks';
import { INDUSTRY_BENCHMARKS } from '../core/benchmarks';
import { exportATP } from '../core/atp';
import { TASK_CATEGORIES } from '../core/types';

const program = new Command();

program
  .name('clawck')
  .description('⏱️🦀 Clawck — Time tracking for AI agents')
  .version(APP_VERSION)
  .enablePositionalOptions()
  .option('--json', 'Output as JSON (for scripting/pipelines)')
  .option('-d, --dir <path>', 'Data directory (also: CLAWCK_DIR env var)');

// ─── Init ─────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a .clawck/ directory in the current folder')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const resolvedDir = resolveDataDir(opts);
    const dir = path.resolve(resolvedDir);

    // Prevent nesting: don't create .clawck inside an existing .clawck
    const cwd = process.cwd();
    if (path.basename(cwd) === '.clawck' && resolvedDir === '.clawck') {
      console.error('  Already inside a .clawck directory. Aborting to prevent nesting.');
      process.exit(1);
    }
    if (path.basename(dir) === '.clawck' && fs.existsSync(path.join(dir, 'clawck.db'))) {
      console.error('  Already inside a .clawck directory. Aborting to prevent nesting.');
      process.exit(1);
    }

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const configPath = path.join(dir, 'config.json');
    if (!fs.existsSync(configPath)) {
      const config = {
        port: 3456,
        default_client: '',
        default_project: '',
        default_agent: '',
        default_model: '',
        default_source: 'clawck',
        human_equivalents: DEFAULT_HUMAN_EQUIVALENTS,
        remote_sources: [],
        patterns: DEFAULT_PATTERNS,
        default_pattern: 'default',
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    console.log(`\n  ⏱️🦀 Clawck initialized!`);
    console.log(`  ├─ Data dir:  ${dir}`);
    console.log(`  ├─ Config:    ${configPath}`);
    console.log(`  ├─ Database:  ${path.join(dir, 'clawck.db')} (created on first run)`);
    console.log(`  │`);
    console.log(`  │  Next steps:`);
    console.log(`  │  1. Edit ${configPath} with your defaults`);
    console.log(`  │  2. Run: clawck serve`);
    console.log(`  │  3. Open: http://localhost:3456`);
    console.log(`  └─ Done!\n`);
  });

// ─── Serve ────────────────────────────────────────────────

program
  .command('serve')
  .description('Start the Clawck API server and dashboard')
  .option('-p, --port <number>', 'Port number', '3456')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    config.port = parseInt(opts.port) || config.port;
    startServer(config);
  });

// ─── MCP ──────────────────────────────────────────────────

program
  .command('mcp')
  .description('Start the Clawck MCP server (stdio, for Claude Code / Cline / Cursor)')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    await startMCPServer(config);
  });

// ─── Status ───────────────────────────────────────────────

program
  .command('status')
  .description('Show currently running tasks and stats')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const stats = clawck.stats();
    const running = clawck.running();

    if (program.opts().json) {
      console.log(JSON.stringify({ stats, running }));
      clawck.close();
      return;
    }

    console.log(`\n  ⏱️🦀 Clawck Status`);
    console.log(`  ├─ Total entries:  ${stats.total_entries}`);
    console.log(`  ├─ Running now:    ${stats.running}`);
    console.log(`  ├─ Clients:        ${stats.clients}`);
    console.log(`  ├─ Projects:       ${stats.projects}`);
    console.log(`  └─ Agents:         ${stats.agents}`);

    if (running.length > 0) {
      console.log(`\n  ⏱️ Running Tasks:`);
      for (const e of running) {
        const mins = Math.round((Date.now() - new Date(e.start).getTime()) / 60000);
        console.log(`  ├─ ${e.task}`);
        console.log(`  │  ${e.agent} → ${e.project}/${e.client} (${mins}m)`);
      }
    }
    console.log('');
    clawck.close();
  });

// ─── Score ────────────────────────────────────────────────

program
  .command('score')
  .description('Show productivity score and utilization rate')
  .option('-d, --dir <path>', 'Data directory')
  .option('--days <number>', 'Number of days to analyze', '7')
  .option('--weekly', 'Show weekly breakdown')
  .option('--available-hours <number>', 'Available hours per day (default: 8)', '8')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();

    const days = parseInt(opts.days) || 7;
    const availableHours = parseInt(opts.availableHours) || 8;
    const score = clawck.score({ days, weekly: opts.weekly, available_hours_per_day: availableHours });

    if (program.opts().json) {
      console.log(JSON.stringify(score));
      clawck.close();
      return;
    }

    const trendArrow = score.trend === 'up' ? '↑' : score.trend === 'down' ? '↓' : '→';

    console.log(`\n  ⏱️🦀 Productivity Score (${days} days)`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  📊 Overall utilization:  ${score.overall_utilization_percent}% ${trendArrow}`);
    console.log(`  ⏱️  Total agent time:    ${score.total_agent_runtime_hours.toFixed(2)}h / ${score.total_available_hours}h available`);
    console.log(`  📈 Daily average:        ${score.daily_average_hours.toFixed(2)}h`);
    console.log(`  🏆 Busiest category:     ${score.busiest_category || 'n/a'}`);
    console.log(`  🔢 Total entries:        ${score.total_entries}`);

    if (opts.weekly || days >= 7) {
      console.log(`\n  📅 Daily Breakdown:`);
      console.log(`  ${'Date'.padEnd(12)} ${'Util'.padEnd(6)} ${'Hours'.padEnd(8)} ${'Entries'.padEnd(8)} ${'Top Cat'.padEnd(15)} Trend`);
      console.log(`  ${'─'.repeat(55)}`);

      for (const day of score.days) {
        const dayTrend = day.trend === 'up' ? '↑' : day.trend === 'down' ? '↓' : '→';
        const utilBar = '█'.repeat(Math.round(day.utilization_percent / 10));
        console.log(`  ${day.date.padEnd(12)} ${(day.utilization_percent + '%').padEnd(6)} ${day.agent_runtime_hours.toFixed(2).padEnd(8)} ${String(day.entry_count).padEnd(8)} ${(day.top_category || '-').padEnd(15)} ${dayTrend} ${utilBar}`);
      }
    }

    console.log('');
    clawck.close();
  });

// ─── Trends ───────────────────────────────────────────────

program
  .command('trends')
  .description('Show category distribution trends per week')
  .option('-d, --dir <path>', 'Data directory')
  .option('--weeks <number>', 'Number of weeks to analyze', '4')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();

    const weeks = parseInt(opts.weeks) || 4;
    const trends = clawck.trends({ weeks });

    if (program.opts().json) {
      console.log(JSON.stringify(trends));
      clawck.close();
      return;
    }

    console.log(`\n  ⏱️🦀 Category Trends (${weeks} weeks)`);
    console.log(`  ${'─'.repeat(60)}`);

    if (trends.biggest_shift) {
      const arrow = trends.biggest_shift.direction === 'up' ? '↑' : '↓';
      const sign = trends.biggest_shift.delta_percent > 0 ? '+' : '';
      console.log(`  📊 Biggest shift: ${trends.biggest_shift.category} ${arrow} ${sign}${trends.biggest_shift.delta_percent}%`);
      console.log('');
    }

    for (const week of trends.weeks) {
      console.log(`  📅 Week ${week.week_number} (${week.week_start} to ${week.week_end})`);
      console.log(`     ${week.total_entries} entries, ${week.total_hours.toFixed(2)}h total`);

      // Show top categories with percentage bars
      const topCats = week.categories.filter(c => c.percentage > 0).slice(0, 5);
      for (const cat of topCats) {
        const bar = '█'.repeat(Math.round(cat.percentage / 5));
        const deltaStr = cat.delta_percent !== null
          ? ` (${cat.delta_percent > 0 ? '+' : ''}${cat.delta_percent}%)`
          : '';
        console.log(`     ${cat.category.padEnd(15)} ${bar.padEnd(20)} ${cat.percentage}%${deltaStr}`);
      }
      console.log('');
    }

    clawck.close();
  });

// ─── Digest ──────────────────────────────────────────────

program
  .command('digest')
  .description('Show a daily or weekly summary digest')
  .option('-d, --dir <path>', 'Data directory')
  .option('--period <type>', 'Digest period (day, week)', 'day')
  .option('--date <date>', 'Specific date (YYYY-MM-DD)')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();

    const period = (opts.period === 'week' ? 'week' : 'day') as 'day' | 'week';
    const digest = clawck.digest({ period, date: opts.date });

    if (program.opts().json) {
      console.log(JSON.stringify(digest));
      clawck.close();
      return;
    }

    const periodLabel = period === 'day' ? 'Daily' : 'Weekly';
    const dateLabel = digest.period_start.split('T')[0];
    const endLabel = digest.period_end.split('T')[0];

    console.log(`\n  ⏱️🦀 ${periodLabel} Digest — ${dateLabel}${period === 'week' ? ` to ${endLabel}` : ''}`);
    console.log(`  ${'─'.repeat(55)}`);

    // Summary
    console.log(`  📊 Summary:`);
    console.log(`     Entries:      ${digest.summary.total_entries} (${digest.summary.completed} completed, ${digest.summary.failed} failed, ${digest.summary.running} running)`);
    console.log(`     Agent time:   ${digest.summary.total_agent_hours.toFixed(2)}h`);
    console.log(`     Human equiv:  ${digest.summary.total_human_equiv_hours.toFixed(2)}h`);
    console.log(`     Cost:         $${digest.summary.total_cost_usd.toFixed(2)}`);
    console.log(`     Savings:      $${digest.summary.total_savings_usd.toFixed(0)}`);

    // Comparison
    if (digest.comparison) {
      const cmp = digest.comparison.vs_previous_period;
      const arrow = cmp.direction === 'up' ? '↑' : cmp.direction === 'down' ? '↓' : '→';
      const entriesSign = cmp.entries_delta > 0 ? '+' : '';
      const hoursSign = cmp.hours_delta > 0 ? '+' : '';
      console.log(`\n  📈 vs previous ${period}:  ${arrow} ${entriesSign}${cmp.entries_delta} entries, ${hoursSign}${cmp.hours_delta.toFixed(2)}h`);
    }

    // Highlights
    if (digest.highlights.length > 0) {
      console.log(`\n  🏆 Highlights:`);
      for (const h of digest.highlights) {
        const metricStr = h.metric !== undefined ? ` (${h.metric}${h.type.includes('hours') || h.type === 'top_project' || h.type === 'top_category' || h.type === 'top_agent' ? 'h' : h.type === 'longest_task' ? 'm' : ''})` : '';
        console.log(`     ${h.label}: ${h.value}${metricStr}`);
      }
    }

    // Top tasks
    if (digest.top_tasks.length > 0) {
      console.log(`\n  📋 Top Tasks:`);
      for (const t of digest.top_tasks.slice(0, 5)) {
        const dur = t.duration_minutes >= 60
          ? `${Math.floor(t.duration_minutes / 60)}h ${Math.round(t.duration_minutes % 60)}m`
          : `${Math.round(t.duration_minutes)}m`;
        console.log(`     • ${t.task.slice(0, 45)}${t.task.length > 45 ? '...' : ''} (${dur})`);
      }
    }

    // Daily breakdown (for weekly)
    if (period === 'week' && digest.by_day && digest.by_day.length > 0) {
      console.log(`\n  📅 Daily Breakdown:`);
      console.log(`     ${'Date'.padEnd(12)} ${'Entries'.padEnd(10)} ${'Hours'.padEnd(10)} Top Category`);
      console.log(`     ${'─'.repeat(45)}`);
      for (const d of digest.by_day) {
        console.log(`     ${d.date.padEnd(12)} ${String(d.entries).padEnd(10)} ${d.agent_hours.toFixed(2).padEnd(10)} ${d.top_category || '-'}`);
      }
    }

    console.log('');
    clawck.close();
  });

// ─── Report ───────────────────────────────────────────────

const reportCmd = program
  .command('report')
  .description('Show a timesheet summary')
  .option('-d, --dir <path>', 'Data directory')
  .option('--days <number>', 'Number of days to include')
  .option('--period <type>', 'Time period (day, week, month, year, custom)')
  .option('--from <date>', 'Start date (YYYY-MM-DD or ISO)')
  .option('--to <date>', 'End date (YYYY-MM-DD or ISO)')
  .option('--style <type>', 'Report style (full, short, visual, text, table, calendar)', 'full')
  .option('--client <name>', 'Filter by client')
  .option('--project <name>', 'Filter by project')
  .option('--agent <name>', 'Filter by agent')
  .option('--format <type>', 'Output format (terminal, pdf, or html)', 'terminal')
  .option('--output <path>', 'Output file path (for pdf/html format)')
  .option('--detailed', 'Show individual entries')
  .option('--save', 'Save report to database')
  .option('--name <name>', 'Name for saved report')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();

    // Resolve time period
    const resolved = resolvePeriod({
      period: opts.period as ReportPeriod | undefined,
      from: opts.from,
      to: opts.to,
      days: opts.days ? parseInt(opts.days) : undefined,
    });
    const { from, to, period } = resolved;

    // --detailed maps to style='table' when no explicit --style
    const style: ReportStyle = opts.detailed && opts.style === 'full' ? 'table' : (opts.style as ReportStyle);

    const ts = clawck.timesheet(from, to, {
      client: opts.client,
      project: opts.project,
      agent: opts.agent,
    });

    const periodLabel = opts.period || (opts.days ? `${opts.days} days` : period);
    let reportContent = '';

    if (opts.format === 'html') {
      const today = new Date().toISOString().split('T')[0];
      const outputPath = opts.output || `clawck-report-${today}.html`;
      const dateRange = `${from.split('T')[0]} to ${to.split('T')[0]}`;
      const rawEntries = clawck.query({ from, to, client: opts.client, project: opts.project, agent: opts.agent, limit: 10000 });
      const html = generateTimesheetHTML(ts, { dateRange, clientName: opts.client, rawEntries, style });
      reportContent = html;
      fs.writeFileSync(outputPath, html);
      console.log(`  HTML report saved to: ${outputPath}`);
    } else if (opts.format === 'pdf') {
      const today = new Date().toISOString().split('T')[0];
      const outputPath = opts.output || `clawck-report-${today}.pdf`;
      const dateRange = `${from.split('T')[0]} to ${to.split('T')[0]}`;
      await generateTimesheetPDF(ts, {
        clientName: opts.client,
        dateRange,
        outputPath,
        style,
      });
      reportContent = fs.readFileSync(outputPath).toString('base64');
      console.log(`  PDF report saved to: ${outputPath}`);
    } else {
      // Terminal output
      if (program.opts().json) {
        reportContent = JSON.stringify(ts);
        console.log(reportContent);
      } else {
        const totalAgentRuntimeMin = ts.entries.reduce((s, r) => s + (r.agent_total_runtime_minutes || 0), 0);

        if (style === 'table') {
          const entries = clawck.query({ client: opts.client, project: opts.project, agent: opts.agent, from, to, limit: 500 });
          printEntryTable(entries);
        } else if (style === 'short') {
          console.log(`\n  📋 Clawck Timesheet — ${periodLabel}`);
          console.log(`  ${'─'.repeat(50)}`);
          console.log(`  ⏱️  Total runtime:    ${ts.total_agent_hours.toFixed(2)} hrs`);
          if (totalAgentRuntimeMin > 0) {
            console.log(`  🤖 Agent runtime:     ${formatDuration(totalAgentRuntimeMin)} (estimated)`);
          }
          if (ts.total_agent_merged_runtime_hours > 0) {
            const mergedLine = `  🔀 Merged runtime:    ${ts.total_agent_merged_runtime_hours.toFixed(2)} hrs`;
            const parallelRatio = ts.total_agent_hours > 0 && ts.total_agent_merged_runtime_hours < ts.total_agent_hours
              ? ` (${(ts.total_agent_hours / ts.total_agent_merged_runtime_hours).toFixed(1)}x parallelization)`
              : '';
            console.log(mergedLine + parallelRatio);
          }
          console.log(`  👤 Human equiv:       ${ts.total_human_equiv_hours.toFixed(2)} hrs`);
          console.log(`  💰 Agent cost:        $${ts.total_cost_usd.toFixed(2)}`);
          console.log(`  💚 Est. savings:      $${ts.total_savings_usd.toFixed(0)}`);
          console.log(`  ⏰ Time saved:        ${ts.total_time_saved_hours.toFixed(1)} hrs`);
          console.log(`  🔢 Total entries:     ${ts.total_entries}`);
          console.log(`  🪙 Total tokens:      ${ts.total_tokens.toLocaleString()} (${ts.total_tokens_in.toLocaleString()} in / ${ts.total_tokens_out.toLocaleString()} out)`);
          console.log('');
        } else {
          // full, text, visual, calendar all fall back to full terminal output
          console.log(`\n  📋 Clawck Timesheet — ${periodLabel}`);
          console.log(`  ${'─'.repeat(50)}`);
          console.log(`  ⏱️  Total runtime:    ${ts.total_agent_hours.toFixed(2)} hrs`);
          if (totalAgentRuntimeMin > 0) {
            console.log(`  🤖 Agent runtime:     ${formatDuration(totalAgentRuntimeMin)} (estimated)`);
          }
          if (ts.total_agent_merged_runtime_hours > 0) {
            const mergedLine = `  🔀 Merged runtime:    ${ts.total_agent_merged_runtime_hours.toFixed(2)} hrs`;
            const parallelRatio = ts.total_agent_hours > 0 && ts.total_agent_merged_runtime_hours < ts.total_agent_hours
              ? ` (${(ts.total_agent_hours / ts.total_agent_merged_runtime_hours).toFixed(1)}x parallelization)`
              : '';
            console.log(mergedLine + parallelRatio);
          }
          console.log(`  👤 Human equiv:       ${ts.total_human_equiv_hours.toFixed(2)} hrs`);
          console.log(`  💰 Agent cost:        $${ts.total_cost_usd.toFixed(2)}`);
          console.log(`  💚 Est. savings:      $${ts.total_savings_usd.toFixed(0)}`);
          console.log(`  ⏰ Time saved:        ${ts.total_time_saved_hours.toFixed(1)} hrs`);
          console.log(`  🔢 Total entries:     ${ts.total_entries}`);
          console.log(`  🪙 Total tokens:      ${ts.total_tokens.toLocaleString()} (${ts.total_tokens_in.toLocaleString()} in / ${ts.total_tokens_out.toLocaleString()} out)`);

          if (ts.by_project.length > 0) {
            console.log(`\n  📁 By Project:`);
            for (const p of ts.by_project) {
              const bar = '█'.repeat(Math.max(1, Math.round(p.agent_hours / (ts.total_agent_hours || 1) * 20)));
              console.log(`  ${bar} ${p.project} (${p.client}): ${p.agent_hours.toFixed(2)}h → ${p.human_equiv_hours.toFixed(2)}h human equiv`);
            }
          }

          if (ts.by_agent.length > 0) {
            console.log(`\n  🤖 By Agent:`);
            for (const a of ts.by_agent) {
              console.log(`  • ${a.agent} (${a.model}): ${a.agent_hours.toFixed(2)}h, ${a.success_rate}% success`);
            }
          }

          console.log('');
        }
      }
    }

    // Save report if requested
    if (opts.save) {
      const metadata = {
        filters: { client: opts.client, project: opts.project, agent: opts.agent },
        total_entries: ts.total_entries,
        total_agent_hours: ts.total_agent_hours,
        total_cost_usd: ts.total_cost_usd,
        total_savings_usd: ts.total_savings_usd,
      };
      const saved = clawck.saveReport({
        name: opts.name || `Report ${new Date().toISOString().split('T')[0]}`,
        period,
        period_start: from,
        period_end: to,
        style,
        format: opts.format as ReportFormat,
        content: reportContent || JSON.stringify(ts),
        metadata,
      });
      console.log(`  Report saved: ${saved.id.slice(0, 8)}`);
    }

    clawck.close();
  });

// ─── Report Subcommands ─────────────────────────────────

reportCmd
  .command('list')
  .description('List saved reports')
  .option('-d, --dir <path>', 'Data directory')
  .option('--limit <n>', 'Max reports to show', '20')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const reports = clawck.listReports(parseInt(opts.limit) || 20);

    if (program.opts().json) {
      console.log(JSON.stringify(reports));
      clawck.close();
      return;
    }

    if (reports.length === 0) {
      console.log('\n  No saved reports.\n');
      clawck.close();
      return;
    }

    console.log(`\n  Saved Reports:`);
    console.log(`  ${'ID'.padEnd(10)} ${'Name'.padEnd(30)} ${'Period'.padEnd(8)} ${'Style'.padEnd(10)} ${'Format'.padEnd(10)} ${'Date'}`);
    console.log(`  ${'─'.repeat(80)}`);
    for (const r of reports) {
      console.log(`  ${r.id.slice(0, 8).padEnd(10)} ${(r.name || '-').slice(0, 28).padEnd(30)} ${r.period.padEnd(8)} ${r.style.padEnd(10)} ${r.format.padEnd(10)} ${r.created_at.split('T')[0]}`);
    }
    console.log('');
    clawck.close();
  });

reportCmd
  .command('show <id>')
  .description('Retrieve a saved report')
  .option('-d, --dir <path>', 'Data directory')
  .option('--output <path>', 'Write content to file')
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const report = clawck.getReport(id);

    if (!report) {
      console.error(`  Report not found: ${id}`);
      clawck.close();
      process.exit(1);
    }

    if (opts.output) {
      const content = typeof report.content === 'string' ? report.content : report.content;
      fs.writeFileSync(opts.output, content);
      console.log(`  Report written to: ${opts.output}`);
    } else if (program.opts().json) {
      console.log(JSON.stringify(report));
    } else {
      console.log(typeof report.content === 'string' ? report.content : '[binary content — use --output to save]');
    }
    clawck.close();
  });

reportCmd
  .command('delete <id>')
  .description('Delete a saved report')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const deleted = clawck.deleteReport(id);

    if (!deleted) {
      console.error(`  Report not found: ${id}`);
      clawck.close();
      process.exit(1);
    }

    if (program.opts().json) {
      console.log(JSON.stringify({ ok: true }));
    } else {
      console.log(`  Report deleted.`);
    }
    clawck.close();
  });

// ─── Start ───────────────────────────────────────────────

program
  .command('start <task>')
  .description('Start tracking time for a task')
  .option('-d, --dir <path>', 'Data directory')
  .option('--project <name>', 'Project name')
  .option('--client <name>', 'Client name')
  .option('--category <type>', 'Task category')
  .option('--agent <name>', 'Agent name')
  .option('--model <name>', 'Model name')
  .option('--tags <tags...>', 'Tags')
  .option('--pattern <name>', 'Use a tracking pattern')
  .action(async (task, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const entry = clawck.start({
      task,
      project: opts.project,
      client: opts.client,
      category: opts.category,
      agent: opts.agent,
      model: opts.model,
      tags: opts.tags,
      pattern: opts.pattern,
    });

    if (program.opts().json) {
      console.log(JSON.stringify(entry));
    } else {
      console.log(`  Started: ${entry.task}`);
      console.log(`  ID:      ${entry.id}`);
      console.log(`  Project: ${entry.project}  Client: ${entry.client}`);
    }
    clawck.close();
  });

// ─── Stop ────────────────────────────────────────────────

program
  .command('stop <id>')
  .description('Stop tracking time for a task')
  .option('-d, --dir <path>', 'Data directory')
  .option('--status <status>', 'Outcome (completed/failed)', 'completed')
  .option('--summary <text>', 'Summary of work done')
  .option('--tokens-in <n>', 'Input tokens consumed', parseFloat)
  .option('--tokens-out <n>', 'Output tokens generated', parseFloat)
  .option('--cost <n>', 'Cost in USD', parseFloat)
  .option('--tool-calls <n>', 'Number of tool calls', parseInt)
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const entry = clawck.stop({
      id,
      status: opts.status,
      summary: opts.summary,
      tokens_in: opts.tokensIn,
      tokens_out: opts.tokensOut,
      cost_usd: opts.cost,
      tool_calls: opts.toolCalls,
    });

    if (!entry) {
      if (program.opts().json) {
        console.log(JSON.stringify({ ok: false, error: `Entry not found: ${id}` }));
      } else {
        console.error(`  Entry not found: ${id}`);
      }
      clawck.close();
      process.exit(1);
    }

    const duration_minutes = entry.end
      ? (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000
      : null;

    if (program.opts().json) {
      console.log(JSON.stringify({ ...entry, duration_minutes: duration_minutes ? Math.round(duration_minutes * 100) / 100 : null }));
    } else {
      console.log(`  Stopped: ${entry.task}`);
      console.log(`  Wall clock: ${duration_minutes !== null ? formatDuration(duration_minutes) : 'unknown'}  Status: ${entry.status}`);
      if (entry.agent_runtime_ms != null) {
        console.log(`  Agent runtime (est.): ${formatDuration(entry.agent_runtime_ms / 60000)}`);
      }
    }
    clawck.close();
  });

// ─── Log ─────────────────────────────────────────────────

program
  .command('log <task>')
  .description('Log a completed task retroactively')
  .option('-d, --dir <path>', 'Data directory')
  .option('--duration <minutes>', 'Duration in minutes', parseFloat)
  .option('--project <name>', 'Project name')
  .option('--client <name>', 'Client name')
  .option('--category <type>', 'Task category')
  .option('--agent <name>', 'Agent name')
  .option('--model <name>', 'Model name')
  .option('--summary <text>', 'Summary of work done')
  .option('--tags <tags...>', 'Tags')
  .option('--pattern <name>', 'Use a tracking pattern')
  .action(async (task, opts) => {
    if (!opts.duration) {
      console.error('  --duration <minutes> is required');
      process.exit(1);
    }
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const entry = clawck.log({
      task,
      duration_minutes: opts.duration,
      project: opts.project,
      client: opts.client,
      category: opts.category,
      agent: opts.agent,
      model: opts.model,
      summary: opts.summary,
      tags: opts.tags,
      pattern: opts.pattern,
    });

    if (program.opts().json) {
      console.log(JSON.stringify(entry));
    } else {
      console.log(`  Logged: ${entry.task}`);
      console.log(`  ID: ${entry.id}  Duration: ${opts.duration}m`);
    }
    clawck.close();
  });

// ─── Get ─────────────────────────────────────────────────

program
  .command('get <id>')
  .description('Get a single time entry by ID')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const entry = clawck.get(id);

    if (!entry) {
      if (program.opts().json) {
        console.log(JSON.stringify({ ok: false, error: `Entry not found: ${id}` }));
      } else {
        console.error(`  Entry not found: ${id}`);
      }
      clawck.close();
      process.exit(1);
    }

    if (program.opts().json) {
      console.log(JSON.stringify(entry));
    } else {
      console.log(`  ${entry.task}`);
      console.log(`  ID: ${entry.id}  Status: ${entry.status}`);
      console.log(`  Project: ${entry.project}  Client: ${entry.client}`);
      console.log(`  Agent: ${entry.agent}  Model: ${entry.model}`);
      console.log(`  Start: ${entry.start}  End: ${entry.end || '(running)'}`);
      console.log(`  Approved: ${entry.approved ? 'yes' : 'no'}`);
      console.log(`  Created: ${entry.created_at}  Updated: ${entry.updated_at}`);
    }
    clawck.close();
  });

// ─── Entries ─────────────────────────────────────────────

program
  .command('entries')
  .description('Query time entries')
  .option('-d, --dir <path>', 'Data directory')
  .option('--client <name>', 'Filter by client')
  .option('--project <name>', 'Filter by project')
  .option('--agent <name>', 'Filter by agent')
  .option('--status <status>', 'Filter by status')
  .option('--from <date>', 'Start date (ISO 8601)')
  .option('--to <date>', 'End date (ISO 8601)')
  .option('--limit <n>', 'Max entries', '50')
  .option('--approved', 'Show only approved entries')
  .option('--unapproved', 'Show only unapproved entries')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const approvedFilter = opts.approved ? true : opts.unapproved ? false : undefined;
    const entries = clawck.query({
      client: opts.client,
      project: opts.project,
      agent: opts.agent,
      status: opts.status,
      from: opts.from,
      to: opts.to,
      limit: parseInt(opts.limit) || 50,
      approved: approvedFilter,
    });

    if (program.opts().json) {
      console.log(JSON.stringify(entries));
    } else {
      console.log(`\n  ${entries.length} entries:`);
      for (const e of entries) {
        const dur = e.end
          ? `${((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000).toFixed(0)}m`
          : 'running';
        console.log(`  ${e.id.slice(0, 8)}  ${e.status.padEnd(9)}  ${dur.padStart(6)}  ${e.project}/${e.client}  ${e.task.slice(0, 50)}`);
      }
    }
    console.log('');
    clawck.close();
  });

// ─── Approve ─────────────────────────────────────────────

program
  .command('approve <id>')
  .description('Approve a time entry (supports 8-char prefix)')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const entry = resolveEntryId(clawck, id);

    if (!entry) {
      clawck.close();
      process.exit(1);
    }

    const approved = clawck.approve(entry.id);

    if (program.opts().json) {
      console.log(JSON.stringify(approved));
    } else {
      console.log(`  Approved: ${approved!.task}`);
      console.log(`  ID: ${approved!.id.slice(0, 8)}  Project: ${approved!.project}`);
    }
    clawck.close();
  });

// ─── Pattern ─────────────────────────────────────────────

const pattern = program
  .command('pattern')
  .description('Manage tracking patterns (task templates)');

pattern
  .command('list')
  .description('List all tracking patterns')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const patterns = clawck.getPatterns();

    if (program.opts().json) {
      console.log(JSON.stringify(patterns));
      clawck.close();
      return;
    }

    console.log(`\n  Tracking Patterns:`);
    for (const p of patterns) {
      const defaultMark = config.default_pattern === p.name ? ' (default)' : '';
      console.log(`  - ${p.name}${defaultMark}`);
      if (p.description) console.log(`    ${p.description}`);
      const fields: string[] = [];
      if (p.category) fields.push(`category: ${p.category}`);
      if (p.project) fields.push(`project: ${p.project}`);
      if (p.client) fields.push(`client: ${p.client}`);
      if (p.agent) fields.push(`agent: ${p.agent}`);
      if (p.tags?.length) fields.push(`tags: ${p.tags.join(', ')}`);
      if (fields.length) console.log(`    ${fields.join('  ')}`);
    }
    console.log('');
    clawck.close();
  });

pattern
  .command('add')
  .description('Add a new tracking pattern')
  .requiredOption('--name <name>', 'Pattern name')
  .option('-d, --dir <path>', 'Data directory')
  .option('--category <type>', 'Default category')
  .option('--project <name>', 'Default project')
  .option('--client <name>', 'Default client')
  .option('--agent <name>', 'Default agent')
  .option('--tags <tags...>', 'Default tags')
  .option('--description <text>', 'Pattern description')
  .action(async (opts) => {
    const dataDir = resolveDataDir(opts);
    loadConfig(dataDir);
    const configPath = path.join(path.resolve(dataDir), 'config.json');

    const newPattern: TrackingPattern = { name: opts.name };
    if (opts.description) newPattern.description = opts.description;
    if (opts.category) newPattern.category = opts.category;
    if (opts.project) newPattern.project = opts.project;
    if (opts.client) newPattern.client = opts.client;
    if (opts.agent) newPattern.agent = opts.agent;
    if (opts.tags) newPattern.tags = opts.tags;

    let fileConfig: any = {};
    if (fs.existsSync(configPath)) {
      try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
    }
    if (!fileConfig.patterns) fileConfig.patterns = [...DEFAULT_PATTERNS];
    fileConfig.patterns.push(newPattern);
    fs.writeFileSync(configPath, JSON.stringify(fileConfig, null, 2));

    console.log(`  Added pattern: ${opts.name}`);
  });

pattern
  .command('use <name>')
  .description('Set the default tracking pattern')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (name, opts) => {
    const dataDir = resolveDataDir(opts);
    const configPath = path.join(path.resolve(dataDir), 'config.json');

    let fileConfig: any = {};
    if (fs.existsSync(configPath)) {
      try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
    }
    fileConfig.default_pattern = name;
    fs.writeFileSync(configPath, JSON.stringify(fileConfig, null, 2));

    console.log(`  Default pattern set to: ${name}`);
  });

// ─── Config Profiles ─────────────────────────────────────

const profile = program
  .command('profile')
  .description('Manage configuration profiles (presets for different clients/projects)');

profile
  .command('list')
  .description('List all config profiles')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const dataDir = path.resolve(resolveDataDir(opts));
    const profilesDir = path.join(dataDir, 'profiles');
    const activeProfilePath = path.join(dataDir, '.active-profile');

    // Get active profile
    let activeProfile = 'default';
    if (fs.existsSync(activeProfilePath)) {
      activeProfile = fs.readFileSync(activeProfilePath, 'utf-8').trim();
    }

    // List profiles
    const profiles: { name: string; active: boolean; client?: string; project?: string }[] = [];

    // Default profile (main config.json)
    const defaultConfig = path.join(dataDir, 'config.json');
    if (fs.existsSync(defaultConfig)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(defaultConfig, 'utf-8'));
        profiles.push({
          name: 'default',
          active: activeProfile === 'default',
          client: cfg.default_client,
          project: cfg.default_project,
        });
      } catch {
        profiles.push({ name: 'default', active: activeProfile === 'default' });
      }
    }

    // Named profiles
    if (fs.existsSync(profilesDir)) {
      for (const file of fs.readdirSync(profilesDir)) {
        if (file.endsWith('.json')) {
          const name = file.replace('.json', '');
          try {
            const cfg = JSON.parse(fs.readFileSync(path.join(profilesDir, file), 'utf-8'));
            profiles.push({
              name,
              active: activeProfile === name,
              client: cfg.default_client,
              project: cfg.default_project,
            });
          } catch {
            profiles.push({ name, active: activeProfile === name });
          }
        }
      }
    }

    if (program.opts().json) {
      console.log(JSON.stringify(profiles));
      return;
    }

    console.log(`\n  Config Profiles:`);
    console.log(`  ${'─'.repeat(50)}`);
    for (const p of profiles) {
      const activeMark = p.active ? ' (active)' : '';
      const details: string[] = [];
      if (p.client) details.push(`client: ${p.client}`);
      if (p.project) details.push(`project: ${p.project}`);
      const detailsStr = details.length > 0 ? ` — ${details.join(', ')}` : '';
      console.log(`  ${p.active ? '●' : '○'} ${p.name}${activeMark}${detailsStr}`);
    }
    console.log('');
  });

profile
  .command('create <name>')
  .description('Create a new config profile')
  .option('-d, --dir <path>', 'Data directory')
  .option('--client <name>', 'Default client for this profile')
  .option('--project <name>', 'Default project for this profile')
  .option('--agent <name>', 'Default agent for this profile')
  .option('--model <name>', 'Default model for this profile')
  .option('--copy-from <profile>', 'Copy settings from another profile')
  .action(async (name, opts) => {
    const dataDir = path.resolve(resolveDataDir(opts));
    const profilesDir = path.join(dataDir, 'profiles');
    const profilePath = path.join(profilesDir, `${name}.json`);

    if (name === 'default') {
      console.error('  Cannot create a profile named "default". Edit config.json directly.');
      process.exit(1);
    }

    // Create profiles directory if needed
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true });
    }

    if (fs.existsSync(profilePath)) {
      console.error(`  Profile "${name}" already exists. Use "clawck profile edit ${name}" or delete it first.`);
      process.exit(1);
    }

    // Start with base config or copy from another profile
    let baseConfig: any = {};
    if (opts.copyFrom) {
      const sourcePath = opts.copyFrom === 'default'
        ? path.join(dataDir, 'config.json')
        : path.join(profilesDir, `${opts.copyFrom}.json`);
      if (fs.existsSync(sourcePath)) {
        try {
          baseConfig = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
        } catch {}
      } else {
        console.error(`  Source profile "${opts.copyFrom}" not found.`);
        process.exit(1);
      }
    }

    // Apply overrides
    if (opts.client) baseConfig.default_client = opts.client;
    if (opts.project) baseConfig.default_project = opts.project;
    if (opts.agent) baseConfig.default_agent = opts.agent;
    if (opts.model) baseConfig.default_model = opts.model;

    fs.writeFileSync(profilePath, JSON.stringify(baseConfig, null, 2));

    if (program.opts().json) {
      console.log(JSON.stringify({ ok: true, name, path: profilePath }));
    } else {
      console.log(`  Created profile: ${name}`);
      console.log(`  Path: ${profilePath}`);
      console.log(`\n  Activate with: clawck profile use ${name}`);
    }
  });

profile
  .command('use <name>')
  .description('Switch to a config profile')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (name, opts) => {
    const dataDir = path.resolve(resolveDataDir(opts));
    const profilesDir = path.join(dataDir, 'profiles');
    const activeProfilePath = path.join(dataDir, '.active-profile');

    // Verify profile exists
    if (name !== 'default') {
      const profilePath = path.join(profilesDir, `${name}.json`);
      if (!fs.existsSync(profilePath)) {
        console.error(`  Profile "${name}" not found. Create it with: clawck profile create ${name}`);
        process.exit(1);
      }
    }

    fs.writeFileSync(activeProfilePath, name);

    if (program.opts().json) {
      console.log(JSON.stringify({ ok: true, active: name }));
    } else {
      console.log(`  Switched to profile: ${name}`);
    }
  });

profile
  .command('show [name]')
  .description('Show a config profile\'s settings')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (name, opts) => {
    const dataDir = path.resolve(resolveDataDir(opts));
    const profilesDir = path.join(dataDir, 'profiles');
    const activeProfilePath = path.join(dataDir, '.active-profile');

    // Default to active profile if none specified
    if (!name) {
      if (fs.existsSync(activeProfilePath)) {
        name = fs.readFileSync(activeProfilePath, 'utf-8').trim();
      } else {
        name = 'default';
      }
    }

    const profilePath = name === 'default'
      ? path.join(dataDir, 'config.json')
      : path.join(profilesDir, `${name}.json`);

    if (!fs.existsSync(profilePath)) {
      console.error(`  Profile "${name}" not found.`);
      process.exit(1);
    }

    try {
      const cfg = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      if (program.opts().json) {
        console.log(JSON.stringify({ name, ...cfg }));
      } else {
        console.log(`\n  Profile: ${name}`);
        console.log(`  ${'─'.repeat(40)}`);
        console.log(`  Client:  ${cfg.default_client || '(not set)'}`);
        console.log(`  Project: ${cfg.default_project || '(not set)'}`);
        console.log(`  Agent:   ${cfg.default_agent || '(not set)'}`);
        console.log(`  Model:   ${cfg.default_model || '(not set)'}`);
        console.log(`  Port:    ${cfg.port || 3456}`);
        if (cfg.patterns?.length) {
          console.log(`  Patterns: ${cfg.patterns.length}`);
        }
        console.log('');
      }
    } catch {
      console.error(`  Failed to parse profile: ${profilePath}`);
      process.exit(1);
    }
  });

profile
  .command('delete <name>')
  .description('Delete a config profile')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (name, opts) => {
    const dataDir = path.resolve(resolveDataDir(opts));
    const profilesDir = path.join(dataDir, 'profiles');
    const activeProfilePath = path.join(dataDir, '.active-profile');

    if (name === 'default') {
      console.error('  Cannot delete the default profile.');
      process.exit(1);
    }

    const profilePath = path.join(profilesDir, `${name}.json`);
    if (!fs.existsSync(profilePath)) {
      console.error(`  Profile "${name}" not found.`);
      process.exit(1);
    }

    fs.unlinkSync(profilePath);

    // If this was the active profile, switch back to default
    if (fs.existsSync(activeProfilePath)) {
      const active = fs.readFileSync(activeProfilePath, 'utf-8').trim();
      if (active === name) {
        fs.writeFileSync(activeProfilePath, 'default');
      }
    }

    if (program.opts().json) {
      console.log(JSON.stringify({ ok: true, deleted: name }));
    } else {
      console.log(`  Deleted profile: ${name}`);
    }
  });

// ─── Setup ───────────────────────────────────────────────

program
  .command('setup [target]')
  .description('Output ready-to-paste config snippets for agent integration')
  .action(async (target) => {
    const snippetsDir = path.resolve(__dirname, '../../docs/snippets');

    function readSnippet(filename: string): string {
      const filePath = path.join(snippetsDir, filename);
      if (!fs.existsSync(filePath)) {
        console.error(`  Snippet not found: ${filePath}`);
        process.exit(1);
      }
      return fs.readFileSync(filePath, 'utf-8');
    }

    if (!target) {
      console.log(`
  ⏱️🦀 Clawck Setup — Agent Integration

  Available targets:

    clawck setup claude      Output CLAUDE.md time tracking snippet
    clawck setup mcp         Output MCP server config JSON
    clawck setup openclaw    Output OpenClaw hook config (handler.ts + hook.json)
    clawck setup gemini      Output Gemini CLI hook config
    clawck setup cursor      Output Cursor hook config

  Paste the output into the appropriate file for your agent platform.
  See docs/skills/clawck-setup.md for full integration guide.
`);
      return;
    }

    switch (target) {
      case 'claude': {
        console.log('\n# Add this to your CLAUDE.md (project or ~/.claude/CLAUDE.md for global):\n');
        console.log(readSnippet('claude-md.txt'));
        break;
      }
      case 'mcp': {
        console.log('\n# Add this to your mcp_servers.json (or ~/.claude/mcp_servers.json for global):\n');
        console.log(readSnippet('mcp-config.json'));
        break;
      }
      case 'openclaw': {
        console.log(`
  ⏱️🦀 Clawck Setup — OpenClaw Hooks

  Create directory: ~/.openclaw/hooks/clawck-auto/

  Then add these two files:
`);
        console.log('\n# ─── ~/.openclaw/hooks/clawck-auto/hook.json ──────────\n');
        console.log(readSnippet('openclaw-hook.json'));
        console.log('\n# ─── ~/.openclaw/hooks/clawck-auto/handler.ts ─────────\n');
        console.log(readSnippet('openclaw-handler.ts'));
        console.log(`
  Signal File Support:
  The handler reads .agent-done files with epoch timestamps:
  { "start_ms": 1710000000000, "end_ms": 1710000060000 }

  Agent Markdown (for MCP-based tracking):
`);
        console.log(readSnippet('openclaw-agent-md.txt'));
        break;
      }
      case 'gemini': {
        console.log('\n# Add this to your ~/.gemini/settings.json:\n');
        console.log(readSnippet('hooks-gemini.json'));
        break;
      }
      case 'cursor': {
        console.log('\n# Add this to your .cursor/hooks.json:\n');
        console.log(readSnippet('hooks-cursor.json'));
        break;
      }
      default:
        console.error(`  Unknown target: "${target}". Run "clawck setup" to see options.`);
        process.exit(1);
    }
  });

// ─── Seed (for testing) ──────────────────────────────────

program
  .command('seed')
  .description('Seed the database with sample entries (for testing)')
  .option('-d, --dir <path>', 'Data directory')
  .option('-n, --count <number>', 'Number of entries', '25')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const count = parseInt(opts.count) || 25;

    const agents = ['research-agent-01', 'writer-agent-02', 'coder-agent-03', 'analyst-agent-04', 'outreach-agent-05'];
    const models = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'gpt-4o', 'gemini-2.0-flash'];
    const clients = ['acme-corp', 'globex-inc', 'initech', 'hooli', 'umbrella-co'];
    const projects = ['website-rebuild', 'seo-content', 'grant-research', 'data-migration', 'email-campaigns', 'api-v2'];
    const categories = ['research', 'content', 'code', 'data_entry', 'analysis', 'communication', 'testing', 'design', 'planning', 'other'] as const;
    const tasks = [
      'Research competitor pricing strategies',
      'Write blog post about AI automation',
      'Refactor authentication module',
      'Migrate legacy CSV data to new schema',
      'Analyze Q3 customer churn patterns',
      'Draft outreach emails for partnership',
      'Write unit tests for payment flow',
      'Design email template for newsletter',
      'Find relevant grant opportunities',
      'Compile industry benchmark report',
      'Update API documentation',
      'Generate social media content calendar',
      'Review and optimize database queries',
      'Create investor pitch deck outline',
      'Summarize recent industry news',
      'Plan sprint roadmap for Q4',
      'Coordinate team standup notes',
    ];

    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

    // Ensure coverage: cycle through all clients, projects, categories, agents
    for (let i = 0; i < count; i++) {
      const durationMin = 5 + Math.random() * 120;
      const tokensIn = Math.round(1000 + Math.random() * 50000);
      const tokensOut = Math.round(500 + Math.random() * 20000);
      const category = i < categories.length ? categories[i] : pick(categories);
      const client = i < clients.length ? clients[i] : pick(clients);
      const project = i < projects.length ? projects[i] : pick(projects);
      const agent = i < agents.length ? agents[i] : pick(agents);

      const entry = clawck.log({
        task: pick(tasks),
        project,
        client,
        category,
        agent,
        model: pick(models),
        duration_minutes: Math.round(durationMin),
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: Math.round((tokensIn * 0.000003 + tokensOut * 0.000015) * 10000) / 10000,
        summary: 'Auto-generated seed entry for testing',
        tags: ['seed', 'test'],
      });

      // Approve ~60% of completed entries
      if (Math.random() < 0.6) {
        clawck.approve(entry.id);
      }
    }

    // Add 2-3 running entries
    for (let i = 0; i < 3; i++) {
      clawck.start({
        task: pick(tasks),
        project: pick(projects),
        client: pick(clients),
        category: pick(categories),
        agent: pick(agents),
        model: pick(models),
        tags: ['seed'],
      });
    }

    // Add 2-3 failed entries via upsert
    const { v4: uuid } = await import('uuid');
    for (let i = 0; i < 3; i++) {
      const daysAgo = Math.random() * 7;
      const start = new Date(Date.now() - daysAgo * 86400000);
      const end = new Date(start.getTime() + (10 + Math.random() * 30) * 60000);
      clawck.upsert({
        id: uuid(),
        task: pick(tasks),
        project: pick(projects),
        client: pick(clients),
        category: pick(categories),
        agent: pick(agents),
        model: pick(models),
        start: start.toISOString(),
        end: end.toISOString(),
        status: 'failed',
        tokens_in: Math.round(500 + Math.random() * 5000),
        tokens_out: Math.round(100 + Math.random() * 1000),
        cost_usd: Math.round(Math.random() * 0.05 * 10000) / 10000,
        tool_calls: Math.round(Math.random() * 5),
        summary: 'Task failed - auto-generated seed entry',
        tags: ['seed', 'failed'],
        source: 'clawck',
        spec_version: SPEC_VERSION,
      });
    }

    console.log(`\n  ⏱️🦀 Seeded ${count + 6} entries into Clawck!`);
    console.log(`  ├─ ${count} completed entries (~60% approved)`);
    console.log(`  ├─ 3 running entries`);
    console.log(`  ├─ 3 failed entries`);
    console.log(`  │`);
    console.log(`  │  Try these:`);
    console.log(`  │  clawck list -d ${resolveDataDir(opts)}`);
    console.log(`  │  clawck report --format html -d ${resolveDataDir(opts)}`);
    console.log(`  │  clawck pattern list -d ${resolveDataDir(opts)}`);
    console.log(`  │  clawck entries --approved -d ${resolveDataDir(opts)}`);
    console.log(`  └─ clawck serve -d ${resolveDataDir(opts)}\n`);
    clawck.close();
  });

// ─── Backup ──────────────────────────────────────────────

program
  .command('backup')
  .description('Backup database and config to a .tar.gz archive')
  .option('-d, --dir <path>', 'Data directory')
  .option('-o, --output <path>', 'Output path for backup file')
  .action(async (opts) => {
    const dataDir = path.resolve(resolveDataDir(opts));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = opts.output || `clawck-backup-${timestamp}.tar.gz`;

    const dbPath = path.join(dataDir, 'clawck.db');
    const configPath = path.join(dataDir, 'config.json');

    // Verify at least the database exists
    if (!fs.existsSync(dbPath)) {
      console.error(`  Database not found: ${dbPath}`);
      console.error('  Run "clawck init" first to create a Clawck directory.');
      process.exit(1);
    }

    // Load entries for JSONL export
    const config = loadConfig(dataDir);
    const clawck = await new Clawck(config).ready();
    const entries = clawck.query({ limit: 100000 });
    const stats = clawck.stats();
    clawck.close();

    // Create temporary entries.jsonl
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'clawck-backup-'));
    const jsonlPath = path.join(tmpDir, 'entries.jsonl');
    const jsonlContent = entries.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(jsonlPath, jsonlContent);

    // Copy db and config to temp dir
    fs.copyFileSync(dbPath, path.join(tmpDir, 'clawck.db'));
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, path.join(tmpDir, 'config.json'));
    }

    // Create tar.gz using tar command
    const { execSync } = require('child_process');
    const absOutput = path.resolve(outputPath);
    execSync(`tar -czf "${absOutput}" -C "${tmpDir}" .`, { stdio: 'pipe' });

    // Get file size
    const backupStats = fs.statSync(absOutput);
    const sizeKb = (backupStats.size / 1024).toFixed(1);

    // Cleanup temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (program.opts().json) {
      console.log(JSON.stringify({
        ok: true,
        path: absOutput,
        size_bytes: backupStats.size,
        entry_count: stats.total_entries,
      }));
    } else {
      console.log(`\n  ⏱️🦀 Backup created!`);
      console.log(`  ├─ File:    ${absOutput}`);
      console.log(`  ├─ Size:    ${sizeKb} KB`);
      console.log(`  ├─ Entries: ${stats.total_entries}`);
      console.log(`  └─ Use "clawck restore ${path.basename(absOutput)}" to restore.\n`);
    }
  });

// ─── Restore ─────────────────────────────────────────────

program
  .command('restore <backup-path>')
  .description('Restore database and config from a .tar.gz backup')
  .option('-d, --dir <path>', 'Data directory')
  .option('--force', 'Skip confirmation prompt')
  .action(async (backupPath, opts) => {
    const dataDir = path.resolve(resolveDataDir(opts));
    const absBackup = path.resolve(backupPath);

    if (!fs.existsSync(absBackup)) {
      console.error(`  Backup file not found: ${absBackup}`);
      process.exit(1);
    }

    // Check if data dir exists and has data
    const existingDb = path.join(dataDir, 'clawck.db');
    const hasExistingData = fs.existsSync(existingDb);

    // Confirmation prompt unless --force
    if (hasExistingData && !opts.force) {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const answer = await new Promise<string>((resolve) => {
        rl.question(`  Existing data found in ${dataDir}. Overwrite? (y/N) `, resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('  Restore cancelled.');
        process.exit(0);
      }
    }

    // Create data directory if needed
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Extract backup
    const { execSync } = require('child_process');
    execSync(`tar -xzf "${absBackup}" -C "${dataDir}"`, { stdio: 'pipe' });

    // Verify restored files
    const restoredDb = fs.existsSync(path.join(dataDir, 'clawck.db'));
    const restoredConfig = fs.existsSync(path.join(dataDir, 'config.json'));
    const restoredJsonl = fs.existsSync(path.join(dataDir, 'entries.jsonl'));

    // Count entries in restored database
    let entryCount = 0;
    if (restoredDb) {
      const config = loadConfig(dataDir);
      const clawck = await new Clawck(config).ready();
      entryCount = clawck.stats().total_entries;
      clawck.close();
    }

    if (program.opts().json) {
      console.log(JSON.stringify({
        ok: true,
        restored: {
          database: restoredDb,
          config: restoredConfig,
          jsonl: restoredJsonl,
        },
        entry_count: entryCount,
      }));
    } else {
      console.log(`\n  ⏱️🦀 Restore complete!`);
      console.log(`  ├─ Directory: ${dataDir}`);
      console.log(`  ├─ Database:  ${restoredDb ? '✓' : '✗'}`);
      console.log(`  ├─ Config:    ${restoredConfig ? '✓' : '✗'}`);
      console.log(`  ├─ JSONL:     ${restoredJsonl ? '✓' : '✗'}`);
      console.log(`  └─ Entries:   ${entryCount}\n`);
    }
  });

// ─── List ───────────────────────────────────────────────

program
  .command('list')
  .description('List time entries in a human-readable table')
  .option('-d, --dir <path>', 'Data directory')
  .option('--days <number>', 'Number of days to include', '7')
  .option('--client <name>', 'Filter by client')
  .option('--project <name>', 'Filter by project')
  .option('--agent <name>', 'Filter by agent')
  .option('--limit <n>', 'Max entries', '50')
  .option('--approved', 'Show only approved entries')
  .option('--unapproved', 'Show only unapproved entries')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const days = parseInt(opts.days) || 7;
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const to = new Date().toISOString();
    const approvedFilter = opts.approved ? true : opts.unapproved ? false : undefined;

    const entries = clawck.query({
      client: opts.client,
      project: opts.project,
      agent: opts.agent,
      from,
      to,
      limit: parseInt(opts.limit) || 50,
      approved: approvedFilter,
    });

    if (program.opts().json) {
      console.log(JSON.stringify(entries));
      clawck.close();
      return;
    }

    printEntryTable(entries);
    clawck.close();
  });

// ─── Delete ─────────────────────────────────────────────

program
  .command('delete <id>')
  .description('Delete a time entry by ID (supports 8-char prefix)')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const entry = resolveEntryId(clawck, id);

    if (!entry) {
      clawck.close();
      process.exit(1);
    }

    clawck.delete(entry.id);

    if (program.opts().json) {
      console.log(JSON.stringify({ ok: true, deleted: entry }));
    } else {
      console.log(`  Deleted: ${entry.task}`);
      console.log(`  ID: ${entry.id.slice(0, 8)}  Project: ${entry.project}  Agent: ${entry.agent}`);
    }
    clawck.close();
  });

// ─── Edit ───────────────────────────────────────────────

program
  .command('edit <id>')
  .description('Edit a time entry by ID (supports 8-char prefix)')
  .option('-d, --dir <path>', 'Data directory')
  .option('--task <text>', 'Update task description')
  .option('--duration <minutes>', 'Update duration (recalculates end)', parseFloat)
  .option('--project <name>', 'Update project')
  .option('--client <name>', 'Update client')
  .option('--agent <name>', 'Update agent')
  .option('--category <type>', 'Update category')
  .option('--summary <text>', 'Update summary')
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const entry = resolveEntryId(clawck, id);

    if (!entry) {
      clawck.close();
      process.exit(1);
    }

    const updates: any = {};
    if (opts.task) updates.task = opts.task;
    if (opts.project) updates.project = opts.project;
    if (opts.client) updates.client = opts.client;
    if (opts.agent) updates.agent = opts.agent;
    if (opts.category) updates.category = opts.category;
    if (opts.summary) updates.summary = opts.summary;
    if (opts.duration !== undefined) {
      updates.end = new Date(new Date(entry.start).getTime() + opts.duration * 60000).toISOString();
    }

    const updated = clawck.update(entry.id, updates);

    if (program.opts().json) {
      console.log(JSON.stringify(updated));
    } else {
      console.log(`  Updated: ${updated!.task}`);
      console.log(`  ID: ${updated!.id.slice(0, 8)}  Project: ${updated!.project}  Agent: ${updated!.agent}`);
      if (opts.duration !== undefined) {
        console.log(`  Duration: ${formatDuration(opts.duration)}`);
      }
    }
    clawck.close();
  });

// ─── Export ──────────────────────────────────────────────

program
  .command('export')
  .description('Export time entries as JSON, CSV, or ATP envelope')
  .option('-d, --dir <path>', 'Data directory')
  .option('--format <type>', 'Output format (json, csv, or atp)', 'json')
  .option('--days <number>', 'Number of days to include', '7')
  .option('--client <name>', 'Filter by client')
  .option('--project <name>', 'Filter by project')
  .option('--agent <name>', 'Filter by agent')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const days = parseInt(opts.days) || 7;
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const to = new Date().toISOString();

    const entries = clawck.query({
      client: opts.client,
      project: opts.project,
      agent: opts.agent,
      from,
      to,
      limit: 10000,
    });

    if (opts.format === 'atp') {
      const baselines = clawck.getBaselines();
      const envelope = exportATP(entries, INDUSTRY_BENCHMARKS, baselines);
      console.log(JSON.stringify(envelope, null, 2));
      clawck.close();
      return;
    }

    if (opts.format === 'csv') {
      const csvEscape = (val: string): string => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      };
      console.log('id,date,task,category,duration_minutes,project,client,agent,model,status,tokens_in,tokens_out,cost_usd,summary,created_at,updated_at');
      for (const e of entries) {
        const durationMin = e.end
          ? ((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000).toFixed(2)
          : '0';
        const date = e.start.split('T')[0];
        console.log([
          csvEscape(e.id),
          date,
          csvEscape(e.task),
          csvEscape(e.category),
          durationMin,
          csvEscape(e.project),
          csvEscape(e.client),
          csvEscape(e.agent),
          csvEscape(e.model),
          csvEscape(e.status),
          String(e.tokens_in),
          String(e.tokens_out),
          e.cost_usd.toFixed(4),
          csvEscape(e.summary),
          csvEscape(e.created_at || ''),
          csvEscape(e.updated_at || ''),
        ].join(','));
      }
    } else {
      console.log(JSON.stringify(entries, null, 2));
    }

    clawck.close();
  });

// ─── Benchmark ──────────────────────────────────────────

const benchmark = program
  .command('benchmark')
  .description('View industry benchmarks for task categories');

benchmark
  .command('list')
  .description('List all industry benchmarks')
  .action(async () => {
    if (program.opts().json) {
      console.log(JSON.stringify(INDUSTRY_BENCHMARKS));
      return;
    }

    console.log(`\n  Industry Benchmarks (human median times):`);
    console.log(`  ${'─'.repeat(80)}`);
    console.log(`  ${'Category'.padEnd(15)} ${'Task Type'.padEnd(25)} ${'Median'.padEnd(10)} ${'P25'.padEnd(10)} ${'P75'.padEnd(10)} Source`);
    console.log(`  ${'─'.repeat(80)}`);

    for (const b of INDUSTRY_BENCHMARKS) {
      console.log(`  ${b.category.padEnd(15)} ${b.task_type.padEnd(25)} ${formatDuration(b.human_median_minutes).padEnd(10)} ${formatDuration(b.human_p25_minutes).padEnd(10)} ${formatDuration(b.human_p75_minutes).padEnd(10)} ${b.source}`);
    }
    console.log('');
  });

benchmark
  .command('category <name>')
  .description('Show benchmarks for a specific category')
  .action(async (name) => {
    const catBenchmarks = INDUSTRY_BENCHMARKS.filter(b => b.category === name);
    if (catBenchmarks.length === 0) {
      console.error(`  No benchmarks found for category: ${name}`);
      console.error(`  Available: ${TASK_CATEGORIES.join(', ')}`);
      process.exit(1);
    }

    if (program.opts().json) {
      console.log(JSON.stringify(catBenchmarks));
      return;
    }

    console.log(`\n  Benchmarks for "${name}":`);
    for (const b of catBenchmarks) {
      console.log(`  - ${b.task_type}`);
      console.log(`    Median: ${formatDuration(b.human_median_minutes)}  Fast: ${formatDuration(b.human_p25_minutes)}  Slow: ${formatDuration(b.human_p75_minutes)}`);
      console.log(`    Source: ${b.source} (${b.year})`);
    }
    console.log('');
  });

// ─── Baseline ───────────────────────────────────────────

const baseline = program
  .command('baseline')
  .description('Manage personal time baselines');

baseline
  .command('add')
  .description('Add a personal baseline')
  .requiredOption('--category <type>', 'Task category')
  .requiredOption('--task-type <type>', 'Task type identifier')
  .requiredOption('--minutes <n>', 'How long this takes you (minutes)', parseFloat)
  .option('--description <text>', 'Description of the task')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const bl = clawck.addBaseline({
      category: opts.category,
      task_type: opts.taskType,
      description: opts.description || '',
      my_minutes: opts.minutes,
    });

    if (program.opts().json) {
      console.log(JSON.stringify(bl));
    } else {
      console.log(`  Added baseline: ${bl.task_type} (${bl.category}) — ${formatDuration(bl.my_minutes)}`);
      console.log(`  ID: ${bl.id.slice(0, 8)}`);
    }
    clawck.close();
  });

baseline
  .command('list')
  .description('List all personal baselines')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const baselines = clawck.getBaselines();

    if (program.opts().json) {
      console.log(JSON.stringify(baselines));
      clawck.close();
      return;
    }

    if (baselines.length === 0) {
      console.log('\n  No personal baselines set.');
      console.log('  Add one: clawck baseline add --category code --task-type code_review --minutes 30\n');
      clawck.close();
      return;
    }

    console.log(`\n  Personal Baselines:`);
    for (const b of baselines) {
      console.log(`  ${b.id.slice(0, 8)}  ${b.category.padEnd(14)} ${b.task_type.padEnd(25)} ${formatDuration(b.my_minutes).padEnd(8)} ${b.description}`);
    }
    console.log('');
    clawck.close();
  });

baseline
  .command('remove <id>')
  .description('Remove a personal baseline')
  .option('-d, --dir <path>', 'Data directory')
  .action(async (id, opts) => {
    const config = loadConfig(resolveDataDir(opts));
    const clawck = await new Clawck(config).ready();
    const deleted = clawck.removeBaseline(id);

    if (!deleted) {
      console.error(`  Baseline not found: ${id}`);
      clawck.close();
      process.exit(1);
    }

    if (program.opts().json) {
      console.log(JSON.stringify({ ok: true }));
    } else {
      console.log(`  Removed baseline: ${id}`);
    }
    clawck.close();
  });

// ─── Demo ───────────────────────────────────────────────

program
  .command('demo')
  .description('Generate demo data, reports, and start interactive dashboard')
  .option('-d, --dir <path>', 'Demo data directory', '.clawck-demo')
  .action(async (opts) => {
    const demoDir = path.resolve(opts.dir);
    if (!fs.existsSync(demoDir)) fs.mkdirSync(demoDir, { recursive: true });

    const config = loadConfig(demoDir);
    config.data_dir = demoDir;
    const clawck = await new Clawck(config).ready();

    const { v4: uuid } = await import('uuid');

    const agents = ['research-agent-01', 'writer-agent-02', 'coder-agent-03', 'analyst-agent-04', 'outreach-agent-05'];
    const models = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'gpt-4o', 'gemini-2.0-flash'];
    const clients = ['acme-corp', 'globex-inc', 'initech', 'hooli', 'umbrella-co'];
    const projects = ['website-rebuild', 'seo-content', 'grant-research', 'data-migration', 'email-campaigns', 'api-v2'];
    const categories = ['research', 'content', 'code', 'data_entry', 'analysis', 'communication', 'testing', 'design', 'planning', 'other'] as const;
    const tasks = [
      'Research competitor pricing strategies', 'Write blog post about AI automation',
      'Refactor authentication module', 'Migrate legacy CSV data to new schema',
      'Analyze Q3 customer churn patterns', 'Draft outreach emails for partnership',
      'Write unit tests for payment flow', 'Design email template for newsletter',
      'Find relevant grant opportunities', 'Compile industry benchmark report',
      'Update API documentation', 'Generate social media content calendar',
      'Review and optimize database queries', 'Create investor pitch deck outline',
      'Summarize recent industry news', 'Plan sprint roadmap for Q4',
    ];

    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

    // Seed 35 completed entries across 14 days
    for (let i = 0; i < 35; i++) {
      const daysAgo = Math.random() * 14;
      const durationMin = 5 + Math.random() * 120;
      const tokensIn = Math.round(1000 + Math.random() * 50000);
      const tokensOut = Math.round(500 + Math.random() * 20000);
      const toolCalls = Math.round(Math.random() * 15);
      const category = i < categories.length ? categories[i] : pick(categories);

      const end = new Date(Date.now() - daysAgo * 86400000);
      const start = new Date(end.getTime() - durationMin * 60000);
      const model = pick(models);

      clawck.upsert({
        id: uuid(),
        task: pick(tasks),
        project: i < projects.length ? projects[i] : pick(projects),
        client: i < clients.length ? clients[i] : pick(clients),
        category,
        agent: i < agents.length ? agents[i] : pick(agents),
        model,
        start: start.toISOString(),
        end: end.toISOString(),
        status: 'completed',
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: Math.round((tokensIn * 0.000003 + tokensOut * 0.000015) * 10000) / 10000,
        tool_calls: toolCalls,
        summary: 'Demo entry',
        tags: ['demo'],
        source: 'clawck-demo',
        spec_version: '0.2.0',
        approved: Math.random() < 0.6,
        agent_runtime_ms: Math.round((tokensOut / 80) * 1000 + toolCalls * 2000),
        wall_clock_ms: Math.round(durationMin * 60000),
      });
    }

    // Add running entries
    for (let i = 0; i < 3; i++) {
      clawck.start({ task: pick(tasks), project: pick(projects), client: pick(clients), category: pick(categories), agent: pick(agents), model: pick(models), tags: ['demo'] });
    }

    // Add failed entries
    for (let i = 0; i < 3; i++) {
      const start = new Date(Date.now() - Math.random() * 7 * 86400000);
      const end = new Date(start.getTime() + (10 + Math.random() * 30) * 60000);
      clawck.upsert({
        id: uuid(), task: pick(tasks), project: pick(projects), client: pick(clients),
        category: pick(categories), agent: pick(agents), model: pick(models),
        start: start.toISOString(), end: end.toISOString(), status: 'failed',
        tokens_in: Math.round(500 + Math.random() * 5000), tokens_out: Math.round(100 + Math.random() * 1000),
        cost_usd: Math.round(Math.random() * 0.05 * 10000) / 10000, tool_calls: Math.round(Math.random() * 5),
        summary: 'Task failed', tags: ['demo', 'failed'], source: 'clawck-demo', spec_version: '0.2.0',
      });
    }

    // Add personal baselines
    const baselineData = [
      { category: 'code' as const, task_type: 'code_review', description: 'Review a pull request', my_minutes: 30 },
      { category: 'content' as const, task_type: 'blog_post', description: 'Write a 1000-word blog post', my_minutes: 180 },
      { category: 'research' as const, task_type: 'competitive_analysis', description: 'Analyze competitor landscape', my_minutes: 360 },
      { category: 'testing' as const, task_type: 'unit_tests', description: 'Write unit tests for a module', my_minutes: 120 },
      { category: 'communication' as const, task_type: 'meeting_summary', description: 'Summarize a 1-hour meeting', my_minutes: 30 },
      { category: 'planning' as const, task_type: 'sprint_planning', description: 'Plan a 2-week sprint', my_minutes: 120 },
    ];
    for (const bl of baselineData) {
      clawck.addBaseline(bl);
    }

    // Generate HTML report
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 14 * 86400000).toISOString();
    const ts = clawck.timesheet(from, to);
    const dateRange = `${from.split('T')[0]} to ${to.split('T')[0]}`;
    const rawEntries = clawck.query({ from, to, limit: 10000 });

    const htmlPath = path.join(demoDir, 'clawck-demo-report.html');
    const html = generateTimesheetHTML(ts, { dateRange, rawEntries });
    fs.writeFileSync(htmlPath, html);

    // Generate PDF report
    const pdfPath = path.join(demoDir, 'clawck-demo-report.pdf');
    await generateTimesheetPDF(ts, { dateRange, outputPath: pdfPath });

    // Open HTML in browser
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const { execSync } = await import('child_process');
    try { execSync(`${opener} "${htmlPath}"`, { stdio: 'ignore' }); } catch {}

    // Start server
    const { startServer: startDemoServer } = await import('../server/api');
    const net = await import('net');
    const port = await new Promise<number>((resolve) => {
      const srv = net.createServer();
      srv.listen(0, () => {
        const addr = srv.address() as { port: number };
        srv.close(() => resolve(addr.port));
      });
    });
    config.port = port;

    console.log(`\n  ⏱️🦀 Clawck Demo\n`);
    console.log(`  Generated reports:`);
    console.log(`    HTML:  ${htmlPath} (opened in browser)`);
    console.log(`    PDF:   ${pdfPath}`);
    console.log(`\n  Dashboard running at: http://localhost:${port}`);
    console.log(`\n  Try these commands:`);
    console.log(`    clawck list -d ${demoDir}`);
    console.log(`    clawck report --format html -d ${demoDir}`);
    console.log(`    clawck baseline list -d ${demoDir}`);
    console.log(`    clawck benchmark list`);
    console.log(`    clawck export --format atp -d ${demoDir}`);
    console.log(`    clawck entries --approved -d ${demoDir}`);
    console.log(`\n  Press Ctrl+C to stop the demo server.\n`);

    // Open dashboard
    try { execSync(`${opener} "http://localhost:${port}"`, { stdio: 'ignore' }); } catch {}

    await startDemoServer(config);
  });

// ─── Hook (runtime, singular) ────────────────────────────

const hook = program
  .command('hook')
  .description('Runtime hook command (called by platform hooks, reads JSON from stdin)');

hook
  .command('start')
  .description('Start tracking — called by platform hooks')
  .option('-d, --dir <path>', 'Data directory')
  .option('--platform <name>', 'Force platform (claude|gemini|cursor|cline|windsurf|codex)')
  .option('--verbose', 'Log received stdin JSON to stderr for debugging')
  .action(async (opts) => {
    try {
      const raw = await readStdin();
      if (opts.verbose) process.stderr.write(`clawck: hook start stdin: ${raw}\n`);
      let json: Record<string, unknown> = {};
      if (raw.trim()) {
        try { json = JSON.parse(raw); } catch { json = {}; }
      }

      const platform = (opts.platform as Platform) || undefined;
      const context = normalize(json, platform);
      if (opts.verbose) process.stderr.write(`clawck: hook start context: ${JSON.stringify(context)}\n`);
      const config = loadConfig(resolveDataDir(opts));

      await handleHookStart(config, context);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`clawck: hook start failed: ${msg}\n`);
    }
    process.exit(0);
  });

hook
  .command('stop')
  .description('Stop tracking — called by platform hooks')
  .option('-d, --dir <path>', 'Data directory')
  .option('--platform <name>', 'Force platform (claude|gemini|cursor|cline|windsurf|codex)')
  .option('--verbose', 'Log received stdin JSON to stderr for debugging')
  .action(async (opts) => {
    try {
      const raw = await readStdin();
      if (opts.verbose) process.stderr.write(`clawck: hook stop stdin: ${raw}\n`);
      let json: Record<string, unknown> = {};
      if (raw.trim()) {
        try { json = JSON.parse(raw); } catch { json = {}; }
      }

      const platform = (opts.platform as Platform) || undefined;
      const context = normalize(json, platform);
      if (opts.verbose) process.stderr.write(`clawck: hook stop context: ${JSON.stringify(context)}\n`);
      const config = loadConfig(resolveDataDir(opts));

      await handleHookStop(config, context);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`clawck: hook stop failed: ${msg}\n`);
    }
    process.exit(0);
  });

// ─── Hooks (management, plural) ──────────────────────────

const hooks = program
  .command('hooks')
  .description('Manage platform hook integrations');

hooks
  .command('install <platform>')
  .description('Output hook configuration for a platform')
  .action(async (platformName) => {
    const key = platformName.toLowerCase() as keyof typeof PLATFORMS;
    if (!PLATFORMS[key]) {
      console.error(`  Unknown platform: "${platformName}"`);
      console.error(`  Available: ${PLATFORM_NAMES.join(', ')}`);
      process.exit(1);
    }

    const info = PLATFORMS[key];
    console.log(`\n  ⏱️🦀 Clawck Hooks — ${info.displayName}`);
    console.log(`  ${'─'.repeat(40)}`);

    if (info.configPaths.length > 0) {
      console.log(`\n  Add to: ${info.configPaths[0]}\n`);
    }

    console.log(info.generate());

    console.log(`\n  Or copy from: docs/snippets/${info.snippetFile}`);
    console.log('');
  });

hooks
  .command('status')
  .description('Show which platforms have clawck hooks installed')
  .action(async () => {
    console.log(`\n  ⏱️🦀 Clawck Hooks — Status`);
    console.log(`  ${'─'.repeat(40)}`);

    for (const name of PLATFORM_NAMES) {
      const info = PLATFORMS[name];
      const installed = info.detect();
      const icon = installed ? '✓' : '✗';
      console.log(`  ${icon}  ${info.displayName.padEnd(16)} ${installed ? 'installed' : 'not found'}`);
    }

    console.log(`\n  Run "clawck hooks install <platform>" to set up a platform.\n`);
  });

// ─── Helpers ──────────────────────────────────────────────

function resolveDataDir(subcommandOpts: { dir?: string }): string {
  return subcommandOpts.dir
    ?? program.opts().dir
    ?? process.env.CLAWCK_DIR
    ?? '.clawck';
}

function formatDuration(mins: number): string {
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function resolveEntryId(clawck: Clawck, idPrefix: string): ClawckEntry | null {
  const exact = clawck.get(idPrefix);
  if (exact) return exact;

  const matches = clawck.findByPrefix(idPrefix);
  if (matches.length === 0) {
    if (program.opts().json) {
      console.log(JSON.stringify({ ok: false, error: `No entry found matching: ${idPrefix}` }));
    } else {
      console.error(`  No entry found matching: ${idPrefix}`);
    }
    return null;
  }
  if (matches.length > 1) {
    if (program.opts().json) {
      console.log(JSON.stringify({ ok: false, error: 'Ambiguous ID prefix', matches: matches.map(e => ({ id: e.id, task: e.task })) }));
    } else {
      console.error(`  Ambiguous ID prefix "${idPrefix}". Matches:`);
      for (const m of matches) {
        console.error(`    ${m.id.slice(0, 8)}  ${m.task.slice(0, 50)}`);
      }
    }
    return null;
  }
  return matches[0];
}

function printEntryTable(entries: ClawckEntry[]): void {
  if (entries.length === 0) {
    console.log('\n  No entries found.\n');
    return;
  }

  const header = `  ${'ID'.padEnd(10)} ${'Task'.padEnd(42)} ${'Duration'.padEnd(10)} ${'Project'.padEnd(12)} ${'Agent'.padEnd(12)} ${'OK'.padEnd(4)} ${'Time'}`;
  console.log(`\n${header}`);
  console.log(`  ${'─'.repeat(header.length - 2)}`);

  for (const e of entries) {
    const durationMin = e.end
      ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000
      : (Date.now() - new Date(e.start).getTime()) / 60000;
    const dur = e.end ? formatDuration(durationMin) : 'running';
    const task = e.task.length > 40 ? e.task.slice(0, 37) + '...' : e.task;
    const time = new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const approved = e.approved ? 'v' : '-';
    console.log(`  ${e.id.slice(0, 8).padEnd(10)} ${task.padEnd(42)} ${dur.padEnd(10)} ${e.project.slice(0, 12).padEnd(12)} ${e.agent.padEnd(12)} ${approved.padEnd(4)} ${time}`);
  }
  console.log(`\n  ${entries.length} entries\n`);
}


function loadConfig(dir: string): ClawckConfig {
  const dataDir = path.resolve(dir);
  const defaultConfigPath = path.join(dataDir, 'config.json');
  const activeProfilePath = path.join(dataDir, '.active-profile');
  const profilesDir = path.join(dataDir, 'profiles');

  // Load default config first
  let fileConfig: Partial<ClawckConfig> = {};
  if (fs.existsSync(defaultConfigPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
    } catch {
      // Ignore bad config
    }
  }

  // Check for active profile and merge its settings
  if (fs.existsSync(activeProfilePath)) {
    const activeProfile = fs.readFileSync(activeProfilePath, 'utf-8').trim();
    if (activeProfile && activeProfile !== 'default') {
      const profilePath = path.join(profilesDir, `${activeProfile}.json`);
      if (fs.existsSync(profilePath)) {
        try {
          const profileConfig = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
          // Profile overrides default config (but doesn't replace nested objects entirely)
          fileConfig = { ...fileConfig, ...profileConfig };
        } catch {
          // Ignore bad profile config
        }
      }
    }
  }

  // Validate config fields
  const validation = validateConfig(fileConfig as Record<string, any>);
  if (!validation.valid) {
    for (const err of validation.errors) {
      console.error(`  Config error: ${err}`);
    }
    process.exit(1);
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    data_dir: dataDir,
  };
}

program.parse();
