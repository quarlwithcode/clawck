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
  // Seed some entries
  clawck.upsert(makeEntry({ start: '2026-03-07T10:00:00.000Z', end: '2026-03-07T11:00:00.000Z' }));
  return { app, clawck };
}

afterEach(() => {
  try { clawck?.close(); } catch {}
});

describe('Report API', () => {
  it('POST /api/reports/generate returns content', async () => {
    await setup();
    const res = await request(app)
      .post('/api/reports/generate')
      .send({ period: 'week', style: 'short', format: 'terminal' })
      .expect(200);
    expect(res.body.content).toBeTruthy();
    expect(res.body.metadata).toBeTruthy();
    expect(res.body.metadata.total_entries).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/reports/generate with save persists', async () => {
    await setup();
    const res = await request(app)
      .post('/api/reports/generate')
      .send({ period: 'week', style: 'full', format: 'html', save: true, name: 'Test saved' })
      .expect(200);
    expect(res.body.id).toBeTruthy();
    expect(res.body.content).toContain('<!DOCTYPE html>');

    // Verify persisted
    const listRes = await request(app).get('/api/reports').expect(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].name).toBe('Test saved');
  });

  it('GET /api/reports lists saved reports', async () => {
    await setup();
    // Save two reports
    await request(app).post('/api/reports/generate').send({ period: 'day', format: 'terminal', save: true, name: 'R1' });
    await request(app).post('/api/reports/generate').send({ period: 'week', format: 'terminal', save: true, name: 'R2' });

    const res = await request(app).get('/api/reports').expect(200);
    expect(res.body.length).toBe(2);
  });

  it('GET /api/reports/:id retrieves with content', async () => {
    await setup();
    const genRes = await request(app)
      .post('/api/reports/generate')
      .send({ period: 'week', format: 'html', save: true, name: 'Retrieve me' });
    const id = genRes.body.id;

    const res = await request(app).get(`/api/reports/${id}`).expect(200);
    expect(res.body.name).toBe('Retrieve me');
    expect(res.body.content).toContain('<!DOCTYPE html>');
  });

  it('DELETE /api/reports/:id removes report', async () => {
    await setup();
    const genRes = await request(app)
      .post('/api/reports/generate')
      .send({ period: 'day', format: 'terminal', save: true });
    const id = genRes.body.id;

    await request(app).delete(`/api/reports/${id}`).expect(200);

    const listRes = await request(app).get('/api/reports').expect(200);
    expect(listRes.body.length).toBe(0);
  });

  it('period presets work through API', async () => {
    await setup();
    for (const period of ['day', 'week', 'month', 'year']) {
      const res = await request(app)
        .post('/api/reports/generate')
        .send({ period, format: 'terminal' })
        .expect(200);
      expect(res.body.metadata).toBeTruthy();
    }
  });
});
