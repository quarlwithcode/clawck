import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig, makeEntry } from './helpers';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

describe('Time tracking accuracy', () => {
  it('by_client agent_hours are rounded to 2 decimals', async () => {
    const c = await setup();
    // Create entries that would produce floating point accumulation
    for (let i = 0; i < 7; i++) {
      c.upsert(makeEntry({
        id: `round-c-${i}`,
        client: 'rounding-client',
        start: `2026-03-07T${10 + i}:00:00.000Z`,
        end: `2026-03-07T${10 + i}:17:00.000Z`, // 17 minutes = 0.2833... hours
        category: 'code',
      }));
    }
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    for (const cl of ts.by_client) {
      const str = cl.agent_hours.toString();
      const decimals = str.includes('.') ? str.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });

  it('by_project agent_hours are rounded to 2 decimals', async () => {
    const c = await setup();
    for (let i = 0; i < 5; i++) {
      c.upsert(makeEntry({
        id: `round-p-${i}`,
        project: 'rounding-proj',
        start: `2026-03-07T${10 + i}:00:00.000Z`,
        end: `2026-03-07T${10 + i}:07:00.000Z`, // 7 minutes
        category: 'code',
      }));
    }
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    for (const p of ts.by_project) {
      const str = p.agent_hours.toString();
      const decimals = str.includes('.') ? str.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });

  it('by_category agent_hours are rounded to 2 decimals', async () => {
    const c = await setup();
    for (let i = 0; i < 3; i++) {
      c.upsert(makeEntry({
        id: `round-cat-${i}`,
        category: 'research',
        start: `2026-03-07T${10 + i}:00:00.000Z`,
        end: `2026-03-07T${10 + i}:13:00.000Z`, // 13 minutes
      }));
    }
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    for (const cat of ts.by_category) {
      const str = cat.agent_hours.toString();
      const decimals = str.includes('.') ? str.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });

  it('by_agent agent_hours are rounded to 2 decimals', async () => {
    const c = await setup();
    for (let i = 0; i < 4; i++) {
      c.upsert(makeEntry({
        id: `round-a-${i}`,
        agent: 'rounding-agent',
        start: `2026-03-07T${10 + i}:00:00.000Z`,
        end: `2026-03-07T${10 + i}:11:00.000Z`, // 11 minutes
      }));
    }
    const ts = c.timesheet('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z');
    for (const a of ts.by_agent) {
      const str = a.agent_hours.toString();
      const decimals = str.includes('.') ? str.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});
