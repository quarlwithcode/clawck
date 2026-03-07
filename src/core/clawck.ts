/**
 * ⏱️🦀 Clawck — Entry Manager
 * High-level API for managing agent time entries.
 */

import { v4 as uuid } from 'uuid';
import {
  ClawckEntry, ClawckConfig, ClawckStartInput, ClawckStopInput, ClawckLogInput,
  EntryStatus, TimesheetSummary, SPEC_VERSION, DEFAULT_CONFIG,
} from './types';
import { ClawckDB } from './database';

export class Clawck {
  private _db: ClawckDB;
  private config: ClawckConfig;

  constructor(config: Partial<ClawckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._db = new ClawckDB(this.config);
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

  // ─── Start a Task ──────────────────────────────────────

  start(input: ClawckStartInput): ClawckEntry {
    const entry: ClawckEntry = {
      id: uuid(),
      agent: input.agent || this.config.default_agent || 'unknown-agent',
      model: input.model || this.config.default_model || 'unknown',
      client: input.client || this.config.default_client || 'default',
      project: input.project || this.config.default_project || 'default',
      task: input.task,
      category: input.category || 'other',
      start: new Date().toISOString(),
      end: null,
      status: 'running',
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      tool_calls: 0,
      summary: '',
      tags: input.tags || [],
      source: this.config.default_source || 'clawck',
      spec_version: SPEC_VERSION,
    };

    return this._db.insert(entry);
  }

  // ─── Stop a Task ───────────────────────────────────────

  stop(input: ClawckStopInput): ClawckEntry | null {
    return this._db.update(input.id, {
      end: new Date().toISOString(),
      status: input.status || 'completed',
      summary: input.summary || '',
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      cost_usd: input.cost_usd,
      tool_calls: input.tool_calls,
    });
  }

  // ─── Log a Completed Task (retroactive) ─────────────────

  log(input: ClawckLogInput): ClawckEntry {
    const end = new Date();
    const start = new Date(end.getTime() - (input.duration_minutes * 60000));

    const entry: ClawckEntry = {
      id: uuid(),
      agent: input.agent || this.config.default_agent || 'unknown-agent',
      model: input.model || this.config.default_model || 'unknown',
      client: input.client || this.config.default_client || 'default',
      project: input.project || this.config.default_project || 'default',
      task: input.task,
      category: input.category || 'other',
      start: start.toISOString(),
      end: end.toISOString(),
      status: 'completed',
      tokens_in: input.tokens_in || 0,
      tokens_out: input.tokens_out || 0,
      cost_usd: input.cost_usd || 0,
      tool_calls: input.tool_calls || 0,
      summary: input.summary || '',
      tags: input.tags || [],
      source: this.config.default_source || 'clawck',
      spec_version: SPEC_VERSION,
    };

    return this._db.insert(entry);
  }

  // ─── Update a Running Entry ────────────────────────────

  update(id: string, updates: Partial<ClawckEntry>): ClawckEntry | null {
    return this._db.update(id, updates);
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

  close(): void {
    this._db.close();
  }
}
