/**
 * ⏱️🦀 Clawck — Report Period Resolution
 * Resolves time period presets into concrete date ranges.
 */

import { ReportPeriod } from '../core/types';

export interface PeriodOptions {
  period?: ReportPeriod;
  from?: string;
  to?: string;
  days?: number;
}

export interface ResolvedPeriod {
  from: string;
  to: string;
  period: ReportPeriod;
}

export function resolvePeriod(opts: PeriodOptions): ResolvedPeriod {
  const now = new Date();

  // Priority: --period > --from/--to > --days > default 'week'
  if (opts.period) {
    const to = now.toISOString();
    switch (opts.period) {
      case 'day': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { from: start.toISOString(), to, period: 'day' };
      }
      case 'week': {
        const start = new Date(now.getTime() - 7 * 86400000);
        start.setHours(0, 0, 0, 0);
        return { from: start.toISOString(), to, period: 'week' };
      }
      case 'month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: start.toISOString(), to, period: 'month' };
      }
      case 'year': {
        const start = new Date(now.getFullYear(), 0, 1);
        return { from: start.toISOString(), to, period: 'year' };
      }
      case 'custom': {
        if (!opts.from || !opts.to) {
          throw new Error("period 'custom' requires both --from and --to");
        }
        return { from: new Date(opts.from).toISOString(), to: new Date(opts.to).toISOString(), period: 'custom' };
      }
    }
  }

  // --from/--to without --period → custom
  if (opts.from || opts.to) {
    const from = opts.from ? new Date(opts.from).toISOString() : new Date(now.getTime() - 7 * 86400000).toISOString();
    const to = opts.to ? new Date(opts.to).toISOString() : now.toISOString();
    return { from, to, period: 'custom' };
  }

  // --days backward compat
  if (opts.days !== undefined) {
    const from = new Date(now.getTime() - opts.days * 86400000).toISOString();
    return { from, to: now.toISOString(), period: 'custom' };
  }

  // Default: week
  const start = new Date(now.getTime() - 7 * 86400000);
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: now.toISOString(), period: 'week' };
}
