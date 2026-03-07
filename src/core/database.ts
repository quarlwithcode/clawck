/**
 * Clawck Database Layer - SQLite via sql.js (pure JS, zero native deps)
 */

import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { ClawckEntry, TimesheetSummary, TimesheetRow, ClawckConfig, DEFAULT_HUMAN_EQUIVALENTS, ClientSummary, AgentSummary, ProjectSummary, CategorySummary, SyncState } from './types';

export class ClawckDB {
  private db!: any;
  private config: ClawckConfig;
  private dbPath: string;
  private _ready: Promise<void>;

  constructor(config: ClawckConfig) {
    this.config = config;
    const dbDir = path.resolve(config.data_dir);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    this.dbPath = path.join(dbDir, 'clawck.db');
    this._ready = this.init();
  }

  private async init(): Promise<void> {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      this.db = new SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      this.db = new SQL.Database();
    }
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS entries (
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
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entries_agent ON entries(agent)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entries_client ON entries(client)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entries_start ON entries(start)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS sync_state (
      source_name TEXT PRIMARY KEY,
      last_sync_at TEXT NOT NULL,
      last_status TEXT NOT NULL DEFAULT 'success',
      last_error TEXT,
      entries_synced INTEGER NOT NULL DEFAULT 0
    )`);
    this.save();
  }

  async ensureReady(): Promise<void> { await this._ready; }

  private save(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  insert(entry: ClawckEntry): ClawckEntry {
    this.db.run(
      `INSERT INTO entries (id, agent, model, client, project, task, category, start, end_, status, tokens_in, tokens_out, cost_usd, tool_calls, summary, tags, source, spec_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [entry.id, entry.agent, entry.model, entry.client, entry.project, entry.task, entry.category, entry.start, entry.end, entry.status, entry.tokens_in, entry.tokens_out, entry.cost_usd, entry.tool_calls, entry.summary, JSON.stringify(entry.tags), entry.source, entry.spec_version]
    );
    this.save();
    return entry;
  }

