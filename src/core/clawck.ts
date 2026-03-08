/**
 * ⏱️🦀 Clawck — Entry Manager
 * High-level API for managing agent time entries.
 */

import { v4 as uuid } from 'uuid';
import {
  ClawckEntry, ClawckConfig, ClawckStartInput, ClawckStopInput, ClawckLogInput,
  EntryStatus, TimesheetSummary, SPEC_VERSION, DEFAULT_CONFIG, TrackingPattern,
} from './types';
import { ClawckDB } from './database';
import { WebhookManager } from './webhooks';
import { DEFAULT_PATTERNS } from './patterns';

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
    const entry = this._db.update(input.id, {
      end: new Date().toISOString(),
      status,
      summary: input.summary || '',
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      cost_usd: input.cost_usd,
      tool_calls: input.tool_calls,
    });

    if (entry) {
      const event = status === 'failed' ? 'task_failed' : 'task_completed';
      this.webhookManager.fire(event, { entry });
    }

    return entry;
  }

  // ─── Log a Completed Task (retroactive) ─────────────────

  log(input: ClawckLogInput & { pattern?: string }): ClawckEntry {
    const end = new Date();
    const start = new Date(end.getTime() - (input.duration_minutes * 60000));
    const pat = input.pattern ? this.getPattern(input.pattern) : (this.config.default_pattern ? this.getPattern(this.config.default_pattern) : undefined);

    const entry: ClawckEntry = {
      id: uuid(),
      agent: input.agent || pat?.agent || this.config.default_agent || 'unknown-agent',
      model: input.model || pat?.model || this.config.default_model || 'unknown',
      client: input.client || pat?.client || this.config.default_client || 'default',
      project: input.project || pat?.project || this.config.default_project || 'default',
      task: input.task,
      category: input.category || pat?.category || 'other',
      start: start.toISOString(),
      end: end.toISOString(),
      status: 'completed',
      tokens_in: input.tokens_in || 0,
      tokens_out: input.tokens_out || 0,
      cost_usd: input.cost_usd || 0,
      tool_calls: input.tool_calls || 0,
      summary: input.summary || '',
      tags: input.tags || pat?.tags || [],
      source: this.config.default_source || 'clawck',
      spec_version: SPEC_VERSION,
      approved: false,
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

  // ─── Cleanup ───────────────────────────────────────────

  get webhooks(): WebhookManager { return this.webhookManager; }

  close(): void {
    this.webhookManager.stopIdleMonitor();
    this._db.close();
  }
}
