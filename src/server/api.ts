/**
 * ⏱️🦀 Clawck — REST API Server
 * Express-based server for the REST API and dashboard.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { Clawck } from '../core/clawck';
import { ClawckConfig, ClawckEntry, DEFAULT_CONFIG, SPEC_VERSION, APP_VERSION } from '../core/types';
import { ClawckError } from '../core/errors';
import { SyncManager } from '../core/sync';
import { getDashboardHTML } from '../dashboard/index';
import { exportATP, importATP } from '../core/atp';
import { INDUSTRY_BENCHMARKS } from '../core/benchmarks';
import { resolvePeriod } from '../reports/periods';
import { generateTimesheetHTML } from '../reports/html';
import { generateTimesheetPDF } from '../reports/pdf';
import { validateConfig } from '../core/config';
import { logger } from '../core/logger';
import fs from 'fs';
import os from 'os';

function safeInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

export async function createServer(config: Partial<ClawckConfig> = {}): Promise<{ app: express.Express; clawck: Clawck; syncManager?: SyncManager }> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const validation = validateConfig(fullConfig as Record<string, any>);
  if (!validation.valid) {
    throw new Error(`Invalid config: ${validation.errors.join('; ')}`);
  }

  const clawck = await new Clawck(fullConfig).ready();
  const app = express();

  app.use(cors({
    origin: fullConfig.cors_origin || true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }));
  app.use(express.json({ limit: '1mb' }));

  // ─── Dashboard ──────────────────────────────────────────

  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getDashboardHTML(fullConfig.port));
  });

  // ─── Health ─────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: APP_VERSION, spec: SPEC_VERSION });
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

  // ─── Approve Entry ───────────────────────────────────────

  app.post('/api/entries/:id/approve', (req, res) => {
    try {
      const entry = clawck.approve(req.params.id);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Pending Edits ─────────────────────────────────────

  app.get('/api/edits', (_req, res) => {
    const edits = clawck.getPendingEdits();
    res.json(edits);
  });

  app.post('/api/entries/:id/pending-edit', (req, res) => {
    try {
      const entry = clawck.get(req.params.id);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      const pendingEdit = {
        changes: req.body.changes || {},
        requested_by: req.body.requested_by || 'api',
        requested_at: new Date().toISOString(),
        reason: req.body.reason,
      };
      const updated = clawck.setPendingEdit(req.params.id, pendingEdit);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/edits/:id/approve', (req, res) => {
    try {
      const entry = clawck.approvePendingEdit(req.params.id);
      if (!entry) return res.status(404).json({ error: 'Entry not found or no pending edit' });
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/edits/:id/reject', (req, res) => {
    try {
      const entry = clawck.rejectPendingEdit(req.params.id);
      if (!entry) return res.status(404).json({ error: 'Entry not found or no pending edit' });
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Channel Mappings ──────────────────────────────────

  app.get('/api/channels', (_req, res) => {
    res.json(clawck.getChannelMappings());
  });

  app.get('/api/channels/:id', (req, res) => {
    let mapping = clawck.getChannelMapping(req.params.id);
    if (!mapping) {
      mapping = clawck.getChannelMappingByChannelId(req.params.id);
    }
    if (!mapping) return res.status(404).json({ error: 'Channel mapping not found' });
    res.json(mapping);
  });

  app.post('/api/channels', (req, res) => {
    try {
      const existing = clawck.getChannelMappingByChannelId(req.body.channel_id);
      if (existing) {
        return res.status(409).json({ error: 'Channel mapping already exists', existing });
      }
      const mapping = clawck.addChannelMapping({
        channel_id: req.body.channel_id,
        channel_name: req.body.channel_name || '',
        project: req.body.project,
        client: req.body.client,
        default_category: req.body.default_category,
      });
      res.status(201).json(mapping);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/channels/:id', (req, res) => {
    try {
      let mapping = clawck.getChannelMapping(req.params.id);
      if (!mapping) {
        mapping = clawck.getChannelMappingByChannelId(req.params.id);
      }
      if (!mapping) return res.status(404).json({ error: 'Channel mapping not found' });
      const updated = clawck.updateChannelMapping(mapping.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/channels/:id', (req, res) => {
    try {
      let mapping = clawck.getChannelMapping(req.params.id);
      if (!mapping) {
        mapping = clawck.getChannelMappingByChannelId(req.params.id);
      }
      if (!mapping) return res.status(404).json({ error: 'Channel mapping not found' });
      clawck.deleteChannelMapping(mapping.id);
      res.json({ ok: true, deleted: mapping });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
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
      limit: req.query.limit ? safeInt(req.query.limit as string, 500) : undefined,
    });
    res.json(entries);
  });

  // ─── Running Entries ───────────────────────────────────

  app.get('/api/running', (_req, res) => {
    res.json(clawck.running());
  });

  // ─── Active Agent Status ────────────────────────────────

  app.get('/api/agents/status', (_req, res) => {
    const running = clawck.running();
    const agents = running.map(e => ({
      agent: e.agent,
      model: e.model,
      task: e.task,
      project: e.project,
      client: e.client,
      start: e.start,
      runtime_ms: Date.now() - new Date(e.start).getTime(),
      runtime_minutes: Math.round((Date.now() - new Date(e.start).getTime()) / 60000),
      entry_id: e.id,
    }));
    res.json({
      active_count: agents.length,
      agents,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Productivity Score ─────────────────────────────────

  app.get('/api/score', (req, res) => {
    const days = safeInt(req.query.days as string, 7);
    const weekly = req.query.weekly === 'true';
    const availableHours = safeInt(req.query.available_hours as string, 8);
    const score = clawck.score({ days, weekly, available_hours_per_day: availableHours });
    res.json(score);
  });

  // ─── Category Trends ─────────────────────────────────────

  app.get('/api/trends', (req, res) => {
    const weeks = safeInt(req.query.weeks as string, 4);
    const trends = clawck.trends({ weeks });
    res.json(trends);
  });

  // ─── Digest ──────────────────────────────────────────────

  app.get('/api/digest', (req, res) => {
    const period = (req.query.period as 'day' | 'week') || 'day';
    const date = req.query.date as string | undefined;
    const digest = clawck.digest({ period, date });
    res.json(digest);
  });

  // ─── Share Card ─────────────────────────────────────────

  app.get('/api/share', async (req, res) => {
    const { generateDigestCard, generateTimesheetCard } = await import('../reports/share-card');

    const type = (req.query.type as string) || 'digest';
    const theme = (req.query.theme as 'light' | 'dark' | 'gradient') || 'gradient';
    const title = req.query.title as string | undefined;
    const branding = req.query.branding !== 'false';

    const cardOpts = { title, theme, branding };

    let card;
    if (type === 'timesheet') {
      const days = safeInt(req.query.days as string, 7);
      const to = new Date().toISOString();
      const from = new Date(Date.now() - days * 86400000).toISOString();
      const summary = clawck.timesheet(from, to);
      card = generateTimesheetCard(summary, cardOpts);
    } else {
      const period = (req.query.period as 'day' | 'week') || 'day';
      const date = req.query.date as string | undefined;
      const digest = clawck.digest({ period, date });
      card = generateDigestCard(digest, cardOpts);
    }

    // Return HTML or JSON metadata based on Accept header
    if (req.accepts('html')) {
      res.setHeader('Content-Type', 'text/html');
      res.send(card.html);
    } else {
      res.json({
        width: card.width,
        height: card.height,
        title: card.title,
        description: card.description,
        html: card.html,
      });
    }
  });

  // ─── Timesheet ─────────────────────────────────────────

  app.get('/api/timesheet', (req, res) => {
    const now = new Date();
    const days = safeInt(req.query.days as string, 7);
    const defaultFrom = new Date(now.getTime() - days * 24 * 3600000);
    const from = (req.query.from as string) || defaultFrom.toISOString();
    const to = (req.query.to as string) || now.toISOString();

    const timesheet = clawck.timesheet(from, to, {
      client: req.query.client as string,
      project: req.query.project as string,
      agent: req.query.agent as string,
    });

    // Apply redaction if requested
    const redact = req.query.redact === 'true';
    const summaryOnly = req.query.summary_only === 'true';

    if (redact) {
      for (const entry of timesheet.entries) {
        entry.task = `${entry.category} task`;
      }
    }

    if (summaryOnly) {
      res.json({
        period_start: timesheet.period_start,
        period_end: timesheet.period_end,
        total_entries: timesheet.total_entries,
        total_agent_hours: timesheet.total_agent_hours,
        total_human_equiv_hours: timesheet.total_human_equiv_hours,
        total_cost_usd: timesheet.total_cost_usd,
        total_savings_usd: timesheet.total_savings_usd,
        by_project: timesheet.by_project,
        by_category: timesheet.by_category,
        by_client: timesheet.by_client,
      });
    } else {
      res.json(timesheet);
    }
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
      const errors: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        const raw = entries[i];
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
        } catch (err: any) {
          errors.push(`entry[${i}]: ${err.message || String(err)}`);
        }
      }
      res.json({ ingested, total: entries.length, ...(errors.length > 0 ? { errors } : {}) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Personal Baselines ────────────────────────────────

  app.get('/api/baselines', (_req, res) => {
    res.json(clawck.getBaselines());
  });

  app.post('/api/baselines', (req, res) => {
    try {
      const { category, task_type, description, my_minutes } = req.body;
      if (!category || !task_type || my_minutes === undefined) {
        return res.status(400).json({ error: 'category, task_type, and my_minutes are required' });
      }
      const baseline = clawck.addBaseline({ category, task_type, description, my_minutes });
      res.status(201).json(baseline);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/baselines/:id', (req, res) => {
    const deleted = clawck.removeBaseline(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Baseline not found' });
    res.json({ ok: true });
  });

  // ─── Compare ──────────────────────────────────────────

  app.get('/api/compare/:entryId', (req, res) => {
    const result = clawck.compareEntryById(req.params.entryId);
    if (!result) return res.status(404).json({ error: 'Entry not found' });
    res.json(result);
  });

  // ─── ATP Export/Import ────────────────────────────────

  app.get('/api/export/atp', (req, res) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
    const from = (req.query.from as string) || weekAgo.toISOString();
    const to = (req.query.to as string) || now.toISOString();
    const entries = clawck.query({ from, to, limit: 10000 });
    const baselines = clawck.getBaselines();
    const envelope = exportATP(entries, INDUSTRY_BENCHMARKS, baselines);
    res.json(envelope);
  });

  app.post('/api/import/atp', (req, res) => {
    try {
      const entries = importATP(req.body);
      let ingested = 0;
      const errors: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        try {
          clawck.upsert(entries[i]);
          ingested++;
        } catch (err: any) {
          errors.push(`entry[${i}]: ${err.message || String(err)}`);
        }
      }
      res.json({ ingested, total: entries.length, ...(errors.length > 0 ? { errors } : {}) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Reports ───────────────────────────────────────────

  app.post('/api/reports/generate', async (req, res) => {
    try {
      const { period, from, to, days, style = 'full', format = 'terminal', filters = {}, name, save } = req.body;
      const resolved = resolvePeriod({ period, from, to, days });
      const ts = clawck.timesheet(resolved.from, resolved.to, filters);
      const dateRange = `${resolved.from.split('T')[0]} to ${resolved.to.split('T')[0]}`;

      let content: string;
      if (format === 'html') {
        const rawEntries = clawck.query({ ...filters, from: resolved.from, to: resolved.to, limit: 10000 });
        content = generateTimesheetHTML(ts, { dateRange, clientName: filters.client, rawEntries, style });
      } else if (format === 'pdf') {
        const tmpPath = path.join(os.tmpdir(), `clawck-report-${Date.now()}.pdf`);
        await generateTimesheetPDF(ts, { dateRange, clientName: filters.client, outputPath: tmpPath, style });
        const pdfBuf = fs.readFileSync(tmpPath);
        fs.unlinkSync(tmpPath);
        if (!save) {
          res.setHeader('Content-Type', 'application/pdf');
          res.send(pdfBuf);
          return;
        }
        content = pdfBuf.toString('base64');
      } else {
        content = JSON.stringify(ts);
      }

      const metadata = {
        filters,
        total_entries: ts.total_entries,
        total_agent_hours: ts.total_agent_hours,
        total_cost_usd: ts.total_cost_usd,
        total_savings_usd: ts.total_savings_usd,
      };

      if (save) {
        const saved = clawck.saveReport({
          name: name || `Report ${new Date().toISOString().split('T')[0]}`,
          period: resolved.period,
          period_start: resolved.from,
          period_end: resolved.to,
          style,
          format,
          content,
          metadata,
        });
        res.json({ id: saved.id, content, metadata });
      } else {
        res.json({ content, metadata });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/reports', (req, res) => {
    const limit = safeInt(req.query.limit as string, 50);
    const offset = safeInt(req.query.offset as string, 0);
    res.json(clawck.listReports(limit, offset));
  });

  app.get('/api/reports/:id', (req, res) => {
    const report = clawck.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  });

  app.delete('/api/reports/:id', (req, res) => {
    const deleted = clawck.deleteReport(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Report not found' });
    res.json({ ok: true });
  });

  // ─── Sync Status ──────────────────────────────────────

  // Start idle monitor if webhooks configured
  if (fullConfig.webhooks && fullConfig.webhooks.length > 0) {
    clawck.webhooks.startIdleMonitor(clawck.database);
  }

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

  // ─── Error Handler ──────────────────────────────────────
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof ClawckError) {
      res.status(err.status).json({ error: err.message, code: err.code });
    } else if (err.status || err.statusCode) {
      // Express built-in errors (e.g., PayloadTooLargeError)
      const status = err.status || err.statusCode;
      res.status(status).json({ error: err.message });
    } else {
      logger.error('api', 'Unhandled error', { error: err.message || String(err) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return { app, clawck, syncManager: syncManager ?? undefined };
}

export async function startServer(config: Partial<ClawckConfig> = {}): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const { app } = await createServer(fullConfig);
  const port = fullConfig.port;

  app.listen(port, () => {
    logger.info('api', `Clawck is running on port ${port}`, {
      dashboard: `http://localhost:${port}`,
      api: `http://localhost:${port}/api`,
      data_dir: fullConfig.data_dir,
      spec: SPEC_VERSION,
    });
  });
}
