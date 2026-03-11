/**
 * ⏱️🦀 Clawck — Idle & Overwork Alerts
 * Monitor agent activity and fire alerts when thresholds are exceeded.
 */

import { v4 as uuid } from 'uuid';
import { AlertRule, AlertType, TriggeredAlert, ClawckEntry } from './types';
import { ClawckDB } from './database';

/**
 * Check for idle alerts: no entries logged for > threshold_minutes during business hours.
 */
export function checkIdleAlerts(
  rules: AlertRule[],
  db: ClawckDB,
  now: Date = new Date()
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];
  const idleRules = rules.filter(r => r.type === 'idle' && r.enabled !== false);

  for (const rule of idleRules) {
    // Check if we're within business hours
    const hour = now.getHours();
    const startHour = rule.business_hours_start ?? 9;
    const endHour = rule.business_hours_end ?? 17;

    if (hour < startHour || hour >= endHour) {
      continue; // Outside business hours, skip
    }

    // Get most recent entry
    const recentEntries = db.query({ limit: 1 });
    if (recentEntries.length === 0) {
      // No entries at all - fire idle alert
      triggered.push({
        alert_type: 'idle',
        threshold: rule.threshold_minutes,
        actual_value: Infinity,
        message: `No time entries have been logged. Idle for > ${rule.threshold_minutes} minutes.`,
        timestamp: now.toISOString(),
        rule_id: rule.id,
      });
      continue;
    }

    const lastEntry = recentEntries[0];
    const lastActivityTime = lastEntry.end
      ? new Date(lastEntry.end).getTime()
      : new Date(lastEntry.start).getTime();
    const idleMinutes = (now.getTime() - lastActivityTime) / 60000;

    if (idleMinutes > rule.threshold_minutes) {
      triggered.push({
        alert_type: 'idle',
        threshold: rule.threshold_minutes,
        actual_value: Math.round(idleMinutes),
        message: `No activity for ${Math.round(idleMinutes)} minutes (threshold: ${rule.threshold_minutes} min).`,
        timestamp: now.toISOString(),
        rule_id: rule.id,
      });
    }
  }

  return triggered;
}

/**
 * Check for overwork alerts: agent has > threshold_minutes of continuous runtime.
 */
export function checkOverworkAlerts(
  rules: AlertRule[],
  db: ClawckDB,
  now: Date = new Date()
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];
  const overworkRules = rules.filter(r => r.type === 'overwork' && r.enabled !== false);

  for (const rule of overworkRules) {
    // Get all running entries
    const running = db.getRunning();

    for (const entry of running) {
      const runtimeMinutes = (now.getTime() - new Date(entry.start).getTime()) / 60000;

      if (runtimeMinutes > rule.threshold_minutes) {
        triggered.push({
          alert_type: 'overwork',
          agent: entry.agent,
          threshold: rule.threshold_minutes,
          actual_value: Math.round(runtimeMinutes),
          message: `Agent "${entry.agent}" has been running for ${Math.round(runtimeMinutes)} minutes (threshold: ${rule.threshold_minutes} min). Task: ${entry.task.slice(0, 50)}`,
          timestamp: now.toISOString(),
          rule_id: rule.id,
        });
      }
    }
  }

  return triggered;
}

/**
 * Check all alert rules and return triggered alerts.
 */
export function checkAllAlerts(
  rules: AlertRule[],
  db: ClawckDB,
  now: Date = new Date()
): TriggeredAlert[] {
  const idleAlerts = checkIdleAlerts(rules, db, now);
  const overworkAlerts = checkOverworkAlerts(rules, db, now);
  return [...idleAlerts, ...overworkAlerts];
}

/**
 * Fire webhook for a triggered alert.
 */
export async function fireAlertWebhook(
  alert: TriggeredAlert,
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Create a new alert rule with auto-generated ID.
 */
export function createAlertRule(
  type: AlertType,
  thresholdMinutes: number,
  options: {
    webhook_url?: string;
    channels?: string[];
    business_hours_start?: number;
    business_hours_end?: number;
  } = {}
): AlertRule {
  return {
    id: uuid(),
    type,
    threshold_minutes: thresholdMinutes,
    webhook_url: options.webhook_url,
    channels: options.channels,
    business_hours_start: options.business_hours_start,
    business_hours_end: options.business_hours_end,
    enabled: true,
  };
}
