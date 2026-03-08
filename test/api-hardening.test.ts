import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server/api';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';

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

describe('API hardening', () => {
  describe('query param safety', () => {
    it('malformed limit defaults to sane value', async () => {
      await setup();
      const res = await request(app).get('/api/entries?limit=abc').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('negative limit defaults to sane value', async () => {
      await setup();
      const res = await request(app).get('/api/entries?limit=-5').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('malformed report limit/offset are handled', async () => {
      await setup();
      const res = await request(app).get('/api/reports?limit=abc&offset=xyz').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('body size limit', () => {
    it('rejects oversized payloads', async () => {
      await setup();
      const bigBody = { task: 'x'.repeat(2 * 1024 * 1024) };
      const res = await request(app)
        .post('/api/start')
        .send(bigBody);
      expect(res.status).toBe(413);
    });
  });

  describe('error response format', () => {
    it('returns { error } for 404 on entries', async () => {
      await setup();
      const res = await request(app).get('/api/entries/nonexistent').expect(404);
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error).toBe('string');
    });

    it('returns { error } for 404 on reports', async () => {
      await setup();
      const res = await request(app).get('/api/reports/nonexistent').expect(404);
      expect(res.body).toHaveProperty('error');
    });

    it('returns { error } for 404 on baselines', async () => {
      await setup();
      const res = await request(app).delete('/api/baselines/nonexistent').expect(404);
      expect(res.body).toHaveProperty('error');
    });

    it('returns { error } for bad start body', async () => {
      await setup();
      const res = await request(app)
        .post('/api/start')
        .send({})
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('ingest error reporting', () => {
    it('reports errors for bad entries in ingest', async () => {
      await setup();
      const res = await request(app)
        .post('/api/ingest')
        .send([
          { id: 'good-1', task: 'test', start: new Date().toISOString(), agent: 'a', model: 'm' },
          { bad: true },
        ]);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
    });
  });

  describe('config validation', () => {
    it('rejects invalid port in server config', async () => {
      await expect(createServer({ port: -1 } as any)).rejects.toThrow('Invalid config');
    });
  });
});
