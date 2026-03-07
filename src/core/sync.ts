/**
 * Clawck SyncManager — pulls entries from remote Clawck instances
 */

import { ClawckConfig, RemoteSource, SyncState, ClawckEntry } from './types';
import { ClawckDB } from './database';

export class SyncManager {
  private config: ClawckConfig;
  private db: ClawckDB;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(config: ClawckConfig, db: ClawckDB) {
    this.config = config;
    this.db = db;
  }

  start(): void {
    if (this.interval) return;
    const ms = (this.config.sync_interval || 60) * 1000;
    this.syncAll();
    this.interval = setInterval(() => this.syncAll(), ms);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async syncAll(): Promise<SyncState[]> {
    const sources = this.config.remote_sources || [];
    const results: SyncState[] = [];
    for (const source of sources) {
      try {
        const state = await this.syncOne(source);
        results.push(state);
      } catch {
        // Individual source errors are caught in syncOne
      }
    }
    return results;
  }

  async syncOne(source: RemoteSource): Promise<SyncState> {
    const existing = this.db.getSyncState(source.name);
    let fromDate: string;
    if (existing?.last_sync_at) {
      // Overlap by 60s to catch stragglers
      const d = new Date(new Date(existing.last_sync_at).getTime() - 60000);
      fromDate = d.toISOString();
    } else {
      fromDate = new Date(0).toISOString();
    }

    try {
      const url = `${source.url.replace(/\/$/, '')}/api/entries?from=${encodeURIComponent(fromDate)}&limit=1000`;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (source.api_key) {
        headers['Authorization'] = `Bearer ${source.api_key}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const entries: ClawckEntry[] = await response.json() as ClawckEntry[];
      const count = this.db.bulkUpsert(entries);

      const state: SyncState = {
        source_name: source.name,
        last_sync_at: new Date().toISOString(),
        last_status: 'success',
        entries_synced: count,
      };
      this.db.setSyncState(state);
      return state;
    } catch (err: any) {
      const state: SyncState = {
        source_name: source.name,
        last_sync_at: new Date().toISOString(),
        last_status: 'error',
        last_error: err.message || String(err),
        entries_synced: 0,
      };
      this.db.setSyncState(state);
      return state;
    }
  }

  getStates(): SyncState[] {
    return this.db.getAllSyncStates();
  }
}
