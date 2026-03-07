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
import { DEFAULT_CONFIG, ClawckConfig, DEFAULT_HUMAN_EQUIVALENTS } from '../core/types';

const program = new Command();

program
  .name('clawck')
  .description('⏱️🦀 Clawck — Time tracking for AI agents')
  .version('0.1.0');

// ─── Init ─────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a .clawck/ directory in the current folder')
  .option('-d, --dir <path>', 'Data directory', '.clawck')
  .action(async (opts) => {
    const dir = path.resolve(opts.dir);
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
  .option('-d, --dir <path>', 'Data directory', '.clawck')
  .action(async (opts) => {
    const config = loadConfig(opts.dir);
    config.port = parseInt(opts.port) || config.port;
    startServer(config);
  });

// ─── MCP ──────────────────────────────────────────────────

program
  .command('mcp')
  .description('Start the Clawck MCP server (stdio, for Claude Code / Cline / Cursor)')
  .option('-d, --dir <path>', 'Data directory', '.clawck')
  .action(async (opts) => {
    const config = loadConfig(opts.dir);
    startMCPServer(config);
  });

// ─── Status ───────────────────────────────────────────────

program
  .command('status')
  .description('Show currently running tasks and stats')
  .option('-d, --dir <path>', 'Data directory', '.clawck')
  .action(async (opts) => {
    const config = loadConfig(opts.dir);
    const clawck = await new Clawck(config).ready();
    const stats = clawck.stats();
    const running = clawck.running();

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

// ─── Report ───────────────────────────────────────────────

program
  .command('report')
  .description('Show a timesheet summary')
  .option('-d, --dir <path>', 'Data directory', '.clawck')
  .option('--days <number>', 'Number of days to include', '7')
  .option('--client <name>', 'Filter by client')
  .option('--project <name>', 'Filter by project')
  .option('--agent <name>', 'Filter by agent')
  .action(async (opts) => {
    const config = loadConfig(opts.dir);
    const clawck = await new Clawck(config).ready();
    const days = parseInt(opts.days) || 7;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - days * 86400000).toISOString();

    const ts = clawck.timesheet(from, to, {
      client: opts.client,
      project: opts.project,
      agent: opts.agent,
    });

    console.log(`\n  📋 Clawck Timesheet — Last ${days} days`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  ⏱️  Agent hours:       ${ts.total_agent_hours.toFixed(1)} hrs`);
    console.log(`  👤 Human equiv:       ${ts.total_human_equiv_hours.toFixed(1)} hrs`);
    console.log(`  💰 Agent cost:        $${ts.total_cost_usd.toFixed(2)}`);
    console.log(`  💚 Est. savings:      $${ts.total_savings_usd.toFixed(0)}`);
    console.log(`  🔢 Total entries:     ${ts.total_entries}`);
    console.log(`  🪙 Total tokens:      ${ts.total_tokens.toLocaleString()}`);

    if (ts.by_project.length > 0) {
      console.log(`\n  📁 By Project:`);
      for (const p of ts.by_project) {
        const bar = '█'.repeat(Math.max(1, Math.round(p.agent_hours / (ts.total_agent_hours || 1) * 20)));
        console.log(`  ${bar} ${p.project} (${p.client}): ${p.agent_hours.toFixed(1)}h → ${p.human_equiv_hours.toFixed(1)}h human equiv`);
      }
    }

    if (ts.by_agent.length > 0) {
      console.log(`\n  🤖 By Agent:`);
      for (const a of ts.by_agent) {
        console.log(`  • ${a.agent} (${a.model}): ${a.agent_hours.toFixed(1)}h, ${a.success_rate}% success`);
      }
    }

    console.log('');
    clawck.close();
  });

// ─── Seed (for testing) ──────────────────────────────────

program
  .command('seed')
  .description('Seed the database with sample entries (for testing)')
  .option('-d, --dir <path>', 'Data directory', '.clawck')
  .option('-n, --count <number>', 'Number of entries', '25')
  .action(async (opts) => {
    const config = loadConfig(opts.dir);
    const clawck = await new Clawck(config).ready();
    const count = parseInt(opts.count) || 25;

    const agents = ['cubi-research-01', 'cubi-writer-02', 'cubi-coder-03', 'cubi-analyst-04', 'cubi-outreach-05'];
    const models = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'gpt-4o', 'gemini-2.0-flash'];
    const clients = ['acme-corp', 'globex-inc', 'initech', 'hooli'];
    const projects = ['website-rebuild', 'seo-content', 'grant-research', 'data-migration', 'email-campaigns'];
    const categories = ['research', 'content', 'code', 'data_entry', 'analysis', 'communication', 'testing', 'design'] as const;
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
    ];

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.random() * 14;
      const durationMin = 5 + Math.random() * 120;
      const tokensIn = Math.round(1000 + Math.random() * 50000);
      const tokensOut = Math.round(500 + Math.random() * 20000);
      const category = categories[Math.floor(Math.random() * categories.length)];

      clawck.log({
        task: tasks[Math.floor(Math.random() * tasks.length)],
        project: projects[Math.floor(Math.random() * projects.length)],
        client: clients[Math.floor(Math.random() * clients.length)],
        category,
        agent: agents[Math.floor(Math.random() * agents.length)],
        model: models[Math.floor(Math.random() * models.length)],
        duration_minutes: Math.round(durationMin),
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: Math.round((tokensIn * 0.000003 + tokensOut * 0.000015) * 10000) / 10000,
        summary: 'Auto-generated seed entry for testing',
        tags: ['seed', 'test'],
      });
    }

    console.log(`\n  ⏱️🦀 Seeded ${count} entries into Clawck!`);
    console.log(`  └─ Run: clawck serve\n`);
    clawck.close();
  });

// ─── Helpers ──────────────────────────────────────────────

function loadConfig(dir: string): ClawckConfig {
  const dataDir = path.resolve(dir);
  const configPath = path.join(dataDir, 'config.json');

  let fileConfig: Partial<ClawckConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // Ignore bad config
    }
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    data_dir: dataDir,
  };
}

program.parse();
