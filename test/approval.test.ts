import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

describe('Approval workflow', () => {
  it('new entries default to approved=false', async () => {
    const c = await setup();
    const entry = c.start({ task: 'test' });
    expect(entry.approved).toBe(false);
    const fetched = c.get(entry.id);
    expect(fetched!.approved).toBe(false);
  });

  it('approve() sets approved=true', async () => {
    const c = await setup();
    const entry = c.start({ task: 'to approve' });
    const approved = c.approve(entry.id);
    expect(approved).not.toBeNull();
    expect(approved!.approved).toBe(true);
  });

  it('approved field roundtrips through DB', async () => {
    const c = await setup();
    const entry = c.log({ task: 'roundtrip', duration_minutes: 5 });
    expect(c.get(entry.id)!.approved).toBe(false);
    c.approve(entry.id);
    expect(c.get(entry.id)!.approved).toBe(true);
  });

  it('approve returns null for nonexistent id', async () => {
    const c = await setup();
    expect(c.approve('no-such-id')).toBeNull();
  });

  it('query filters by approved=true', async () => {
    const c = await setup();
    const e1 = c.log({ task: 'approved', duration_minutes: 5 });
    c.log({ task: 'unapproved', duration_minutes: 5 });
    c.approve(e1.id);

    const approved = c.query({ approved: true });
    expect(approved).toHaveLength(1);
    expect(approved[0].task).toBe('approved');
  });

  it('query filters by approved=false', async () => {
    const c = await setup();
    const e1 = c.log({ task: 'approved', duration_minutes: 5 });
    c.log({ task: 'unapproved', duration_minutes: 5 });
    c.approve(e1.id);

    const unapproved = c.query({ approved: false });
    expect(unapproved).toHaveLength(1);
    expect(unapproved[0].task).toBe('unapproved');
  });

  it('logged entries default to approved=false', async () => {
    const c = await setup();
    const entry = c.log({ task: 'logged', duration_minutes: 10 });
    expect(entry.approved).toBe(false);
  });
});
