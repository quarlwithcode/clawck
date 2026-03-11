/**
 * ⏱️🦀 Clawck — Entry Manager
 * High-level API for managing agent time entries.
 */

import { v4 as uuid } from 'uuid';
import {
  ClawckEntry, ClawckConfig, ClawckStartInput, ClawckStopInput, ClawckLogInput,
  TimesheetSummary, SPEC_VERSION, DEFAULT_CONFIG, TrackingPattern, TaskCategory,
  StoredReport, ReportMetadata, ReportPeriod, ReportStyle, ReportFormat,
  ProductivityScore, DayScore, CategoryTrends, WeekTrend, CategoryTrendEntry, TASK_CATEGORIES,
} from './types';
import { estimateCost } from './pricing';
import { ClawckDB } from './database';
import { WebhookManager } from './webhooks';
import { DEFAULT_PATTERNS } from './patterns';
import { estimateAgentRuntime, calculateWallClock, findModelSpeed, DEFAULT_RUNTIME_CONFIG, RuntimeEstimatorConfig } from './runtime';
import { PersonalBaseline, compareEntry, PersonalComparisonResult } from './personal';
import { INDUSTRY_BENCHMARKS } from './benchmarks';
import { v4 as uuidv4 } from 'uuid';

export class Clawck {
  private _db: ClawckDB;
  private config: ClawckConfig;
  private webhookManager: WebhookManager;

  constructor(config: Partial<ClawckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._db = new ClawckDB(this.config);
    this.webhookManager = new WebhookManager(this.config);
  }

  /** Wait for the database to be ready (call once before first operation) */
  async ready(): Promise<this> {
    await this._db.ensureReady();
    return this;
  }

  get database(): ClawckDB { return this._db; }

  // ─── Upsert (for sync) ────────────────────────────────

  upsert(entry: ClawckEntry): ClawckEntry {
    return this._db.upsert(entry);
  }

  // ─── Patterns ────────────────────────────────────────────

  getPatterns(): TrackingPattern[] {
    return this.config.patterns || DEFAULT_PATTERNS;
  }

  getPattern(name: string): TrackingPattern | undefined {
    return this.getPatterns().find(p => p.name === name);
  }

  // ─── Approve ────────────────────────────────────────────

  approve(id: string): ClawckEntry | null {
    return this._db.update(id, { approved: true });
  }

  // ─── Start a Task ──────────────────────────────────────

  start(input: ClawckStartInput & { pattern?: string }): ClawckEntry {
    const pat = input.pattern ? this.getPattern(input.pattern) : (this.config.default_pattern ? this.getPattern(this.config.default_pattern) : undefined);

    const entry: ClawckEntry = {
      id: uuid(),
      agent: input.agent || pat?.agent || this.config.default_agent || 'unknown-agent',
      model: input.model || pat?.model || this.config.default_model || 'unknown',
      client: input.client || pat?.client || this.config.default_client || 'default',
      project: input.project || pat?.project || this.config.default_project || 'default',
      task: input.task,
      category: input.category || pat?.category || 'other',
      start: new Date().toISOString(),
      end: null,
      status: 'running',
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      tool_calls: 0,
      summary: '',
      tags: input.tags || pat?.tags || [],
      source: this.config.default_source || 'clawck',
      spec_version: SPEC_VERSION,
      approved: false,
    };

    return this._db.insert(entry);
  }

  // ─── Stop a Task ───────────────────────────────────────

