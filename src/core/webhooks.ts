/**
 * ⏱️🦀 Clawck — Webhook Manager
 * Fire-and-forget POST notifications on task events.
 */

import { ClawckConfig, WebhookEvent, ClawckEntry } from './types';
import { ClawckDB } from './database';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  entry?: Partial<ClawckEntry>;
  message?: string;
}

export class WebhookManager {
  private config: ClawckConfig;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private idleFired = false;

  constructor(config: ClawckConfig) {
    this.config = config;
  }

  fire(event: WebhookEvent, payload: Partial<WebhookPayload>): void {
    const webhooks = this.config.webhooks;
    if (!webhooks || webhooks.length === 0) return;

    const fullPayload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    for (const wh of webhooks) {
      if (!wh.events.includes(event)) continue;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...wh.headers,
      };

      fetch(wh.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(fullPayload),
      }).catch(() => {
        // fire-and-forget: silently ignore errors
      });
    }
  }

  startIdleMonitor(db: ClawckDB): void {
    const checkIntervalMs = 15 * 60 * 1000; // 15 minutes
    const thresholdHours = this.config.idle_alert_hours ?? 4;

    this.idleTimer = setInterval(() => {
      const entries = db.query({ limit: 1 });
      if (entries.length === 0) return;

      const mostRecent = entries[0];
      const lastTime = mostRecent.end || mostRecent.start;
      const ageMs = Date.now() - new Date(lastTime).getTime();
      const ageHours = ageMs / 3600000;

      if (ageHours >= thresholdHours && !this.idleFired) {
        this.idleFired = true;
        this.fire('idle_alert', {
          message: `No activity for ${ageHours.toFixed(1)} hours (threshold: ${thresholdHours}h)`,
        });
      } else if (ageHours < thresholdHours) {
        this.idleFired = false;
      }
    }, checkIntervalMs);
  }

  stopIdleMonitor(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
