/**
 * ⏱️🦀 Clawck — Structured Logger
 * Thin wrapper for consistent log output across subsystems.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Subsystem = 'api' | 'db' | 'sync' | 'hooks' | 'webhooks' | 'cli' | 'mcp';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVEL_ORDER) return env as LogLevel;
  return 'info';
}

export function log(level: LogLevel, subsystem: Subsystem, message: string, data?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinLevel()]) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${subsystem}]`;
  const suffix = data ? ' ' + JSON.stringify(data) : '';
  const line = `${prefix} ${message}${suffix}`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (subsystem: Subsystem, message: string, data?: Record<string, unknown>) => log('debug', subsystem, message, data),
  info: (subsystem: Subsystem, message: string, data?: Record<string, unknown>) => log('info', subsystem, message, data),
  warn: (subsystem: Subsystem, message: string, data?: Record<string, unknown>) => log('warn', subsystem, message, data),
  error: (subsystem: Subsystem, message: string, data?: Record<string, unknown>) => log('error', subsystem, message, data),
};