  stop(input: ClawckStopInput): ClawckEntry | null {
    const status = input.status || 'completed';
    const endTime = new Date().toISOString();

    // Build updates
    const updates: Partial<ClawckEntry> = {
      end: endTime,
      status,
      summary: input.summary || '',
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      cost_usd: input.cost_usd,
      tool_calls: input.tool_calls,
    };

    // Cost estimation fallback: if no cost_usd provided but tokens exist, compute from pricing
    if (updates.cost_usd == null || updates.cost_usd === 0) {
      const existing = this._db.getById(input.id);
      const tokIn = input.tokens_in ?? existing?.tokens_in ?? 0;
      const tokOut = input.tokens_out ?? existing?.tokens_out ?? 0;
      const model = existing?.model || 'unknown';
      if (tokIn > 0 || tokOut > 0) {
        const estimated = estimateCost(model, tokIn, tokOut, true);
        if (estimated != null) {
          updates.cost_usd = Math.round(estimated * 10000) / 10000;
        }
      }
    }

    // Calculate wall clock and agent runtime
    const existing = this._db.getById(input.id);
    if (existing) {
      updates.wall_clock_ms = calculateWallClock(existing.start, endTime);

      // Priority 1: Use explicit agent_runtime_ms from input (e.g., from signal file)
      if (input.agent_runtime_ms != null && input.agent_runtime_ms > 0) {
        updates.agent_runtime_ms = input.agent_runtime_ms;
      } else {
        // Priority 2: Estimate from tokens/tool calls
        const tokensOut = input.tokens_out ?? existing.tokens_out ?? 0;
        const toolCalls = input.tool_calls ?? existing.tool_calls ?? 0;
        const model = existing.model || 'unknown';
        if (tokensOut > 0 || toolCalls > 0) {
          const runtimeConfig = this.getRuntimeConfig();
          updates.agent_runtime_ms = estimateAgentRuntime(
            { tokens_out: tokensOut, model, tool_calls: toolCalls },
            runtimeConfig
          );
        } else {
          // Priority 3: Fall back to wall clock time
          updates.agent_runtime_ms = updates.wall_clock_ms;

          // Reverse-estimate tokens from wall clock time
          if (updates.wall_clock_ms && updates.wall_clock_ms > 0) {
            const runtimeConfig = this.getRuntimeConfig();
            const speed = findModelSpeed(model, runtimeConfig);
            // 0.5 factor: not all wall clock time is active generation
            const estimatedOut = Math.round((updates.wall_clock_ms / 1000) * speed * 0.5);
            if (estimatedOut > 0) {
              updates.tokens_out = estimatedOut;
              updates.tokens_in = Math.round(estimatedOut * 2); // rough input:output ratio
              const estimated = estimateCost(model, updates.tokens_in, estimatedOut, true);
              if (estimated != null) {
                updates.cost_usd = Math.round(estimated * 10000) / 10000;
              }
            }
          }
        }
      }

      // Final validation: ensure agent_runtime_ms is never null if we have timestamps
      if (updates.agent_runtime_ms == null && updates.wall_clock_ms != null) {
        updates.agent_runtime_ms = updates.wall_clock_ms;
      }
    }

    const entry = this._db.update(input.id, updates);

    if (entry) {
      const event = status === 'failed' ? 'task_failed' : 'task_completed';
      this.webhookManager.fire(event, { entry });
    }

    return entry;
  }

  // ─── Log a Completed Task (retroactive) ─────────────────

  log(input: ClawckLogInput & { pattern?: string; agent_runtime_ms?: number }): ClawckEntry {
    const end = new Date();
    const start = new Date(end.getTime() - (input.duration_minutes * 60000));
    const pat = input.pattern ? this.getPattern(input.pattern) : (this.config.default_pattern ? this.getPattern(this.config.default_pattern) : undefined);

    const tokensOut = input.tokens_out || 0;
    const toolCalls = input.tool_calls || 0;
    const model = input.model || pat?.model || this.config.default_model || 'unknown';

    let agentRuntimeMs: number | null = input.agent_runtime_ms ?? null;
    if (agentRuntimeMs === null && (tokensOut > 0 || toolCalls > 0)) {
      const runtimeConfig = this.getRuntimeConfig();
      agentRuntimeMs = estimateAgentRuntime(
        { tokens_out: tokensOut, model, tool_calls: toolCalls },
        runtimeConfig
      );
    }

    let costUsd = input.cost_usd || 0;
    if (costUsd === 0) {
      const tokIn = input.tokens_in || 0;
      if (tokIn > 0 || tokensOut > 0) {
        const estimated = estimateCost(model, tokIn, tokensOut, true);
        if (estimated != null) {
          costUsd = Math.round(estimated * 10000) / 10000;
        }
      }
    }

    const entry: ClawckEntry = {
      id: uuid(),
      agent: input.agent || pat?.agent || this.config.default_agent || 'unknown-agent',
      model,
      client: input.client || pat?.client || this.config.default_client || 'default',
      project: input.project || pat?.project || this.config.default_project || 'default',
      task: input.task,
      category: input.category || pat?.category || 'other',
      start: start.toISOString(),
      end: end.toISOString(),
      status: 'completed',
      tokens_in: input.tokens_in || 0,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      tool_calls: toolCalls,
      summary: input.summary || '',
      tags: input.tags || pat?.tags || [],
      source: this.config.default_source || 'clawck',
      spec_version: SPEC_VERSION,
      approved: false,
      agent_runtime_ms: agentRuntimeMs,
      wall_clock_ms: input.duration_minutes * 60000,
    };

    return this._db.insert(entry);
  }

