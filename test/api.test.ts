import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server/api';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig, makeEntry } from './helpers';

let clawck: Clawck;
let app: any;

async function setup() {
  const result = await createServer(makeTmpConfig());
  app = result.app;
  clawck = result.clawck;
  return { app, clawck };
}

afterEach(() => {
  try { clawck?.close(); } catch {}
});

// ─── Health ───────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns ok status with version and spec', async () => {
    await setup();
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBeTruthy();
    expect(res.body.spec).toBeTruthy();
  });
});

// ─── Start + Stop Lifecycle ──────────────────────────────

describe('POST /api/start + POST /api/stop lifecycle', () => {
  it('start returns 201 with running entry', async () => {
    await setup();
    const res = await request(app)
      .post('/api/start')
      .send({ task: 'api task' })
      .expect(201);
    expect(res.body.status).toBe('running');
    expect(res.body.id).toBeTruthy();
    expect(res.body.end).toBeNull();
  });

  it('stop returns 200 with completed entry', async () => {
    await setup();
    const started = await request(app).post('/api/start').send({ task: 'to stop' });
    const res = await request(app)
      .post('/api/stop')
      .send({ id: started.body.id, summary: 'stopped' })
      .expect(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.end).toBeTruthy();
    expect(res.body.summary).toBe('stopped');
  });

  it('stop returns 404 for unknown id', async () => {
    await setup();
    await request(app)
      .post('/api/stop')
      .send({ id: 'nonexistent' })
      .expect(404);
  });
});

// ─── Log ──────────────────────────────────────────────────

describe('POST /api/log', () => {
  it('returns 201 with completed entry', async () => {
    await setup();
    const res = await request(app)
      .post('/api/log')
      .send({ task: 'retroactive', duration_minutes: 30 })
      .expect(201);
    expect(res.body.status).toBe('completed');
    expect(res.body.end).toBeTruthy();
  });
});

// ─── Get Entry ────────────────────────────────────────────