  update(id: string, updates: Partial<ClawckEntry>): ClawckEntry | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.end !== undefined) { fields.push('end_ = ?'); values.push(updates.end); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.tokens_in !== undefined) { fields.push('tokens_in = ?'); values.push(updates.tokens_in); }
    if (updates.tokens_out !== undefined) { fields.push('tokens_out = ?'); values.push(updates.tokens_out); }
    if (updates.cost_usd !== undefined) { fields.push('cost_usd = ?'); values.push(updates.cost_usd); }
    if (updates.tool_calls !== undefined) { fields.push('tool_calls = ?'); values.push(updates.tool_calls); }
    if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary); }
    if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
    if (updates.project !== undefined) { fields.push('project = ?'); values.push(updates.project); }
    if (updates.client !== undefined) { fields.push('client = ?'); values.push(updates.client); }
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
    fields.push("updated_at = datetime('now')");
    if (fields.length === 1) return existing;
    values.push(id);
    this.db.run(`UPDATE entries SET ${fields.join(', ')} WHERE id = ?`, values);
    this.save();
    return this.getById(id);
  }

  getById(id: string): ClawckEntry | null {
    const stmt = this.db.prepare('SELECT * FROM entries WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return this.rowToEntry(row); }
    stmt.free();
    return null;
  }

  getRunning(): ClawckEntry[] {
    return this.queryRows("SELECT * FROM entries WHERE status = 'running' ORDER BY start DESC");
  }

  query(filters: { client?: string; project?: string; agent?: string; category?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number; } = {}): ClawckEntry[] {
    const conds: string[] = []; const params: any[] = [];
    if (filters.client) { conds.push('client = ?'); params.push(filters.client); }
    if (filters.project) { conds.push('project = ?'); params.push(filters.project); }
    if (filters.agent) { conds.push('agent = ?'); params.push(filters.agent); }
    if (filters.category) { conds.push('category = ?'); params.push(filters.category); }
    if (filters.status) { conds.push('status = ?'); params.push(filters.status); }
    if (filters.from) { conds.push('start >= ?'); params.push(filters.from); }
    if (filters.to) { conds.push('start <= ?'); params.push(filters.to); }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    return this.queryRows(`SELECT * FROM entries ${where} ORDER BY start DESC LIMIT ${filters.limit || 500} OFFSET ${filters.offset || 0}`, params);
  }

  private queryRows(sql: string, params: any[] = []): ClawckEntry[] {
    const results: ClawckEntry[] = [];
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    while (stmt.step()) results.push(this.rowToEntry(stmt.getAsObject()));
    stmt.free();
    return results;
  }

  getTimesheet(from: string, to: string, filters: { client?: string; project?: string; agent?: string } = {}): TimesheetSummary {
    const entries = this.query({ ...filters, from, to, limit: 10000 });
    const equivs = this.config.human_equivalents || DEFAULT_HUMAN_EQUIVALENTS;
    const rows: TimesheetRow[] = entries.map(e => {
      const durationMin = e.end ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000 : (Date.now() - new Date(e.start).getTime()) / 60000;
      const equiv = equivs[e.category] || equivs.other;
      const agentHours = durationMin / 60;
      const humanEquivHours = agentHours * equiv.multiplier;
      return { date: e.start.split('T')[0], agent: e.agent, client: e.client, project: e.project, task: e.task, category: e.category, duration_minutes: Math.round(durationMin * 100) / 100, tokens_total: e.tokens_in + e.tokens_out, cost_usd: e.cost_usd, human_equiv_hours: Math.round(humanEquivHours * 100) / 100, human_equiv_cost_saved: Math.round(humanEquivHours * equiv.human_rate_usd * 100) / 100, status: e.status };
    });
    const totalAgentHours = rows.reduce((s, r) => s + r.duration_minutes / 60, 0);
    const totalHumanEquiv = rows.reduce((s, r) => s + r.human_equiv_hours, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0);
    const totalSavings = rows.reduce((s, r) => s + r.human_equiv_cost_saved, 0);
    const totalTokens = rows.reduce((s, r) => s + r.tokens_total, 0);

    const clientMap = new Map<string, ClientSummary>();
    for (const r of rows) { const c = clientMap.get(r.client) || { client: r.client, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, savings_usd: 0, entries: 0 }; c.agent_hours += r.duration_minutes / 60; c.human_equiv_hours += r.human_equiv_hours; c.cost_usd += r.cost_usd; c.savings_usd += r.human_equiv_cost_saved; c.entries += 1; clientMap.set(r.client, c); }

    const agentMap = new Map<string, any>();
    for (const e of entries) { const dur = e.end ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000 : 0; const a = agentMap.get(e.agent) || { agent: e.agent, model: e.model, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, entries: 0, completed: 0 }; a.agent_hours += dur; const eq = equivs[e.category] || equivs.other; a.human_equiv_hours += dur * eq.multiplier; a.cost_usd += e.cost_usd; a.entries += 1; if (e.status === 'completed') a.completed += 1; a.model = e.model; agentMap.set(e.agent, a); }

    const projMap = new Map<string, ProjectSummary>();
    for (const r of rows) { const key = `${r.client}::${r.project}`; const p = projMap.get(key) || { project: r.project, client: r.client, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, entries: 0 }; p.agent_hours += r.duration_minutes / 60; p.human_equiv_hours += r.human_equiv_hours; p.cost_usd += r.cost_usd; p.entries += 1; projMap.set(key, p); }

    const catMap = new Map<string, CategorySummary>();
    for (const r of rows) { const c = catMap.get(r.category) || { category: r.category as any, agent_hours: 0, human_equiv_hours: 0, cost_usd: 0, savings_usd: 0, entries: 0 }; c.agent_hours += r.duration_minutes / 60; c.human_equiv_hours += r.human_equiv_hours; c.cost_usd += r.cost_usd; c.savings_usd += r.human_equiv_cost_saved; c.entries += 1; catMap.set(r.category, c); }

    return { period_start: from, period_end: to, total_entries: entries.length, total_agent_hours: Math.round(totalAgentHours * 100) / 100, total_human_equiv_hours: Math.round(totalHumanEquiv * 100) / 100, total_cost_usd: Math.round(totalCost * 100) / 100, total_savings_usd: Math.round(totalSavings * 100) / 100, total_tokens: totalTokens, by_client: [...clientMap.values()], by_agent: [...agentMap.values()].map(a => ({ ...a, success_rate: a.entries > 0 ? Math.round((a.completed / a.entries) * 100) : 0 })), by_project: [...projMap.values()], by_category: [...catMap.values()], entries: rows };
  }

  getClients(): string[] { return this.getDistinct('client'); }
  getProjects(): string[] { return this.getDistinct('project'); }
  getAgents(): string[] { return this.getDistinct('agent'); }

  private getDistinct(col: string): string[] {
    const r: string[] = []; const stmt = this.db.prepare(`SELECT DISTINCT ${col} FROM entries ORDER BY ${col}`);
    while (stmt.step()) { const row = stmt.getAsObject(); r.push(row[col] as string); } stmt.free(); return r;
  }

  getStats() {
    const count = (sql: string): number => { const s = this.db.prepare(sql); s.step(); const v = s.getAsObject(); s.free(); return (v.c as number) || 0; };
    return { total_entries: count('SELECT COUNT(*) as c FROM entries'), running: count("SELECT COUNT(*) as c FROM entries WHERE status = 'running'"), clients: count('SELECT COUNT(DISTINCT client) as c FROM entries'), projects: count('SELECT COUNT(DISTINCT project) as c FROM entries'), agents: count('SELECT COUNT(DISTINCT agent) as c FROM entries') };
  }

  private rowToEntry(row: any): ClawckEntry {
    return { id: row.id, agent: row.agent, model: row.model, client: row.client, project: row.project, task: row.task, category: row.category, start: row.start, end: row.end_, status: row.status, tokens_in: row.tokens_in, tokens_out: row.tokens_out, cost_usd: row.cost_usd, tool_calls: row.tool_calls, summary: row.summary, tags: JSON.parse(row.tags || '[]'), source: row.source, spec_version: row.spec_version };
  }

  upsert(entry: ClawckEntry): ClawckEntry {
    const existing = this.getById(entry.id);
    if (existing) {
      this.db.run(
        `UPDATE entries SET agent=?, model=?, client=?, project=?, task=?, category=?, start=?, end_=?, status=?, tokens_in=?, tokens_out=?, cost_usd=?, tool_calls=?, summary=?, tags=?, source=?, spec_version=?, updated_at=datetime('now') WHERE id=?`,
        [entry.agent, entry.model, entry.client, entry.project, entry.task, entry.category, entry.start, entry.end, entry.status, entry.tokens_in, entry.tokens_out, entry.cost_usd, entry.tool_calls, entry.summary, JSON.stringify(entry.tags), entry.source, entry.spec_version, entry.id]
      );
      this.save();
      return this.getById(entry.id)!;
    }
    return this.insert(entry);
  }

  bulkUpsert(entries: ClawckEntry[]): number {
    let count = 0;
    for (const entry of entries) {
      const existing = this.getById(entry.id);
      if (existing) {
        this.db.run(
          `UPDATE entries SET agent=?, model=?, client=?, project=?, task=?, category=?, start=?, end_=?, status=?, tokens_in=?, tokens_out=?, cost_usd=?, tool_calls=?, summary=?, tags=?, source=?, spec_version=?, updated_at=datetime('now') WHERE id=?`,
          [entry.agent, entry.model, entry.client, entry.project, entry.task, entry.category, entry.start, entry.end, entry.status, entry.tokens_in, entry.tokens_out, entry.cost_usd, entry.tool_calls, entry.summary, JSON.stringify(entry.tags), entry.source, entry.spec_version, entry.id]
        );
      } else {
        this.db.run(
          `INSERT INTO entries (id, agent, model, client, project, task, category, start, end_, status, tokens_in, tokens_out, cost_usd, tool_calls, summary, tags, source, spec_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [entry.id, entry.agent, entry.model, entry.client, entry.project, entry.task, entry.category, entry.start, entry.end, entry.status, entry.tokens_in, entry.tokens_out, entry.cost_usd, entry.tool_calls, entry.summary, JSON.stringify(entry.tags), entry.source, entry.spec_version]
        );
      }
      count++;
    }
    this.save();
    return count;
  }

  getSyncState(sourceName: string): SyncState | null {
    const stmt = this.db.prepare('SELECT * FROM sync_state WHERE source_name = ?');
    stmt.bind([sourceName]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return { source_name: row.source_name as string, last_sync_at: row.last_sync_at as string, last_status: row.last_status as 'success' | 'error', last_error: row.last_error as string | undefined, entries_synced: row.entries_synced as number };
    }
    stmt.free();
    return null;
  }

  setSyncState(state: SyncState): void {
    const existing = this.getSyncState(state.source_name);
    if (existing) {
      this.db.run('UPDATE sync_state SET last_sync_at=?, last_status=?, last_error=?, entries_synced=? WHERE source_name=?',
        [state.last_sync_at, state.last_status, state.last_error || null, state.entries_synced, state.source_name]);
    } else {
      this.db.run('INSERT INTO sync_state (source_name, last_sync_at, last_status, last_error, entries_synced) VALUES (?,?,?,?,?)',
        [state.source_name, state.last_sync_at, state.last_status, state.last_error || null, state.entries_synced]);
    }
    this.save();
  }

  getAllSyncStates(): SyncState[] {
    const results: SyncState[] = [];
    const stmt = this.db.prepare('SELECT * FROM sync_state ORDER BY source_name');
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({ source_name: row.source_name as string, last_sync_at: row.last_sync_at as string, last_status: row.last_status as 'success' | 'error', last_error: row.last_error as string | undefined, entries_synced: row.entries_synced as number });
    }
    stmt.free();
    return results;
  }

  close(): void { this.save(); this.db.close(); }
}