  // ─── Update a Running Entry ────────────────────────────

  update(id: string, updates: Partial<ClawckEntry>): ClawckEntry | null {
    return this._db.update(id, updates);
  }

  // ─── Delete ────────────────────────────────────────────

  delete(id: string): boolean {
    return this._db.deleteById(id);
  }

  findByPrefix(prefix: string): ClawckEntry[] {
    return this._db.findByPrefix(prefix);
  }

  // ─── Query ─────────────────────────────────────────────

  get(id: string): ClawckEntry | null {
    return this._db.getById(id);
  }

  running(): ClawckEntry[] {
    return this._db.getRunning();
  }

  query(filters: {
    client?: string;
    project?: string;
    agent?: string;
    category?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    approved?: boolean;
  } = {}): ClawckEntry[] {
    return this._db.query(filters);
  }

  // ─── Timesheet ─────────────────────────────────────────

  timesheet(from: string, to: string, filters?: { client?: string; project?: string; agent?: string }): TimesheetSummary {
    return this._db.getTimesheet(from, to, filters);
  }

  // ─── Metadata ──────────────────────────────────────────

  clients(): string[] { return this._db.getClients(); }
  projects(): string[] { return this._db.getProjects(); }
  agents(): string[] { return this._db.getAgents(); }
  stats() { return this._db.getStats(); }

  // ─── Personal Baselines ──────────────────────────────

  addBaseline(input: { category: TaskCategory; task_type: string; description?: string; my_minutes: number }): PersonalBaseline {
    const baseline: PersonalBaseline = {
      id: uuidv4(),
      category: input.category,
      task_type: input.task_type,
      description: input.description || '',
      my_minutes: input.my_minutes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return this._db.insertBaseline(baseline);
  }

  removeBaseline(id: string): boolean {
    return this._db.deleteBaseline(id);
  }

  getBaselines(): PersonalBaseline[] {
    return this._db.getBaselines();
  }

  compareEntryById(entryId: string): PersonalComparisonResult | null {
    const entry = this._db.getById(entryId);
    if (!entry) return null;
    const baselines = this._db.getBaselines();
    const personalRate = this.config.personal_rate_usd || 50;
    return compareEntry(entry, baselines, INDUSTRY_BENCHMARKS, personalRate);
  }

  // ─── Report Persistence ──────────────────────────────

  saveReport(opts: {
    name: string;
    period: ReportPeriod;
    period_start: string;
    period_end: string;
    style: ReportStyle;
    format: ReportFormat;
    content: string | Buffer;
    metadata: ReportMetadata;
  }): StoredReport {
    const report: StoredReport = {
      id: uuidv4(),
      name: opts.name,
      period: opts.period,
      period_start: opts.period_start,
      period_end: opts.period_end,
      style: opts.style,
      format: opts.format,
      content: opts.content,
      metadata: opts.metadata,
      created_at: new Date().toISOString(),
    };
    return this._db.insertReport(report);
  }

  listReports(limit?: number, offset?: number): StoredReport[] {
    return this._db.listReports(limit, offset);
  }

  getReport(id: string): StoredReport | null {
    return this._db.getReportContent(id);
  }

  deleteReport(id: string): boolean {
    return this._db.deleteReport(id);
  }

  // ─── Productivity Score ───────────────────────────────

  score(opts: { days?: number; weekly?: boolean; available_hours_per_day?: number } = {}): ProductivityScore {
    const days = opts.days || (opts.weekly ? 7 : 7);
    const availableHoursPerDay = opts.available_hours_per_day || 8;

    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - days * 86400000).toISOString();

    const entries = this._db.query({ from, to, limit: 10000 });

    // Group entries by date
    const byDate = new Map<string, ClawckEntry[]>();
    for (const e of entries) {
      const date = e.start.split('T')[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(e);
    }

    // Generate day scores
    const dayScores: DayScore[] = [];
    let prevScore: number | null = null;

    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - (days - 1 - i) * 86400000).toISOString().split('T')[0];
      const dayEntries = byDate.get(date) || [];

      // Calculate agent runtime for the day
      let agentRuntimeMs = 0;
      const categoryCounts = new Map<TaskCategory, number>();

      for (const e of dayEntries) {
        const runtime = e.agent_runtime_ms ?? e.wall_clock_ms ?? 0;
        agentRuntimeMs += runtime;
        const cat = e.category;
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      }

      const agentRuntimeHours = agentRuntimeMs / 3600000;
      const utilizationPercent = Math.min(100, Math.round((agentRuntimeHours / availableHoursPerDay) * 100));

      // Find top category
      let topCategory: TaskCategory | null = null;
      let maxCount = 0;
      for (const [cat, count] of categoryCounts) {
        if (count > maxCount) {
          maxCount = count;
          topCategory = cat;
        }
      }

      // Determine trend
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (prevScore !== null) {
        if (utilizationPercent > prevScore + 5) trend = 'up';
        else if (utilizationPercent < prevScore - 5) trend = 'down';
      }
      prevScore = utilizationPercent;

      dayScores.push({
        date,
        agent_runtime_hours: Math.round(agentRuntimeHours * 100) / 100,
        available_hours: availableHoursPerDay,
        utilization_percent: utilizationPercent,
        entry_count: dayEntries.length,
        top_category: topCategory,
        trend,
      });
    }

