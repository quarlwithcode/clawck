/**
 * ⏱️🦀 Clawck — Entry Manager
 * High-level API for managing agent time entries.
 */

import { v4 as uuid } from 'uuid';
import {
  ClawckEntry, ClawckConfig, ClawckStartInput, ClawckStopInput, ClawckLogInput,
  EntryStatus, TimesheetSummary, SPEC_VERSION, DEFAULT_CONFIG, TrackingPattern, TaskCategory,
  StoredReport, ReportMetadata, ReportPeriod, ReportStyle, ReportFormat,
} from './types';
import { ClawckDB } from './database';
import { WebhookManager } from './webhooks';
import { DEFAULT_PATTERNS } from './patterns';
import { estimateAgentRuntime, calculateWallClock, DEFAULT_RUNTIME_CONFIG, RuntimeEstimatorConfig } from './runtime';
import { PersonalBaseline, compareEntry, PersonalComparisonResult } from './personal';
import { INDUSTRY_BENCHMARKS, IndustryBenchmark } from './benchmarks';
import { v4 as uuidv4 } from 'uuid';

export class Clawck {
  private _db: ClawckDB;
  private config: ClawckConfig;
  private webhookManager: WebhookManager;

  constructor(config: Partial<ClawckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._db = new ClawckDB(this.config);
    this.webhookManager = new WebhookManager(this.config);
  }

  /** Wait for the database to be ready (call once before first operation) */
  async ready(): Promise<this> {
    await this._db.ensureReady();
    return this;
  }

  get database(): ClawckDB { return this._db; }

  // ─── Upsert (for sync) ────────────────────────────────

  upsert(entry: ClawckEntry): ClawckEntry {
    return this._db.upsert(entry);
  }

  // ─── Patterns ────────────────────────────────────────────

  getPatterns(): TrackingPattern[] {
    return this.config.patterns || DEFAULT_PATTERNS;
  }

  getPattern(name: string): TrackingPattern | undefined {
    return this.getPatterns().find(p => p.name === name);
  }

  // ─── Approve ────────────────────────────────────────────

  approve(id: string): ClawckEntry | null {
    return this._db.update(id, { approved: true });
  }

  // ─── Start a Task ──────────────────────────────────────

  start(input: ClawckStartInput & { pattern?: string }): ClawckEntry {
    const pat = input.pattern ? this.getPattern(input.pattern) : (this.config.default_pattern ? this.getPattern(this.config.default_pattern) : undefined);

    const entry: ClawckEntry = {
      id: uuid(),
      agent: input.agent || pat?.agent || this.config.default_agent || 'unknown-agent',
      model: input.model || pat?.model || this.config.default_model || 'unknown',
      client: input.client || pat?.client || this.config.default_client || 'default',
      project: input.project || pat?.project || this.config.default_project || 'default',
      task: input.task,
      category: input.category || pat?.category || 'other',
      start: new Date().toISOString(),
      end: null,
      status: 'running',
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      tool_calls: 0,
      summary: '',
      tags: input.tags || pat?.tags || [],
      source: this.config.default_source || 'clawck',
      spec_version: SPEC_VERSION,
      approved: false,
    };

    return this._db.insert(entry);
  }

  // ─── Stop a Task ───────────────────────────────────────

  stop(input: ClawckStopInput): ClawckEntry | null {
    const status = input.status || 'completed';
    const endTime = new Date().toISOString();

    // Build updates
    const updates: Partial<ClawckEntry> = {
      end: endTime,
      status,
      summary: input.summary || '',
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      cost_usd: input.cost_usd,
      tool_calls: input.tool_calls,
    };

    // Calculate wall clock and agent runtime
    const existing = this._db.getById(input.id);
    if (existing) {
      updates.wall_clock_ms = calculateWallClock(existing.start, endTime);

      const tokensOut = input.tokens_out ?? existing.tokens_out ?? 0;
      const toolCalls = input.tool_calls ?? existing.tool_calls ?? 0;
      const model = existing.model || 'unknown';
      if (tokensOut > 0 || toolCalls > 0) {
        const runtimeConfig = this.getRuntimeConfig();
        updates.agent_runtime_ms = estimateAgentRuntime(
          { tokens_out: tokensOut, model, tool_calls: toolCalls },
          runtimeConfig
        );
      } else {
        // No token data available (e.g. hook-based tracking) — wall clock is the best proxy
        updates.agent_runtime_ms = updates.wall_clock_ms;
      }
    }

    const entry = this._db.update(input.id, updates);

    if (entry) {
      const event = status === 'failed' ? 'task_failed' : 'task_completed';
      this.webhookManager.fire(event, { entry });
    }

    return entry;
  }

  // ─── Log a Completed Task (retroactive) ─────────────────

