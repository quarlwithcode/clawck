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

// ─── Audit on Create ─────────────────────────────────────

describe('Audit Trail: Create', () => {
  it('logs audit entry when task is created via log()', async () => {
    const c = await setup();
    const entry = c.log({ task: 'Test task', duration_minutes: 30, agent: 'test-agent' });

    const audits = c.database.getAuditByEntryId(entry.id);
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe('create');
    expect(audits[0].entry_id).toBe(entry.id);
    expect(audits[0].actor).toBe('system');
  });

  it('logs audit entry when task is started via start()', async () => {
    const c = await setup();
    const entry = c.start({ task: 'Running task', agent: 'agent-1' });

    const audits = c.database.getAuditByEntryId(entry.id);
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe('create');
  });
});

// ─── Audit on Update ─────────────────────────────────────

describe('Audit Trail: Update', () => {
  it('logs audit entry when task is stopped', async () => {
    const c = await setup();
    const entry = c.start({ task: 'Task to stop', agent: 'agent-1' });
    c.stop({ id: entry.id, summary: 'Completed' });

    const audits = c.database.getAuditByEntryId(entry.id);
    // Should have create + update
    expect(audits.length).toBe(2);
    const updateAudit = audits.find(a => a.action === 'update');
    expect(updateAudit).toBeTruthy();
    expect(updateAudit?.field).toContain('status');
  });

  it('logs audit entry when task is updated', async () => {
    const c = await setup();
    const entry = c.log({ task: 'Original task', duration_minutes: 30, project: 'proj1' });
    c.update(entry.id, { project: 'proj2', task: 'Updated task' });

    const audits = c.database.getAuditByEntryId(entry.id);
    expect(audits.length).toBe(2);
    const updateAudit = audits.find(a => a.action === 'update');
    expect(updateAudit).toBeTruthy();
    expect(updateAudit?.field).toContain('project');
    expect(updateAudit?.field).toContain('task');
  });

  it('records old and new values', async () => {
    const c = await setup();
    const entry = c.log({ task: 'Task', duration_minutes: 30, project: 'old-project' });
    c.update(entry.id, { project: 'new-project' });

    const audits = c.database.getAuditByEntryId(entry.id);
    const updateAudit = audits.find(a => a.action === 'update');
    expect(updateAudit?.old_value).toContain('old-project');
    expect(updateAudit?.new_value).toContain('new-project');
  });
});

// ─── Audit on Delete ─────────────────────────────────────

describe('Audit Trail: Delete', () => {
  it('logs audit entry when task is deleted', async () => {
    const c = await setup();
    const entry = c.log({ task: 'Task to delete', duration_minutes: 30 });
    const entryId = entry.id;
    c.delete(entryId);

    // Audit log should still exist even after entry is deleted
    const audits = c.database.getAuditByEntryId(entryId);
    expect(audits.length).toBe(2); // create + delete
    const deleteAudit = audits.find(a => a.action === 'delete');
    expect(deleteAudit).toBeTruthy();
    expect(deleteAudit?.old_value).toContain('Task to delete');
  });
});

// ─── Audit Query Methods ─────────────────────────────────

describe('Audit Trail: Queries', () => {
  it('getRecentAudit returns recent activity', async () => {
    const c = await setup();
    c.log({ task: 'Task 1', duration_minutes: 30 });
    c.log({ task: 'Task 2', duration_minutes: 45 });
    c.log({ task: 'Task 3', duration_minutes: 60 });

    const recent = c.database.getRecentAudit(7, 100);
    expect(recent.length).toBe(3);
  });

  it('getAuditByAction filters by action type', async () => {
    const c = await setup();
    const entry1 = c.log({ task: 'Task 1', duration_minutes: 30 });
    c.log({ task: 'Task 2', duration_minutes: 45 });
    c.update(entry1.id, { task: 'Updated Task 1' });

    const creates = c.database.getAuditByAction('create');
    expect(creates.length).toBe(2);

    const updates = c.database.getAuditByAction('update');
    expect(updates.length).toBe(1);
  });
});

// ─── Pending Edit Audit ─────────────────────────────────

describe('Audit Trail: Pending Edits', () => {
  it('logs apply_edit when pending edit is approved', async () => {
    const c = await setup();
    const entry = c.log({ task: 'Original', duration_minutes: 30 });

    // Set a pending edit
    c.database.setPendingEdit(entry.id, {
      changes: { task: 'Modified' },
      requested_by: 'test-user',
      requested_at: new Date().toISOString(),
    });

    // Approve it
    c.database.approvePendingEdit(entry.id, 'approver');

    const audits = c.database.getAuditByEntryId(entry.id);
    const applyAudit = audits.find(a => a.action === 'apply_edit');
    expect(applyAudit).toBeTruthy();
    expect(applyAudit?.actor).toBe('approver');
  });

  it('logs reject_edit when pending edit is rejected', async () => {
    const c = await setup();
    const entry = c.log({ task: 'Original', duration_minutes: 30 });

    // Set a pending edit
    c.database.setPendingEdit(entry.id, {
      changes: { task: 'Modified' },
      requested_by: 'test-user',
      requested_at: new Date().toISOString(),
    });

    // Reject it
    c.database.rejectPendingEdit(entry.id, 'rejector');

    const audits = c.database.getAuditByEntryId(entry.id);
    const rejectAudit = audits.find(a => a.action === 'reject_edit');
    expect(rejectAudit).toBeTruthy();
    expect(rejectAudit?.actor).toBe('rejector');
  });
});