describe('GET /api/entries/:id', () => {
  it('returns entry by id', async () => {
    await setup();
    const created = await request(app).post('/api/start').send({ task: 'get me' });
    const res = await request(app)
      .get(`/api/entries/${created.body.id}`)
      .expect(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('returns 404 for missing', async () => {
    await setup();
    await request(app).get('/api/entries/no-such-id').expect(404);
  });
});

// ─── Update Entry ─────────────────────────────────────────

describe('PATCH /api/entries/:id', () => {
  it('updates entry fields', async () => {
    await setup();
    const created = await request(app).post('/api/start').send({ task: 'to update' });
    const res = await request(app)
      .patch(`/api/entries/${created.body.id}`)
      .send({ summary: 'patched' })
      .expect(200);
    expect(res.body.summary).toBe('patched');
    expect(res.body.task).toBe('to update');
  });

  it('returns 404 for missing', async () => {
    await setup();
    await request(app)
      .patch('/api/entries/no-such-id')
      .send({ summary: 'nope' })
      .expect(404);
  });
});

// ─── Query Entries ────────────────────────────────────────

describe('GET /api/entries', () => {
  it('returns all entries, filters by client/status/limit', async () => {
    await setup();
    await request(app).post('/api/log').send({ task: 't1', duration_minutes: 1, client: 'acme' });
    await request(app).post('/api/log').send({ task: 't2', duration_minutes: 1, client: 'globex' });
    await request(app).post('/api/start').send({ task: 't3' });

    const all = await request(app).get('/api/entries').expect(200);
    expect(all.body.length).toBe(3);

    const filtered = await request(app).get('/api/entries?client=acme').expect(200);
    expect(filtered.body.length).toBe(1);

    const running = await request(app).get('/api/entries?status=running').expect(200);
    expect(running.body.length).toBe(1);

    const limited = await request(app).get('/api/entries?limit=1').expect(200);
    expect(limited.body.length).toBe(1);
  });
});

// ─── Running ──────────────────────────────────────────────

describe('GET /api/running', () => {
  it('returns only running entries', async () => {
    await setup();
    await request(app).post('/api/start').send({ task: 'r1' });
    await request(app).post('/api/log').send({ task: 'done', duration_minutes: 1 });
    const res = await request(app).get('/api/running').expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe('running');
  });
});

// ─── Stats ────────────────────────────────────────────────

describe('GET /api/stats', () => {
  it('returns aggregate statistics', async () => {
    await setup();
    await request(app).post('/api/start').send({ task: 's1' });
    await request(app).post('/api/log').send({ task: 's2', duration_minutes: 1 });
    const res = await request(app).get('/api/stats').expect(200);
    expect(res.body.total_entries).toBe(2);
    expect(res.body.running).toBe(1);
  });
});

// ─── Timesheet ────────────────────────────────────────────

describe('GET /api/timesheet', () => {
  it('returns timesheet with default range, accepts query params', async () => {
    await setup();
    await request(app).post('/api/log').send({ task: 'ts1', duration_minutes: 60, client: 'acme' });
    const res = await request(app).get('/api/timesheet').expect(200);
    expect(res.body.total_entries).toBeGreaterThanOrEqual(1);
    expect(res.body.entries).toBeDefined();
    expect(res.body.by_client).toBeDefined();

    const filtered = await request(app).get('/api/timesheet?client=acme').expect(200);
    expect(filtered.body.total_entries).toBe(1);
  });
});

// ─── Metadata Endpoints ──────────────────────────────────

describe('GET /api/clients, /api/projects, /api/agents', () => {
  it('returns distinct metadata values', async () => {
    await setup();
    await request(app).post('/api/log').send({ task: 't', duration_minutes: 1, client: 'acme', project: 'alpha', agent: 'bot-1' });
    await request(app).post('/api/log').send({ task: 't', duration_minutes: 1, client: 'globex', project: 'beta', agent: 'bot-2' });

    const clients = await request(app).get('/api/clients').expect(200);
    expect(clients.body).toContain('acme');
    expect(clients.body).toContain('globex');

    const projects = await request(app).get('/api/projects').expect(200);
    expect(projects.body).toContain('alpha');
    expect(projects.body).toContain('beta');

    const agents = await request(app).get('/api/agents').expect(200);
    expect(agents.body).toContain('bot-1');
    expect(agents.body).toContain('bot-2');
  });
});

// ─── Ingest ───────────────────────────────────────────────

describe('POST /api/ingest', () => {
  it('ingests array of entries, handles upsert', async () => {
    await setup();
    const entries = [makeEntry({ id: 'ingest-1' }), makeEntry({ id: 'ingest-2' })];
    const res = await request(app)
      .post('/api/ingest')
      .send(entries)
      .expect(200);
    expect(res.body.ingested).toBe(2);
    expect(res.body.total).toBe(2);

    // Verify they exist
    await request(app).get('/api/entries/ingest-1').expect(200);
    await request(app).get('/api/entries/ingest-2').expect(200);

    // Upsert same id with changed summary
    const updated = [makeEntry({ id: 'ingest-1', summary: 'updated via ingest' })];
    await request(app).post('/api/ingest').send(updated).expect(200);
    const fetched = await request(app).get('/api/entries/ingest-1').expect(200);
    expect(fetched.body.summary).toBe('updated via ingest');
  });
});

// ─── Full Workflow ────────────────────────────────────────

describe('Full workflow: start -> update -> stop -> verify', () => {
  it('multi-step integration test through HTTP', async () => {
    await setup();

    // Start
    const started = await request(app)
      .post('/api/start')
      .send({ task: 'integration test', client: 'test-co', project: 'proj-1' })
      .expect(201);
    expect(started.body.status).toBe('running');

    // Update
    const patched = await request(app)
      .patch(`/api/entries/${started.body.id}`)
      .send({ tags: ['important'] })
      .expect(200);
    expect(patched.body.tags).toEqual(['important']);

    // Stop
    const stopped = await request(app)
      .post('/api/stop')
      .send({ id: started.body.id, summary: 'all done', tokens_in: 100, tokens_out: 200, cost_usd: 0.02 })
      .expect(200);
    expect(stopped.body.status).toBe('completed');
    expect(stopped.body.end).toBeTruthy();

    // Verify via GET
    const fetched = await request(app)
      .get(`/api/entries/${started.body.id}`)
      .expect(200);
    expect(fetched.body.summary).toBe('all done');
    expect(fetched.body.tags).toEqual(['important']);
    expect(fetched.body.client).toBe('test-co');
  });
});

// ─── Sync Endpoints ──────────────────────────────────────

describe('Sync endpoints', () => {
  it('GET /api/sync/status returns disabled when no remote sources', async () => {
    await setup();
    const res = await request(app).get('/api/sync/status').expect(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.states).toEqual([]);
  });

  it('POST /api/sync/trigger returns error when not configured', async () => {
    await setup();
    await request(app).post('/api/sync/trigger').expect(400);
  });
});

// ─── Dashboard ────────────────────────────────────────────

describe('GET / (dashboard)', () => {
  it('returns HTML content', async () => {
    await setup();
    const res = await request(app).get('/').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<');
  });
});
