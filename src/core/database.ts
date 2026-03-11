/**
 * Clawck Database Layer - SQLite via better-sqlite3 (native, zero-copy)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { ClawckEntry, TimesheetSummary, TimesheetRow, ClawckConfig, DEFAULT_HUMAN_EQUIVALENTS, ClientSummary, ProjectSummary, CategorySummary, SyncState, TaskCategory, StoredReport, ReportMetadata, ReportPeriod, ReportStyle, ReportFormat, PendingEdit, PendingEditEntry, ChannelMapping, AuditEntry, AuditAction } from './types';
import { PersonalBaseline } from './personal';
import { computeMergedRuntimeMs } from './runtime';

export class ClawckDB {
  private db: Database.Database;
  private config: ClawckConfig;
  private dbPath: string;

  constructor(config: ClawckConfig) {
    this.config = config;
    const dbDir = path.resolve(config.data_dir);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    this.dbPath = path.join(dbDir, 'clawck.db');
    this.db = new Database(this.dbPath);
    this.migrate();
  }

  // ─── Versioned Migration System ────────────────────────
  //
  // Each migration is a function that receives the db handle and runs DDL.
  // Migrations are numbered starting at 1. The schema_version table tracks
  // which migrations have been applied. On a fresh DB we detect the absence
  // of any tables and run all migrations. On an existing pre-versioned DB
  // (has entries table but no schema_version table) we detect already-applied
  // columns and start from the right version.

  /** Current schema version — bump when adding a new migration. */
  static readonly SCHEMA_VERSION = 7;

  private static readonly MIGRATIONS: Array<(db: Database.Database) => void> = [
    // ── Migration 1: initial schema (entries + sync_state + indexes) ──
    (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY, agent TEXT NOT NULL, model TEXT NOT NULL DEFAULT 'unknown',
        client TEXT NOT NULL DEFAULT 'default', project TEXT NOT NULL DEFAULT 'default',
        task TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'other', start TEXT NOT NULL,
        end_ TEXT, status TEXT NOT NULL DEFAULT 'running', tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'manual',
        spec_version TEXT NOT NULL DEFAULT '0.1.0',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_agent ON entries(agent)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_client ON entries(client)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_start ON entries(start)`);
      db.exec(`CREATE TABLE IF NOT EXISTS sync_state (
        source_name TEXT PRIMARY KEY,
        last_sync_at TEXT NOT NULL,
        last_status TEXT NOT NULL DEFAULT 'success',
        last_error TEXT,
        entries_synced INTEGER NOT NULL DEFAULT 0
      )`);
    },

    // ── Migration 2: add approved column ──
    (db) => {
      db.exec(`ALTER TABLE entries ADD COLUMN approved INTEGER NOT NULL DEFAULT 0`);
    },

    // ── Migration 3: add agent_runtime_ms and wall_clock_ms ──
    (db) => {
      db.exec(`ALTER TABLE entries ADD COLUMN agent_runtime_ms INTEGER`);
      db.exec(`ALTER TABLE entries ADD COLUMN wall_clock_ms INTEGER`);
    },

    // ── Migration 4: personal baselines table ──
    (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS personal_baselines (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        task_type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        my_minutes REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    },

    // ── Migration 5: reports table ──
    (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        period TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        style TEXT NOT NULL DEFAULT 'full',
        format TEXT NOT NULL DEFAULT 'terminal',
        content BLOB,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at)`);
    },

    // ── Migration 6: pending edits + channel mappings ──
    (db) => {
      // Add edit_pending and pending_edits columns to entries
      db.exec(`ALTER TABLE entries ADD COLUMN edit_pending INTEGER NOT NULL DEFAULT 0`);
      db.exec(`ALTER TABLE entries ADD COLUMN pending_edits TEXT`);

      // Create channel_mappings table for auto-categorization
      db.exec(`CREATE TABLE IF NOT EXISTS channel_mappings (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL UNIQUE,
        channel_name TEXT NOT NULL DEFAULT '',
        project TEXT,
        client TEXT,
        default_category TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_mappings_channel_id ON channel_mappings(channel_id)`);
    },

    // ── Migration 7: audit_log table ──
    (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'system',
        old_value TEXT,
        new_value TEXT,
        field TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_entry_id ON audit_log(entry_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`);
    },
  ];

  private migrate(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Bootstrap the schema_version table
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    )`);

    let currentVersion = this.getCurrentVersion();

    // Detect pre-versioned databases: entries table exists but no schema_version row.
    // Probe which columns/tables already exist to infer the correct starting version.
    if (currentVersion === 0 && this.tableExists('entries')) {
      currentVersion = this.detectLegacyVersion();
      this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(currentVersion);
    } else if (currentVersion === 0) {
      // Fresh database — seed version tracker at 0
      this.db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
    }

    // Run pending migrations inside a transaction
    if (currentVersion < ClawckDB.SCHEMA_VERSION) {
      const runMigrations = this.db.transaction(() => {
        for (let v = currentVersion + 1; v <= ClawckDB.SCHEMA_VERSION; v++) {
          const migration = ClawckDB.MIGRATIONS[v - 1];
          if (!migration) {
            throw new Error(`Missing migration for version ${v}`);
          }
          migration(this.db);
        }
        this.db.prepare('UPDATE schema_version SET version = ?').run(ClawckDB.SCHEMA_VERSION);
      });
      runMigrations();
    }
  }

  private getCurrentVersion(): number {
    // If schema_version table was just created, it will be empty
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
    return row?.version ?? 0;
  }

  private tableExists(name: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    return !!row;
  }

  private columnExists(table: string, column: string): boolean {
    const cols = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    return cols.some(c => c.name === column);
  }

  /**
   * For databases created before the versioned migration system existed,
   * probe the schema to determine which migrations have already been applied.
   */
  private detectLegacyVersion(): number {
    // Walk backwards from the latest migration to find the highest already-applied one
    if (this.tableExists('audit_log')) return 7;
    if (this.tableExists('channel_mappings')) return 6;
    if (this.tableExists('reports')) return 5;
    if (this.tableExists('personal_baselines')) return 4;
    if (this.columnExists('entries', 'agent_runtime_ms')) return 3;
    if (this.columnExists('entries', 'approved')) return 2;
    // entries table exists but none of the later columns/tables → version 1
    return 1;
  }

  /** Expose the current schema version for diagnostics. */
  getSchemaVersion(): number {
    return this.getCurrentVersion();
  }

  async ensureReady(): Promise<void> { /* better-sqlite3 is synchronous */ }

  insert(entry: ClawckEntry, actor: string = 'system'): ClawckEntry {
    this.db.prepare(
      `INSERT INTO entries (id, agent, model, client, project, task, category, start, end_, status, tokens_in, tokens_out, cost_usd, tool_calls, summary, tags, source, spec_version, approved, agent_runtime_ms, wall_clock_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(entry.id, entry.agent, entry.model, entry.client, entry.project, entry.task, entry.category, entry.start, entry.end, entry.status, entry.tokens_in, entry.tokens_out, entry.cost_usd, entry.tool_calls, entry.summary, JSON.stringify(entry.tags), entry.source, entry.spec_version, entry.approved ? 1 : 0, entry.agent_runtime_ms ?? null, entry.wall_clock_ms ?? null);
    // Log audit entry for creation
    this.logAudit(entry.id, 'create', actor, {
      newValue: { task: entry.task, project: entry.project, client: entry.client, agent: entry.agent },
    });
    return entry;
  }

  update(id: string, updates: Partial<ClawckEntry>, actor: string = 'system'): ClawckEntry | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    const changedFields: string[] = [];
    if ((updates as any).start !== undefined) { fields.push('start = ?'); values.push((updates as any).start); changedFields.push('start'); }
    if (updates.end !== undefined) { fields.push('end_ = ?'); values.push(updates.end); changedFields.push('end'); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); changedFields.push('status'); }
    if (updates.tokens_in !== undefined) { fields.push('tokens_in = ?'); values.push(updates.tokens_in); changedFields.push('tokens_in'); }
    if (updates.tokens_out !== undefined) { fields.push('tokens_out = ?'); values.push(updates.tokens_out); changedFields.push('tokens_out'); }
    if (updates.cost_usd !== undefined) { fields.push('cost_usd = ?'); values.push(updates.cost_usd); changedFields.push('cost_usd'); }
    if (updates.tool_calls !== undefined) { fields.push('tool_calls = ?'); values.push(updates.tool_calls); changedFields.push('tool_calls'); }
    if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary); changedFields.push('summary'); }
    if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); changedFields.push('tags'); }
    if (updates.project !== undefined) { fields.push('project = ?'); values.push(updates.project); changedFields.push('project'); }
    if (updates.client !== undefined) { fields.push('client = ?'); values.push(updates.client); changedFields.push('client'); }
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); changedFields.push('category'); }
    if (updates.task !== undefined) { fields.push('task = ?'); values.push(updates.task); changedFields.push('task'); }
    if (updates.agent !== undefined) { fields.push('agent = ?'); values.push(updates.agent); changedFields.push('agent'); }
    if (updates.approved !== undefined) { fields.push('approved = ?'); values.push(updates.approved ? 1 : 0); changedFields.push('approved'); }
    if (updates.agent_runtime_ms !== undefined) { fields.push('agent_runtime_ms = ?'); values.push(updates.agent_runtime_ms); changedFields.push('agent_runtime_ms'); }
    if (updates.wall_clock_ms !== undefined) { fields.push('wall_clock_ms = ?'); values.push(updates.wall_clock_ms); changedFields.push('wall_clock_ms'); }
    fields.push("updated_at = datetime('now')");
    if (fields.length === 1) return existing;
    values.push(id);
    this.db.prepare(`UPDATE entries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    // Log audit entry for updates
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    for (const field of changedFields) {
      oldValues[field] = (existing as any)[field];
      newValues[field] = (updates as any)[field];
    }
    this.logAudit(id, 'update', actor, {
      oldValue: oldValues,
      newValue: newValues,
      field: changedFields.join(','),
    });
    return this.getById(id);
  }

  getById(id: string): ClawckEntry | null {
    const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as any;
    return row ? this.rowToEntry(row) : null;
  }

  deleteById(id: string, actor: string = 'system'): boolean {
    const existing = this.getById(id);
    const result = this.db.prepare('DELETE FROM entries WHERE id = ?').run(id);
    if (result.changes > 0 && existing) {
      this.logAudit(id, 'delete', actor, {
        oldValue: { task: existing.task, project: existing.project, client: existing.client },
      });
    }
    return result.changes > 0;
  }

  findByPrefix(prefix: string): ClawckEntry[] {
    return this.queryRows("SELECT * FROM entries WHERE id LIKE ? LIMIT 10", [prefix + '%']);
  }

  getRunning(): ClawckEntry[] {
    return this.queryRows("SELECT * FROM entries WHERE status = 'running' ORDER BY start DESC");
  }

  query(filters: { client?: string; project?: string; agent?: string; category?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number; approved?: boolean; } = {}): ClawckEntry[] {
    const conds: string[] = []; const params: any[] = [];
    if (filters.client) { conds.push('client = ?'); params.push(filters.client); }
    if (filters.project) { conds.push('project = ?'); params.push(filters.project); }
    if (filters.agent) { conds.push('agent = ?'); params.push(filters.agent); }
    if (filters.category) { conds.push('category = ?'); params.push(filters.category); }
    if (filters.status) { conds.push('status = ?'); params.push(filters.status); }
    if (filters.from) { conds.push('start >= ?'); params.push(filters.from); }
    if (filters.to) { conds.push('start <= ?'); params.push(filters.to); }
    if (filters.approved !== undefined) { conds.push('approved = ?'); params.push(filters.approved ? 1 : 0); }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    return this.queryRows(`SELECT * FROM entries ${where} ORDER BY start DESC LIMIT ${filters.limit || 500} OFFSET ${filters.offset || 0}`, params);
  }

  private queryRows(sql: string, params: any[] = []): ClawckEntry[] {
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToEntry(row));
  }

  getTimesheet(from: string, to: string, filters: { client?: string; project?: string; agent?: string } = {}): TimesheetSummary {
    const entries = this.query({ ...filters, from, to, limit: 10000 });
    const equivs = this.config.human_equivalents || DEFAULT_HUMAN_EQUIVALENTS;
    const rows: TimesheetRow[] = entries.map(e => {
      const wallClockMs = e.wall_clock_ms ?? (e.end ? (new Date(e.end).getTime() - new Date(e.start).getTime()) : (Date.now() - new Date(e.start).getTime()));
      const agentRuntimeMs = e.agent_runtime_ms ?? null;
      // Primary duration: agent_runtime_ms when available, fall back to wall_clock_ms, then computed
      const primaryMs = agentRuntimeMs ?? wallClockMs;
      const durationMin = primaryMs / 60000;
      const agentTotalRuntimeMin = agentRuntimeMs != null ? agentRuntimeMs / 60000 : undefined;
      const equiv = equivs[e.category] || equivs.other;
      const agentHours = durationMin / 60;
      const humanEquivHours = agentHours * equiv.multiplier;
      const timeSavedHours = Math.round((humanEquivHours - agentHours) * 100) / 100;
      return { date: e.start.split('T')[0], start_time: e.start, end_time: e.end, agent: e.agent, client: e.client, project: e.project, task: e.task, category: e.category, duration_minutes: Math.round(durationMin * 100) / 100, tokens_in: e.tokens_in, tokens_out: e.tokens_out, tokens_total: e.tokens_in + e.tokens_out, cost_usd: e.cost_usd, human_equiv_hours: Math.round(humanEquivHours * 100) / 100, human_equiv_cost_saved: Math.round(humanEquivHours * equiv.human_rate_usd * 100) / 100, time_saved_hours: timeSavedHours, status: e.status, approved: e.approved ?? false, agent_total_runtime_minutes: agentTotalRuntimeMin != null ? Math.round(agentTotalRuntimeMin * 100) / 100 : undefined, wall_clock_minutes: Math.round(wallClockMs / 60000 * 100) / 100 };
    });
    const totalAgentHours = rows.reduce((s, r) => s + r.duration_minutes / 60, 0);
    const totalHumanEquiv = rows.reduce((s, r) => s + r.human_equiv_hours, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0);
    const totalSavings = rows.reduce((s, r) => s + r.human_equiv_cost_saved, 0);
    const totalTokens = rows.reduce((s, r) => s + r.tokens_total, 0);
    const totalTokensIn = entries.reduce((s, e) => s + e.tokens_in, 0);
    const totalTokensOut = entries.reduce((s, e) => s + e.tokens_out, 0);
    const clientMap = new Map<string, ClientSummary>();
    for (const r of rows) { const c = clientMap.get(r.client) || { client: r.client, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, savings_usd: 0, entries: 0 }; c.agent_hours += r.duration_minutes / 60; c.human_equiv_hours += r.human_equiv_hours; c.cost_usd += r.cost_usd; c.savings_usd += r.human_equiv_cost_saved; c.entries += 1; clientMap.set(r.client, c); }

    const agentMap = new Map<string, any>();
    for (const e of entries) { const dur = e.end ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000 : 0; const a = agentMap.get(e.agent) || { agent: e.agent, model: e.model, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, entries: 0, completed: 0 }; a.agent_hours += dur; const eq = equivs[e.category] || equivs.other; a.human_equiv_hours += dur * eq.multiplier; a.cost_usd += e.cost_usd; a.entries += 1; if (e.status === 'completed') a.completed += 1; a.model = e.model; agentMap.set(e.agent, a); }

    const projMap = new Map<string, ProjectSummary>();
    for (const r of rows) { const key = `${r.client}::${r.project}`; const p = projMap.get(key) || { project: r.project, client: r.client, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, entries: 0 }; p.agent_hours += r.duration_minutes / 60; p.human_equiv_hours += r.human_equiv_hours; p.cost_usd += r.cost_usd; p.entries += 1; projMap.set(key, p); }

    const catMap = new Map<string, CategorySummary>();
    for (const r of rows) { const c = catMap.get(r.category) || { category: r.category as any, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, savings_usd: 0, entries: 0 }; c.agent_hours += r.duration_minutes / 60; c.human_equiv_hours += r.human_equiv_hours; c.cost_usd += r.cost_usd; c.savings_usd += r.human_equiv_cost_saved; c.entries += 1; catMap.set(r.category, c); }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const mergedMs = computeMergedRuntimeMs(entries.map(e => ({ start: e.start, end: e.end })));
    return { period_start: from, period_end: to, total_entries: entries.length, total_agent_hours: round2(totalAgentHours), total_human_equiv_hours: round2(totalHumanEquiv), total_cost_usd: round2(totalCost), total_savings_usd: round2(totalSavings), total_tokens: totalTokens, total_tokens_in: totalTokensIn, total_tokens_out: totalTokensOut, total_time_saved_hours: round2(totalHumanEquiv - mergedMs / 3600000), total_agent_merged_runtime_hours: round2(mergedMs / 3600000),
      by_client: [...clientMap.values()].map(c => ({ ...c, agent_hours: round2(c.agent_hours), human_equiv_hours: round2(c.human_equiv_hours), cost_usd: round2(c.cost_usd), savings_usd: round2(c.savings_usd) })),
      by_agent: [...agentMap.values()].map(a => ({ ...a, agent_hours: round2(a.agent_hours), human_equiv_hours: round2(a.human_equiv_hours), cost_usd: round2(a.cost_usd), success_rate: a.entries > 0 ? Math.round((a.completed / a.entries) * 100) : 0 })),
      by_project: [...projMap.values()].map(p => ({ ...p, agent_hours: round2(p.agent_hours), human_equiv_hours: round2(p.human_equiv_hours), cost_usd: round2(p.cost_usd) })),
      by_category: [...catMap.values()].map(c => ({ ...c, agent_hours: round2(c.agent_hours), human_equiv_hours: round2(c.human_equiv_hours), cost_usd: round2(c.cost_usd), savings_usd: round2(c.savings_usd) })),
      entries: rows };
  }

  getClients(): string[] { return this.getDistinct('client'); }
  getProjects(): string[] { return this.getDistinct('project'); }
  getAgents(): string[] { return this.getDistinct('agent'); }

  private getDistinct(col: string): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT ${col} FROM entries ORDER BY ${col}`).all() as any[];
    return rows.map(r => r[col] as string);
  }

  getStats() {
    const count = (sql: string): number => {
      const row = this.db.prepare(sql).get() as any;
      return (row?.c as number) || 0;
    };
    return { total_entries: count('SELECT COUNT(*) as c FROM entries'), running: count("SELECT COUNT(*) as c FROM entries WHERE status = 'running'"), clients: count('SELECT COUNT(DISTINCT client) as c FROM entries'), projects: count('SELECT COUNT(DISTINCT project) as c FROM entries'), agents: count('SELECT COUNT(DISTINCT agent) as c FROM entries') };
  }

  private rowToEntry(row: any): ClawckEntry {
    return { id: row.id, agent: row.agent, model: row.model, client: row.client, project: row.project, task: row.task, category: row.category, start: row.start, end: row.end_, status: row.status, tokens_in: row.tokens_in, tokens_out: row.tokens_out, cost_usd: row.cost_usd, tool_calls: row.tool_calls, summary: row.summary, tags: JSON.parse(row.tags || '[]'), source: row.source, spec_version: row.spec_version, created_at: row.created_at, updated_at: row.updated_at, approved: !!row.approved, agent_runtime_ms: row.agent_runtime_ms ?? null, wall_clock_ms: row.wall_clock_ms ?? null, edit_pending: !!row.edit_pending, pending_edits: row.pending_edits ? JSON.parse(row.pending_edits) : null };
  }

  upsert(entry: ClawckEntry): ClawckEntry {
    this.db.prepare(
      `INSERT OR REPLACE INTO entries (id, agent, model, client, project, task, category, start, end_, status, tokens_in, tokens_out, cost_usd, tool_calls, summary, tags, source, spec_version, approved, agent_runtime_ms, wall_clock_ms, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
    ).run(entry.id, entry.agent, entry.model, entry.client, entry.project, entry.task, entry.category, entry.start, entry.end, entry.status, entry.tokens_in, entry.tokens_out, entry.cost_usd, entry.tool_calls, entry.summary, JSON.stringify(entry.tags), entry.source, entry.spec_version, entry.approved ? 1 : 0, entry.agent_runtime_ms ?? null, entry.wall_clock_ms ?? null);
    return this.getById(entry.id)!;
  }

  bulkUpsert(entries: ClawckEntry[]): number {
    const upsertStmt = this.db.prepare(
      `INSERT OR REPLACE INTO entries (id, agent, model, client, project, task, category, start, end_, status, tokens_in, tokens_out, cost_usd, tool_calls, summary, tags, source, spec_version, approved, agent_runtime_ms, wall_clock_ms, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
    );
    const runMany = this.db.transaction((items: ClawckEntry[]) => {
      for (const entry of items) {
        upsertStmt.run(entry.id, entry.agent, entry.model, entry.client, entry.project, entry.task, entry.category, entry.start, entry.end, entry.status, entry.tokens_in, entry.tokens_out, entry.cost_usd, entry.tool_calls, entry.summary, JSON.stringify(entry.tags), entry.source, entry.spec_version, entry.approved ? 1 : 0, entry.agent_runtime_ms ?? null, entry.wall_clock_ms ?? null);
      }
    });
    runMany(entries);
    return entries.length;
  }

  getSyncState(sourceName: string): SyncState | null {
    const row = this.db.prepare('SELECT * FROM sync_state WHERE source_name = ?').get(sourceName) as any;
    if (!row) return null;
    return { source_name: row.source_name, last_sync_at: row.last_sync_at, last_status: row.last_status, last_error: row.last_error, entries_synced: row.entries_synced };
  }

  setSyncState(state: SyncState): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO sync_state (source_name, last_sync_at, last_status, last_error, entries_synced) VALUES (?,?,?,?,?)`
    ).run(state.source_name, state.last_sync_at, state.last_status, state.last_error || null, state.entries_synced);
  }

  getAllSyncStates(): SyncState[] {
    const rows = this.db.prepare('SELECT * FROM sync_state ORDER BY source_name').all() as any[];
    return rows.map(row => ({
      source_name: row.source_name as string,
      last_sync_at: row.last_sync_at as string,
      last_status: row.last_status as 'success' | 'error',
      last_error: row.last_error as string | undefined,
      entries_synced: row.entries_synced as number,
    }));
  }

  // ─── Personal Baselines ─────────────────────────────────

  insertBaseline(baseline: PersonalBaseline): PersonalBaseline {
    this.db.prepare(
      `INSERT INTO personal_baselines (id, category, task_type, description, my_minutes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(baseline.id, baseline.category, baseline.task_type, baseline.description, baseline.my_minutes, baseline.created_at, baseline.updated_at);
    return baseline;
  }

  updateBaseline(id: string, updates: Partial<PersonalBaseline>): PersonalBaseline | null {
    const existing = this.getBaselineById(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
    if (updates.task_type !== undefined) { fields.push('task_type = ?'); values.push(updates.task_type); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.my_minutes !== undefined) { fields.push('my_minutes = ?'); values.push(updates.my_minutes); }
    fields.push("updated_at = datetime('now')");
    if (fields.length === 1) return existing;
    values.push(id);
    this.db.prepare(`UPDATE personal_baselines SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getBaselineById(id);
  }

  deleteBaseline(id: string): boolean {
    const result = this.db.prepare('DELETE FROM personal_baselines WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getBaselineById(id: string): PersonalBaseline | null {
    const row = this.db.prepare('SELECT * FROM personal_baselines WHERE id = ?').get(id) as any;
    return row ? this.rowToBaseline(row) : null;
  }

  getBaselines(): PersonalBaseline[] {
    const rows = this.db.prepare('SELECT * FROM personal_baselines ORDER BY category, task_type').all() as any[];
    return rows.map(r => this.rowToBaseline(r));
  }

  getBaselinesByCategory(category: string): PersonalBaseline[] {
    const rows = this.db.prepare('SELECT * FROM personal_baselines WHERE category = ? ORDER BY task_type').all(category) as any[];
    return rows.map(r => this.rowToBaseline(r));
  }

  private rowToBaseline(row: any): PersonalBaseline {
    return {
      id: row.id,
      category: row.category as TaskCategory,
      task_type: row.task_type,
      description: row.description,
      my_minutes: row.my_minutes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ─── Reports ───────────────────────────────────────────

  insertReport(report: StoredReport): StoredReport {
    const content = typeof report.content === 'string' ? Buffer.from(report.content, 'utf-8') : report.content;
    this.db.prepare(
      `INSERT INTO reports (id, name, period, period_start, period_end, style, format, content, metadata, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(report.id, report.name, report.period, report.period_start, report.period_end, report.style, report.format, content, JSON.stringify(report.metadata), report.created_at);
    return report;
  }

  getReportById(id: string): StoredReport | null {
    const row = this.db.prepare('SELECT id, name, period, period_start, period_end, style, format, metadata, created_at FROM reports WHERE id = ?').get(id) as any;
    return row ? this.rowToReport(row) : null;
  }

  listReports(limit: number = 50, offset: number = 0): StoredReport[] {
    const rows = this.db.prepare('SELECT id, name, period, period_start, period_end, style, format, metadata, created_at FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as any[];
    return rows.map(r => this.rowToReport(r));
  }

  getReportContent(id: string): StoredReport | null {
    const row = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as any;
    if (!row) return null;
    const report = this.rowToReport(row);
    if (row.content) {
      const buf = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
      report.content = report.format === 'pdf' ? buf : buf.toString('utf-8');
    } else {
      report.content = '';
    }
    return report;
  }

  deleteReport(id: string): boolean {
    const result = this.db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToReport(row: any): StoredReport {
    return {
      id: row.id,
      name: row.name,
      period: row.period as ReportPeriod,
      period_start: row.period_start,
      period_end: row.period_end,
      style: row.style as ReportStyle,
      format: row.format as ReportFormat,
      content: '',
      metadata: JSON.parse(row.metadata || '{}') as ReportMetadata,
      created_at: row.created_at,
    };
  }

  // ─── Pending Edits ─────────────────────────────────────────

  setPendingEdit(entryId: string, edit: PendingEdit): ClawckEntry | null {
    const existing = this.getById(entryId);
    if (!existing) return null;
    this.db.prepare(
      `UPDATE entries SET edit_pending = 1, pending_edits = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(edit), entryId);
    return this.getById(entryId);
  }

  clearPendingEdit(entryId: string): ClawckEntry | null {
    const existing = this.getById(entryId);
    if (!existing) return null;
    this.db.prepare(
      `UPDATE entries SET edit_pending = 0, pending_edits = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(entryId);
    return this.getById(entryId);
  }

  getPendingEdits(): PendingEditEntry[] {
    const rows = this.db.prepare(
      `SELECT * FROM entries WHERE edit_pending = 1 ORDER BY updated_at DESC`
    ).all() as any[];
    return rows.map(row => ({
      id: row.id,
      current: this.rowToEntry(row),
      pending: JSON.parse(row.pending_edits || '{}') as PendingEdit,
    }));
  }

  approvePendingEdit(entryId: string, actor: string = 'system'): ClawckEntry | null {
    const existing = this.getById(entryId);
    if (!existing || !existing.edit_pending) return null;
    const pending = existing.pending_edits;
    if (!pending) return null;
    // Apply the pending changes
    const updates: Partial<ClawckEntry> = pending.changes;
    const entry = this.update(entryId, updates, actor);
    if (!entry) return null;
    // Log apply_edit audit
    this.logAudit(entryId, 'apply_edit', actor, {
      oldValue: pending.changes,
      metadata: { requested_by: pending.requested_by, reason: pending.reason },
    });
    // Clear the pending edit flag
    return this.clearPendingEdit(entryId);
  }

  rejectPendingEdit(entryId: string, actor: string = 'system'): ClawckEntry | null {
    const existing = this.getById(entryId);
    if (existing?.pending_edits) {
      this.logAudit(entryId, 'reject_edit', actor, {
        oldValue: existing.pending_edits.changes,
        metadata: { requested_by: existing.pending_edits.requested_by },
      });
    }
    return this.clearPendingEdit(entryId);
  }

  // ─── Channel Mappings ─────────────────────────────────────

  insertChannelMapping(mapping: ChannelMapping): ChannelMapping {
    this.db.prepare(
      `INSERT INTO channel_mappings (id, channel_id, channel_name, project, client, default_category, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run(mapping.id, mapping.channel_id, mapping.channel_name, mapping.project || null, mapping.client || null, mapping.default_category || null, mapping.created_at, mapping.updated_at);
    return mapping;
  }

  updateChannelMapping(id: string, updates: Partial<ChannelMapping>): ChannelMapping | null {
    const existing = this.getChannelMappingById(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.channel_id !== undefined) { fields.push('channel_id = ?'); values.push(updates.channel_id); }
    if (updates.channel_name !== undefined) { fields.push('channel_name = ?'); values.push(updates.channel_name); }
    if (updates.project !== undefined) { fields.push('project = ?'); values.push(updates.project || null); }
    if (updates.client !== undefined) { fields.push('client = ?'); values.push(updates.client || null); }
    if (updates.default_category !== undefined) { fields.push('default_category = ?'); values.push(updates.default_category || null); }
    fields.push("updated_at = datetime('now')");
    if (fields.length === 1) return existing;
    values.push(id);
    this.db.prepare(`UPDATE channel_mappings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getChannelMappingById(id);
  }

  deleteChannelMapping(id: string): boolean {
    const result = this.db.prepare('DELETE FROM channel_mappings WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getChannelMappingById(id: string): ChannelMapping | null {
    const row = this.db.prepare('SELECT * FROM channel_mappings WHERE id = ?').get(id) as any;
    return row ? this.rowToChannelMapping(row) : null;
  }

  getChannelMappingByChannelId(channelId: string): ChannelMapping | null {
    const row = this.db.prepare('SELECT * FROM channel_mappings WHERE channel_id = ?').get(channelId) as any;
    return row ? this.rowToChannelMapping(row) : null;
  }

  getChannelMappings(): ChannelMapping[] {
    const rows = this.db.prepare('SELECT * FROM channel_mappings ORDER BY channel_name').all() as any[];
    return rows.map(r => this.rowToChannelMapping(r));
  }

  private rowToChannelMapping(row: any): ChannelMapping {
    return {
      id: row.id,
      channel_id: row.channel_id,
      channel_name: row.channel_name || '',
      project: row.project || undefined,
      client: row.client || undefined,
      default_category: row.default_category as TaskCategory || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ─── Audit Log ─────────────────────────────────────────

  insertAudit(audit: AuditEntry): AuditEntry {
    this.db.prepare(
      `INSERT INTO audit_log (id, entry_id, action, actor, old_value, new_value, field, timestamp, metadata) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      audit.id,
      audit.entry_id,
      audit.action,
      audit.actor,
      audit.old_value || null,
      audit.new_value || null,
      audit.field || null,
      audit.timestamp,
      audit.metadata ? JSON.stringify(audit.metadata) : null
    );
    return audit;
  }

  logAudit(entryId: string, action: AuditAction, actor: string, options?: {
    oldValue?: any;
    newValue?: any;
    field?: string;
    metadata?: Record<string, any>;
  }): AuditEntry {
    const audit: AuditEntry = {
      id: crypto.randomUUID(),
      entry_id: entryId,
      action,
      actor,
      old_value: options?.oldValue !== undefined ? JSON.stringify(options.oldValue) : undefined,
      new_value: options?.newValue !== undefined ? JSON.stringify(options.newValue) : undefined,
      field: options?.field,
      timestamp: new Date().toISOString(),
      metadata: options?.metadata,
    };
    return this.insertAudit(audit);
  }

  getAuditByEntryId(entryId: string): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE entry_id = ? ORDER BY timestamp DESC'
    ).all(entryId) as any[];
    return rows.map(r => this.rowToAudit(r));
  }

  getRecentAudit(days: number = 7, limit: number = 100): AuditEntry[] {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?'
    ).all(since, limit) as any[];
    return rows.map(r => this.rowToAudit(r));
  }

  getAuditByAction(action: AuditAction, limit: number = 100): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE action = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(action, limit) as any[];
    return rows.map(r => this.rowToAudit(r));
  }

  private rowToAudit(row: any): AuditEntry {
    return {
      id: row.id,
      entry_id: row.entry_id,
      action: row.action as AuditAction,
      actor: row.actor,
      old_value: row.old_value || undefined,
      new_value: row.new_value || undefined,
      field: row.field || undefined,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  close(): void { this.db.close(); }
}