    // Calculate totals
    const totalAgentRuntimeHours = dayScores.reduce((s, d) => s + d.agent_runtime_hours, 0);
    const totalAvailableHours = days * availableHoursPerDay;
    const overallUtilization = Math.min(100, Math.round((totalAgentRuntimeHours / totalAvailableHours) * 100));
    const totalEntries = entries.length;
    const dailyAverageHours = Math.round((totalAgentRuntimeHours / days) * 100) / 100;

    // Find busiest category across all entries
    const globalCategoryCounts = new Map<TaskCategory, number>();
    for (const e of entries) {
      const cat = e.category;
      globalCategoryCounts.set(cat, (globalCategoryCounts.get(cat) || 0) + 1);
    }
    let busiestCategory: TaskCategory | null = null;
    let maxGlobal = 0;
    for (const [cat, count] of globalCategoryCounts) {
      if (count > maxGlobal) {
        maxGlobal = count;
        busiestCategory = cat;
      }
    }

    // Overall trend: compare first half to second half
    const halfPoint = Math.floor(dayScores.length / 2);
    const firstHalfAvg = dayScores.slice(0, halfPoint).reduce((s, d) => s + d.utilization_percent, 0) / Math.max(1, halfPoint);
    const secondHalfAvg = dayScores.slice(halfPoint).reduce((s, d) => s + d.utilization_percent, 0) / Math.max(1, dayScores.length - halfPoint);
    let overallTrend: 'up' | 'down' | 'stable' = 'stable';
    if (secondHalfAvg > firstHalfAvg + 5) overallTrend = 'up';
    else if (secondHalfAvg < firstHalfAvg - 5) overallTrend = 'down';