  log(input: ClawckLogInput & { pattern?: string; agent_runtime_ms?: number }): ClawckEntry {
    const end = new Date();
    const start = new Date(end.getTime() - (input.duration_minutes * 60000));
    const pat = input.pattern ? this.getPattern(input.pattern) : (this.config.default_pattern ? this.getPattern(this.config.default_pattern) : undefined);

    const tokensOut = input.tokens_out || 0;
    const toolCalls = input.tool_calls || 0;
    const model = input.model || pat?.model || this.config.default_model || 'unknown';

    let agentRuntimeMs: number | null = input.agent_runtime_ms ?? null;
    if (agentRuntimeMs === null && (tokensOut > 0 || toolCalls > 0)) {
      const runtimeConfig = this.getRuntimeConfig();
      agentRuntimeMs = estimateAgentRuntime(
        { tokens_out: tokensOut, model, tool_calls: toolCalls },
        runtimeConfig
      );
    }

    const entry: ClawckEntry = {
      id: uuid(),
      agent: input.agent || pat?.agent || this.config.default_agent || 'unknown-agent',
      model,
      client: input.client || pat?.client || this.config.default_client || 'default',
      project: input.project || pat?.project || this.config.default_project || 'default',
      task: input.task,
      category: input.category || pat?.category || 'other',
      start: start.toISOString(),
      end: end.toISOString(),
      status: 'completed',
      tokens_in: input.tokens_in || 0,
      tokens_out: tokensOut,
      cost_usd: input.cost_usd || 0,
      tool_calls: toolCalls,
      summary: input.summary || '',
      tags: input.tags || pat?.tags || [],
      source: this.config.default_source || 'clawck',
      spec_version: SPEC_VERSION,
      approved: false,
      agent_runtime_ms: agentRuntimeMs,
      wall_clock_ms: input.duration_minutes * 60000,
    };

    return this._db.insert(entry);
  }

  // ─── Update a Running Entry ────────────────────────────

  update(id: string, updates: Partial<ClawckEntry>): ClawckEntry | null {
    return this._db.update(id, updates);
  }

  // ─── Delete ────────────────────────────────────────────

  delete(id: string): boolean {
    return this._db.deleteById(id);
  }

  findByPrefix(prefix: string): ClawckEntry[] {
    return this._db.findByPrefix(prefix);
  }

  // ─── Query ─────────────────────────────────────────────

  get(id: string): ClawckEntry | null {
    return this._db.getById(id);
  }

  running(): ClawckEntry[] {
    return this._db.getRunning();
  }

  query(filters: {
    client?: string;
    project?: string;
    agent?: string;
    category?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    approved?: boolean;
  } = {}): ClawckEntry[] {
    return this._db.query(filters);
  }

  // ─── Timesheet ─────────────────────────────────────────

  timesheet(from: string, to: string, filters?: { client?: string; project?: string; agent?: string }): TimesheetSummary {
    return this._db.getTimesheet(from, to, filters);
  }

  // ─── Metadata ──────────────────────────────────────────

  clients(): string[] { return this._db.getClients(); }
  projects(): string[] { return this._db.getProjects(); }
  agents(): string[] { return this._db.getAgents(); }
  stats() { return this._db.getStats(); }

  // ─── Personal Baselines ──────────────────────────────

  addBaseline(input: { category: TaskCategory; task_type: string; description?: string; my_minutes: number }): PersonalBaseline {
    const baseline: PersonalBaseline = {
      id: uuidv4(),
      category: input.category,
      task_type: input.task_type,
      description: input.description || '',
      my_minutes: input.my_minutes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return this._db.insertBaseline(baseline);
  }

  removeBaseline(id: string): boolean {
    return this._db.deleteBaseline(id);
  }

  getBaselines(): PersonalBaseline[] {
    return this._db.getBaselines();
  }

  compareEntryById(entryId: string): PersonalComparisonResult | null {
    const entry = this._db.getById(entryId);
    if (!entry) return null;
    const baselines = this._db.getBaselines();
    const personalRate = this.config.personal_rate_usd || 50;
    return compareEntry(entry, baselines, INDUSTRY_BENCHMARKS, personalRate);
  }

  // ─── Report Persistence ──────────────────────────────

  saveReport(opts: {
    name: string;
    period: ReportPeriod;
    period_start: string;
    period_end: string;
    style: ReportStyle;
    format: ReportFormat;
    content: string | Buffer;
    metadata: ReportMetadata;
  }): StoredReport {
    const report: StoredReport = {
      id: uuidv4(),
      name: opts.name,
      period: opts.period,
      period_start: opts.period_start,
      period_end: opts.period_end,
      style: opts.style,
      format: opts.format,
      content: opts.content,
      metadata: opts.metadata,
      created_at: new Date().toISOString(),
    };
    return this._db.insertReport(report);
  }

  listReports(limit?: number, offset?: number): StoredReport[] {
    return this._db.listReports(limit, offset);
  }

  getReport(id: string): StoredReport | null {
    return this._db.getReportContent(id);
  }

  deleteReport(id: string): boolean {
    return this._db.deleteReport(id);
  }

  // ─── Runtime Config ──────────────────────────────────

  private getRuntimeConfig(): RuntimeEstimatorConfig {
    const overrides = this.config.runtime_estimation;
    if (!overrides) return DEFAULT_RUNTIME_CONFIG;
    return {
      model_tokens_per_second: {
        ...DEFAULT_RUNTIME_CONFIG.model_tokens_per_second,
        ...(overrides.model_tokens_per_second || {}),
      },
      default_tokens_per_second: overrides.default_tokens_per_second ?? DEFAULT_RUNTIME_CONFIG.default_tokens_per_second,
      avg_tool_duration_ms: overrides.avg_tool_duration_ms ?? DEFAULT_RUNTIME_CONFIG.avg_tool_duration_ms,
    };
  }

  // ─── Cleanup ───────────────────────────────────────────

  get webhooks(): WebhookManager { return this.webhookManager; }

  close(): void {
    this.webhookManager.stopIdleMonitor();
    this._db.close();
  }
}
