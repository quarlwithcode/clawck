/**
 * ⏱️🦀 Clawck — REST API Server
 * Express-based server for the REST API and dashboard.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { Clawck } from '../core/clawck';
import { ClawckConfig, ClawckEntry, DEFAULT_CONFIG, SPEC_VERSION } from '../core/types';
import { SyncManager } from '../core/sync';
import { getDashboardHTML } from '../dashboard/index';

export async function createServer(config: Partial<ClawckConfig> = {}): Promise<{ app: express.Express; clawck: Clawck; syncManager?: SyncManager }> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const clawck = await new Clawck(fullConfig).ready();
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ─── Dashboard ──────────────────────────────────────────

  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getDashboardHTML(fullConfig.port));
  });

  // ─── Health ─────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0', spec: '0.1.0' });
  });

  app.get('/api/stats', (_req, res) => {
    res.json(clawck.stats());
  });

  // ─── Start Task ─────────────────────────────────────────

  app.post('/api/start', (req, res) => {
    try {
      const entry = clawck.start(req.body);
      res.status(201).json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Stop Task ──────────────────────────────────────────

  app.post('/api/stop', (req, res) => {
    try {
      const entry = clawck.stop(req.body);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Log Completed Task ────────────────────────────────

  app.post('/api/log', (req, res) => {
    try {
      const entry = clawck.log(req.body);
      res.status(201).json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Update Entry ──────────────────────────────────────

  app.patch('/api/entries/:id', (req, res) => {
    try {
      const entry = clawck.update(req.params.id, req.body);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Get Entry ─────────────────────────────────────────

  app.get('/api/entries/:id', (req, res) => {
    const entry = clawck.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  });

  // ─── Query Entries ─────────────────────────────────────

  app.get('/api/entries', (req, res) => {
    const entries = clawck.query({
      client: req.query.client as string,
      project: req.query.project as string,
      agent: req.query.agent as string,
      category: req.query.category as string,
      status: req.query.status as string,
      from: req.query.from as string,
      to: req.query.to as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json(entries);
  });

  // ─── Running Entries ───────────────────────────────────

  app.get('/api/running', (_req, res) => {
    res.json(clawck.running());
  });

  // ─── Timesheet ─────────────────────────────────────────

  app.get('/api/timesheet', (req, res) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
    const from = (req.query.from as string) || weekAgo.toISOString();
    const to = (req.query.to as string) || now.toISOString();

    const timesheet = clawck.timesheet(from, to, {
      client: req.query.client as string,
      project: req.query.project as string,
      agent: req.query.agent as string,
    });
    res.json(timesheet);
  });

  // ─── Filter Options ────────────────────────────────────

  app.get('/api/clients', (_req, res) => res.json(clawck.clients()));
  app.get('/api/projects', (_req, res) => res.json(clawck.projects()));
  app.get('/api/agents', (_req, res) => res.json(clawck.agents()));

  // ─── Ingest (for remote sync / merging) ────────────────

  app.post('/api/ingest', (req, res) => {
    try {
      const entries = Array.isArray(req.body) ? req.body : [req.body];
      let ingested = 0;
      for (const raw of entries) {
        try {
          const entry: ClawckEntry = {
            id: raw.id,
            agent: raw.agent || 'unknown-agent',
            model: raw.model || 'unknown',
            client: raw.client || 'default',
            project: raw.project || 'default',
            task: raw.task,
            category: raw.category || 'other',
            start: raw.start,
            end: raw.end || null,
            status: raw.status || 'completed',
            tokens_in: raw.tokens_in || 0,
            tokens_out: raw.tokens_out || 0,
            cost_usd: raw.cost_usd || 0,
            tool_calls: raw.tool_calls || 0,
            summary: raw.summary || '',
            tags: raw.tags || [],
            source: raw.source || 'remote',
            spec_version: raw.spec_version || SPEC_VERSION,
          };
          clawck.upsert(entry);
          ingested++;
        } catch (e) {
          // Skip bad entries
        }
      }
      res.json({ ingested, total: entries.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Sync Status ──────────────────────────────────────

  let syncManager: SyncManager | null = null;

  if (fullConfig.remote_sources && fullConfig.remote_sources.length > 0) {
    syncManager = new SyncManager(fullConfig, clawck.database);
    syncManager.start();
  }

  app.get('/api/sync/status', (_req, res) => {
    if (!syncManager) return res.json({ enabled: false, states: [] });
    res.json({ enabled: true, states: syncManager.getStates() });
  });

  app.post('/api/sync/trigger', async (_req, res) => {
    if (!syncManager) return res.status(400).json({ error: 'Sync not configured — no remote_sources defined' });
    const states = await syncManager.syncAll();
    res.json({ states });
  });

  return { app, clawck, syncManager: syncManager ?? undefined };
}

export async function startServer(config: Partial<ClawckConfig> = {}): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const { app } = await createServer(config);
  const port = fullConfig.port;

  app.listen(port, () => {
    console.log(`\n  ⏱️🦀 Clawck is running!`);
    console.log(`  ├─ Dashboard:  http://localhost:${port}`);
    console.log(`  ├─ API:        http://localhost:${port}/api`);
    console.log(`  ├─ Data dir:   ${fullConfig.data_dir}`);
    console.log(`  └─ Spec:       v${fullConfig.port ? '0.1.0' : '0.1.0'}\n`);
  });
}
