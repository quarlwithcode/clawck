import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClawckDB } from '../src/core/database';
import { SyncManager } from '../src/core/sync';
import { ClawckConfig } from '../src/core/types';
import { createServer } from '../src/server/api';
import request from 'supertest';
import { makeTmpConfig, makeEntry } from './helpers';

describe('Database upsert', () => {
  let db: ClawckDB;
  let config: ClawckConfig;

  beforeEach(async () => {
    config = makeTmpConfig();
    db = new ClawckDB(config);
    await db.ensureReady();
  });

  afterEach(() => {
    try { db.close(); } catch {}
  });

  it('inserts a new entry via upsert', () => {
    const entry = makeEntry({ id: 'upsert-new-1' });
    const result = db.upsert(entry);
    expect(result.id).toBe('upsert-new-1');
    expect(db.getById('upsert-new-1')).not.toBeNull();
  });

  it('updates an existing entry via upsert (preserves UUID)', () => {
    const entry = makeEntry({ id: 'upsert-update-1', summary: 'original' });
    db.insert(entry);
    const updated = db.upsert({ ...entry, summary: 'updated' });
    expect(updated.id).toBe('upsert-update-1');
    expect(updated.summary).toBe('updated');
  });

  it('handles mixed inserts/updates via bulkUpsert', () => {
    const existing = makeEntry({ id: 'bulk-1', summary: 'old' });
    db.insert(existing);

    const entries = [
      makeEntry({ id: 'bulk-1', summary: 'new' }),
      makeEntry({ id: 'bulk-2' }),
      makeEntry({ id: 'bulk-3' }),
    ];
    const count = db.bulkUpsert(entries);
    expect(count).toBe(3);
    expect(db.getById('bulk-1')!.summary).toBe('new');
    expect(db.getById('bulk-2')).not.toBeNull();
    expect(db.getById('bulk-3')).not.toBeNull();
  });
});

describe('SyncManager', () => {
  let db: ClawckDB;
  let config: ClawckConfig;

  beforeEach(async () => {
    config = makeTmpConfig();
    db = new ClawckDB(config);
    await db.ensureReady();
  });

  afterEach(() => {
    try { db.close(); } catch {}
    vi.restoreAllMocks();
  });

  it('syncOne fetches and upserts entries', async () => {
    const remoteEntries = [makeEntry({ id: 'remote-1' }), makeEntry({ id: 'remote-2' })];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => remoteEntries,
      status: 200,
      statusText: 'OK',
    } as Response);

    const syncConfig: ClawckConfig = {
      ...config,
      remote_sources: [{ name: 'device-1', url: 'http://localhost:9999' }],
    };
    const manager = new SyncManager(syncConfig, db);
    const state = await manager.syncOne({ name: 'device-1', url: 'http://localhost:9999' });

    expect(state.last_status).toBe('success');
    expect(state.entries_synced).toBe(2);
    expect(db.getById('remote-1')).not.toBeNull();
    expect(db.getById('remote-2')).not.toBeNull();
  });

  it('handles network errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const syncConfig: ClawckConfig = {
      ...config,
      remote_sources: [{ name: 'bad-device', url: 'http://localhost:9999' }],
    };
    const manager = new SyncManager(syncConfig, db);
    const state = await manager.syncOne({ name: 'bad-device', url: 'http://localhost:9999' });

    expect(state.last_status).toBe('error');
    expect(state.last_error).toContain('Connection refused');
  });

  it('sends correct from parameter for incremental sync', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
      status: 200,
      statusText: 'OK',
    } as Response);

    const syncTime = '2026-03-07T10:00:00.000Z';
    db.setSyncState({
      source_name: 'device-2',
      last_sync_at: syncTime,
      last_status: 'success',
      entries_synced: 0,
    });

    const syncConfig: ClawckConfig = {
      ...config,
      remote_sources: [{ name: 'device-2', url: 'http://localhost:8888' }],
    };
    const manager = new SyncManager(syncConfig, db);
    await manager.syncOne({ name: 'device-2', url: 'http://localhost:8888' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    // Should use syncTime - 60s as from parameter
    const expectedFrom = new Date(new Date(syncTime).getTime() - 60000).toISOString();
    expect(calledUrl).toContain(encodeURIComponent(expectedFrom));
  });
});

describe('Ingest endpoint', () => {
  it('preserves original UUIDs', async () => {
    const config = makeTmpConfig();
    const { app, clawck } = await createServer(config);

    const entry = makeEntry({ id: 'preserve-uuid-1' });
    const res = await request(app)
      .post('/api/ingest')
      .send(entry)
      .expect(200);

    expect(res.body.ingested).toBe(1);

    const fetched = clawck.get('preserve-uuid-1');
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe('preserve-uuid-1');

    clawck.close();
  });
});
