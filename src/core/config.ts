/**
 * ⏱️🦀 Clawck — Config Validation
 * Shared validation for CLI and server config loading.
 */

import { WebhookConfig } from './types';

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfig(config: Record<string, any>): ConfigValidationResult {
  const errors: string[] = [];

  if (config.port !== undefined) {
    if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
      errors.push(`"port" must be a number between 1 and 65535 (got ${JSON.stringify(config.port)})`);
    }
  }

  if (config.human_equivalents !== undefined) {
    if (typeof config.human_equivalents !== 'object' || config.human_equivalents === null) {
      errors.push('"human_equivalents" must be an object');
    } else {
      for (const [key, val] of Object.entries(config.human_equivalents)) {
        const v = val as any;
        if (typeof v.multiplier !== 'number' || typeof v.human_rate_usd !== 'number') {
          errors.push(`"human_equivalents.${key}" must have numeric "multiplier" and "human_rate_usd"`);
        }
      }
    }
  }

  if (config.remote_sources !== undefined && !Array.isArray(config.remote_sources)) {
    errors.push('"remote_sources" must be an array');
  }

  if (config.webhooks !== undefined) {
    if (!Array.isArray(config.webhooks)) {
      errors.push('"webhooks" must be an array');
    } else {
      for (const [i, wh] of (config.webhooks as WebhookConfig[]).entries()) {
        if (!wh.url || typeof wh.url !== 'string') {
          errors.push(`"webhooks[${i}].url" must be a string`);
        }
        if (!Array.isArray(wh.events)) {
          errors.push(`"webhooks[${i}].events" must be an array`);
        }
      }
    }
  }

  if (config.sync_interval !== undefined) {
    if (typeof config.sync_interval !== 'number' || config.sync_interval < 1) {
      errors.push('"sync_interval" must be a positive number');
    }
  }

  if (config.idle_alert_hours !== undefined) {
    if (typeof config.idle_alert_hours !== 'number' || config.idle_alert_hours < 0) {
      errors.push('"idle_alert_hours" must be a non-negative number');
    }
  }

  return { valid: errors.length === 0, errors };
}
