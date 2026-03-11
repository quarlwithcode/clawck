import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';
import { checkIdleAlerts, checkOverworkAlerts, checkAllAlerts, createAlertRule } from '../src/core/alerts';
import { AlertRule } from '../src/core/types';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

// ─── Alert Rule Creation ────────────────────────────────────

describe('createAlertRule', () => {
  it('creates idle rule with defaults', () => {
    const rule = createAlertRule('idle', 60);
    expect(rule.id).toBeTruthy();
    expect(rule.type).toBe('idle');
    expect(rule.threshold_minutes).toBe(60);
    expect(rule.enabled).toBe(true);
  });

  it('creates overwork rule with webhook', () => {
    const rule = createAlertRule('overwork', 480, { webhook_url: 'https://example.com/webhook' });
    expect(rule.type).toBe('overwork');
    expect(rule.threshold_minutes).toBe(480);
    expect(rule.webhook_url).toBe('https://example.com/webhook');
  });

  it('creates idle rule with custom business hours', () => {
    const rule = createAlertRule('idle', 120, {
      business_hours_start: 8,
      business_hours_end: 18,
    });
    expect(rule.business_hours_start).toBe(8);
    expect(rule.business_hours_end).toBe(18);
  });
});

// ─── Idle Alert Detection ────────────────────────────────────

describe('checkIdleAlerts', () => {
  it('triggers when no entries exist during business hours', async () => {
    const c = await setup();
    const rules: AlertRule[] = [
      { id: 'rule-1', type: 'idle', threshold_minutes: 60, enabled: true },
    ];

    // Test during business hours (10 AM)
    const businessHour = new Date();
    businessHour.setHours(10, 0, 0, 0);

    const alerts = checkIdleAlerts(rules, c.database, businessHour);
    expect(alerts.length).toBe(1);
    expect(alerts[0].alert_type).toBe('idle');
  });

  it('does not trigger outside business hours', async () => {
    const c = await setup();
    const rules: AlertRule[] = [
      { id: 'rule-1', type: 'idle', threshold_minutes: 60, enabled: true },
    ];

    // Test outside business hours (11 PM)
    const nightTime = new Date();
    nightTime.setHours(23, 0, 0, 0);

    const alerts = checkIdleAlerts(rules, c.database, nightTime);
    expect(alerts.length).toBe(0);
  });

  it('does not trigger when recent activity exists', async () => {
    const c = await setup();
    // Log an entry that just completed
    c.log({ task: 'recent work', duration_minutes: 30 });

    const rules: AlertRule[] = [
      { id: 'rule-1', type: 'idle', threshold_minutes: 60, enabled: true },
    ];

    const businessHour = new Date();
    businessHour.setHours(10, 0, 0, 0);

    const alerts = checkIdleAlerts(rules, c.database, businessHour);
    expect(alerts.length).toBe(0);
  });
});

// ─── Overwork Alert Detection ────────────────────────────────

describe('checkOverworkAlerts', () => {
  it('triggers when agent runtime exceeds threshold', async () => {
    const c = await setup();
    // Start a task 3 hours ago
    const entry = c.start({ task: 'long running task', agent: 'test-agent' });

    // Simulate 3 hours of runtime by adjusting the start time
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    c.update(entry.id, { start: threeHoursAgo.toISOString() } as any);

    const rules: AlertRule[] = [
      { id: 'rule-1', type: 'overwork', threshold_minutes: 120, enabled: true }, // 2 hour threshold
    ];

    const alerts = checkOverworkAlerts(rules, c.database);
    expect(alerts.length).toBe(1);
    expect(alerts[0].alert_type).toBe('overwork');
    expect(alerts[0].agent).toBe('test-agent');
    expect(alerts[0].actual_value).toBeGreaterThan(120);
  });

  it('does not trigger when below threshold', async () => {
    const c = await setup();
    c.start({ task: 'short task', agent: 'test-agent' });

    const rules: AlertRule[] = [
      { id: 'rule-1', type: 'overwork', threshold_minutes: 120, enabled: true },
    ];

    const alerts = checkOverworkAlerts(rules, c.database);
    expect(alerts.length).toBe(0);
  });

  it('does not trigger for completed tasks', async () => {
    const c = await setup();
    const entry = c.start({ task: 'completed task', agent: 'test-agent' });
    c.stop({ id: entry.id });

    const rules: AlertRule[] = [
      { id: 'rule-1', type: 'overwork', threshold_minutes: 1, enabled: true },
    ];

    const alerts = checkOverworkAlerts(rules, c.database);
    expect(alerts.length).toBe(0);
  });
});

// ─── Combined Alert Check ────────────────────────────────────

describe('checkAllAlerts', () => {
  it('checks both idle and overwork rules', async () => {
    const c = await setup();
    // Start a long-running task
    const entry = c.start({ task: 'marathon task', agent: 'bot-1' });
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    c.update(entry.id, { start: fourHoursAgo.toISOString() } as any);

    const rules: AlertRule[] = [
      { id: 'idle-rule', type: 'idle', threshold_minutes: 60, enabled: true },
      { id: 'overwork-rule', type: 'overwork', threshold_minutes: 180, enabled: true },
    ];

    const businessHour = new Date();
    businessHour.setHours(10, 0, 0, 0);

    const alerts = checkAllAlerts(rules, c.database, businessHour);
    // Should have overwork alert but not idle (since task is running)
    expect(alerts.some(a => a.alert_type === 'overwork')).toBe(true);
  });

  it('respects disabled rules', async () => {
    const c = await setup();

    const rules: AlertRule[] = [
      { id: 'rule-1', type: 'idle', threshold_minutes: 60, enabled: false },
    ];

    const businessHour = new Date();
    businessHour.setHours(10, 0, 0, 0);

    const alerts = checkAllAlerts(rules, c.database, businessHour);
    expect(alerts.length).toBe(0);
  });
});