    return {
      period_start: from,
      period_end: to,
      days: dayScores,
      total_agent_runtime_hours: Math.round(totalAgentRuntimeHours * 100) / 100,
      total_available_hours: totalAvailableHours,
      overall_utilization_percent: overallUtilization,
      busiest_category: busiestCategory,
      total_entries: totalEntries,
      daily_average_hours: dailyAverageHours,
      trend: overallTrend,
    };
  }

  // ─── Category Trends ───────────────────────────────────

  trends(opts: { weeks?: number } = {}): CategoryTrends {
    const weeks = opts.weeks || 4;
    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - weeks * 7 * 86400000).toISOString();

    const entries = this._db.query({ from, to, limit: 10000 });

    // Helper to get week number (Monday-Sunday)
    const getWeekStart = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when Sunday
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Group entries by week
    const weekMap = new Map<string, ClawckEntry[]>();
    for (const e of entries) {
      const weekStart = getWeekStart(new Date(e.start));
      const weekKey = weekStart.toISOString().split('T')[0];
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
      weekMap.get(weekKey)!.push(e);
    }

    // Sort weeks chronologically
    const sortedWeekKeys = Array.from(weekMap.keys()).sort();

    // Build previous week percentages for delta calculation
    const prevWeekPct = new Map<TaskCategory, number>();
    const weekTrends: WeekTrend[] = [];

    for (let i = 0; i < sortedWeekKeys.length; i++) {
      const weekKey = sortedWeekKeys[i];
      const weekEntries = weekMap.get(weekKey) || [];
      const weekStart = new Date(weekKey);
      const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);

      // Calculate hours and entries per category
      const catData = new Map<TaskCategory, { hours: number; entries: number }>();
      let totalHours = 0;

      for (const e of weekEntries) {
        const cat = e.category;
        const hours = (e.agent_runtime_ms ?? e.wall_clock_ms ?? 0) / 3600000;
        totalHours += hours;

        if (!catData.has(cat)) catData.set(cat, { hours: 0, entries: 0 });
        const d = catData.get(cat)!;
        d.hours += hours;
        d.entries += 1;
      }

      // Build category entries with percentages and deltas
      const categories: CategoryTrendEntry[] = [];
      for (const cat of TASK_CATEGORIES) {
        const data = catData.get(cat) || { hours: 0, entries: 0 };
        const percentage = totalHours > 0 ? Math.round((data.hours / totalHours) * 100) : 0;
        const prevPct = prevWeekPct.get(cat);
        const deltaPct = prevPct !== undefined ? percentage - prevPct : null;

        categories.push({
          category: cat,
          percentage,
          hours: Math.round(data.hours * 100) / 100,
          entries: data.entries,
          delta_percent: deltaPct,
        });

        // Update prev for next iteration
        prevWeekPct.set(cat, percentage);
      }

      // Sort categories by percentage descending
      categories.sort((a, b) => b.percentage - a.percentage);

      weekTrends.push({
        week_start: weekKey,
        week_end: weekEnd.toISOString().split('T')[0],
        week_number: i + 1,
        categories,
        total_entries: weekEntries.length,
        total_hours: Math.round(totalHours * 100) / 100,
      });
    }

    // Find biggest shift (only consider weeks with previous data)
    let biggestShift: CategoryTrends['biggest_shift'] = null;
    let maxAbsDelta = 0;

    for (const week of weekTrends) {
      for (const cat of week.categories) {
        if (cat.delta_percent !== null && Math.abs(cat.delta_percent) > maxAbsDelta) {
          maxAbsDelta = Math.abs(cat.delta_percent);
          biggestShift = {
            category: cat.category,
            delta_percent: cat.delta_percent,
            direction: cat.delta_percent > 0 ? 'up' : 'down',
          };
        }
      }
    }

    return {
      period_start: from,
      period_end: to,
      weeks: weekTrends,
      biggest_shift: biggestShift,
    };
  }

  // ─── Runtime Config ──────────────────────────────────

  private getRuntimeConfig(): RuntimeEstimatorConfig {
    const overrides = this.config.runtime_estimation;
    if (!overrides) return DEFAULT_RUNTIME_CONFIG;
    return {
      model_tokens_per_second: {
        ...DEFAULT_RUNTIME_CONFIG.model_tokens_per_second,
        ...(overrides.model_tokens_per_second || {}),
      },
      default_tokens_per_second: overrides.default_tokens_per_second ?? DEFAULT_RUNTIME_CONFIG.default_tokens_per_second,
      avg_tool_duration_ms: overrides.avg_tool_duration_ms ?? DEFAULT_RUNTIME_CONFIG.avg_tool_duration_ms,
    };
  }

  // ─── Cleanup ───────────────────────────────────────────

  get webhooks(): WebhookManager { return this.webhookManager; }

  close(): void {
    this.webhookManager.stopIdleMonitor();
    this._db.close();
  }
}
