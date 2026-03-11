/**
 * ⏱️🦀 Clawck — Core Types & Schema
 * The data model for AI agent time tracking.
 * 
 * ClawckSpec v0.1 — an open standard for agent work entries.
 */

// ─── Time Entry ──────────────────────────────────────────

export type EntryStatus = 'running' | 'completed' | 'failed' | 'paused';

export type TaskCategory = 
  | 'research'
  | 'content'
  | 'code'
  | 'data_entry'
  | 'design'
  | 'communication'
  | 'analysis'
  | 'testing'
  | 'planning'
  | 'other';

export interface ClawckEntry {
  /** Globally unique entry ID (UUID v4) */
  id: string;

  /** Agent identifier (e.g., "research-agent-01") */
  agent: string;

  /** LLM model used (e.g., "claude-sonnet-4-20250514") */
  model: string;

  /** Client name or ID */
  client: string;

  /** Project name or ID */
  project: string;

  /** Human-readable task description */
  task: string;

  /** Task category for human-equivalent estimates */
  category: TaskCategory;

  /** ISO 8601 start timestamp */
  start: string;

  /** ISO 8601 end timestamp (null if still running) */
  end: string | null;

  /** Entry status */
  status: EntryStatus;

  /** Input tokens consumed */
  tokens_in: number;

  /** Output tokens generated */
  tokens_out: number;

  /** Estimated cost in USD */
  cost_usd: number;

  /** Number of tool calls made during this entry */
  tool_calls: number;

  /** Agent-generated summary of work done */
  summary: string;

  /** Arbitrary tags for filtering */
  tags: string[];

  /** Source tool/framework that created this entry */
  source: string;

  /** ClawckSpec version */
  spec_version: string;

  /** ISO 8601 creation timestamp */
  created_at?: string;

  /** ISO 8601 last-updated timestamp */
  updated_at?: string;

  /** Whether this entry has been approved */
  approved?: boolean;

  /** Estimated agent processing time in milliseconds */
  agent_runtime_ms?: number | null;

  /** Total wall-clock elapsed time in milliseconds */
  wall_clock_ms?: number | null;

  /** Embedded comparison data */
  comparison?: EntryComparison;
}

// ─── Comparison ─────────────────────────────────────────

export interface EntryComparison {
  industry_benchmark_minutes?: number;
  industry_source?: string;
  personal_benchmark_minutes?: number;
  agent_total_runtime_minutes: number;
  wall_clock_minutes: number;
}

// ─── Configuration ───────────────────────────────────────

export interface HumanEquivalent {
  /** Multiplier: 1 agent-hour ≈ X human-hours */
  multiplier: number;
  /** Assumed human hourly rate for cost savings calc */
  human_rate_usd: number;
}

export interface ClawckConfig {
  /** Default client for all entries */
  default_client?: string;

  /** Default project for all entries */
  default_project?: string;

  /** Default agent name */
  default_agent?: string;

  /** Default model */
  default_model?: string;

  /** Default source identifier */
  default_source?: string;

  /** Port for the Clawck server */
  port: number;

  /** Path to the .clawck directory */
  data_dir: string;

  /** Human equivalent multipliers by category */
  human_equivalents: Record<TaskCategory, HumanEquivalent>;

  /** Remote sources for multi-agent aggregation */
  remote_sources?: RemoteSource[];

  /** Sync interval in seconds for remote sources */
  sync_interval?: number;

  /** Webhook configurations for event notifications */
  webhooks?: WebhookConfig[];

  /** Hours of inactivity before firing idle_alert webhook (default: 4) */
  idle_alert_hours?: number;

  /** Tracking patterns (templates for common task types) */
  patterns?: TrackingPattern[];

  /** Default pattern name to use when none specified */
  default_pattern?: string;

  /** Runtime estimation overrides */
  runtime_estimation?: {
    model_tokens_per_second?: Record<string, number>;
    default_tokens_per_second?: number;
    avg_tool_duration_ms?: number;
  };

  /** Use industry benchmarks for human-equiv calculations (default: true) */
  use_industry_benchmarks?: boolean;

  /** CORS origin(s) — true for all origins (default), string or string[] to restrict */
  cors_origin?: string | string[] | boolean;

  /** Your personal hourly rate for savings calculations */
  personal_rate_usd?: number;
}

export interface RemoteSource {
  name: string;
  url: string;
  api_key?: string;
}

export interface SyncState {
  source_name: string;
  last_sync_at: string;
  last_status: 'success' | 'error';
  last_error?: string;
  entries_synced: number;
}

// ─── Tracking Patterns ───────────────────────────────────

export interface TrackingPattern {
  name: string;
  description?: string;
  project?: string;
  client?: string;
  category?: TaskCategory;
  agent?: string;
  model?: string;
  tags?: string[];
}

// ─── Webhooks ────────────────────────────────────────────

export type WebhookEvent = 'task_completed' | 'task_failed' | 'idle_alert';

export interface WebhookConfig {
  url: string;
  events: WebhookEvent[];
  headers?: Record<string, string>;
}

// ─── Reports ─────────────────────────────────────────────

export interface TimesheetRow {
  date: string;
  start_time: string;
  end_time: string | null;
  agent: string;
  client: string;
  project: string;
  task: string;
  category: TaskCategory;
  duration_minutes: number;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost_usd: number;
  human_equiv_hours: number;
  human_equiv_cost_saved: number;
  time_saved_hours: number;
  status: EntryStatus;
  approved: boolean;
  agent_total_runtime_minutes?: number;
  wall_clock_minutes?: number;
}

export interface TimesheetSummary {
  period_start: string;
  period_end: string;
  total_entries: number;
  total_agent_hours: number;
  total_human_equiv_hours: number;
  total_cost_usd: number;
  total_savings_usd: number;
  total_tokens: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_time_saved_hours: number;
  by_client: ClientSummary[];
  by_agent: AgentSummary[];
  by_project: ProjectSummary[];
  by_category: CategorySummary[];
  entries: TimesheetRow[];
  total_agent_merged_runtime_hours: number;
  total_personal_equiv_hours?: number;
  total_personal_savings_usd?: number;
}

export interface ClientSummary {
  client: string;
  agent_hours: number;
  human_equiv_hours: number;
  cost_usd: number;
  savings_usd: number;
  entries: number;
}

export interface AgentSummary {
  agent: string;
  model: string;
  agent_hours: number;
  human_equiv_hours: number;
  cost_usd: number;
  entries: number;
  success_rate: number;
}

export interface ProjectSummary {
  project: string;
  client: string;
  agent_hours: number;
  human_equiv_hours: number;
  cost_usd: number;
  entries: number;
}

export interface CategorySummary {
  category: TaskCategory;
  agent_hours: number;
  human_equiv_hours: number;
  cost_usd: number;
  savings_usd: number;
  entries: number;
}

// ─── Report System ──────────────────────────────────────

export type ReportPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';
export type ReportStyle = 'full' | 'short' | 'visual' | 'text' | 'table' | 'calendar';
export type ReportFormat = 'terminal' | 'pdf' | 'html';

export interface StoredReport {
  id: string;
  name: string;
  period: ReportPeriod;
  period_start: string;
  period_end: string;
  style: ReportStyle;
  format: ReportFormat;
  content: string | Buffer;
  metadata: ReportMetadata;
  created_at: string;
}

export interface ReportMetadata {
  filters?: { client?: string; project?: string; agent?: string };
  total_entries: number;
  total_agent_hours: number;
  total_cost_usd: number;
  total_savings_usd: number;
}

// ─── MCP Tool Definitions ────────────────────────────────

export interface ClawckStartInput {
  task: string;
  project?: string;
  client?: string;
  category?: TaskCategory;
  agent?: string;
  model?: string;
  tags?: string[];
}

export interface ClawckStopInput {
  id: string;
  status?: 'completed' | 'failed';
  summary?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  tool_calls?: number;
  /** Override agent runtime (from signal file or explicit timing) */
  agent_runtime_ms?: number;
}

export interface ClawckLogInput {
  task: string;
  project?: string;
  client?: string;
  category?: TaskCategory;
  agent?: string;
  model?: string;
  duration_minutes: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  tool_calls?: number;
  summary?: string;
  tags?: string[];
}

// ─── Defaults ────────────────────────────────────────────

export const SPEC_VERSION = '0.2.0';
export const APP_VERSION = '0.5.5';

/**
 * Default human-equivalent multipliers.
 * These are configurable starting estimates, NOT researched benchmarks.
 * Override per-category in config.json under "human_equivalents".
 * See docs/benchmarks-sources.md for industry time data you can use to calibrate.
 */
export const DEFAULT_HUMAN_EQUIVALENTS: Record<TaskCategory, HumanEquivalent> = {
  research:       { multiplier: 12, human_rate_usd: 50 },
  content:        { multiplier: 10, human_rate_usd: 45 },
  code:           { multiplier: 6,  human_rate_usd: 75 },
  data_entry:     { multiplier: 20, human_rate_usd: 25 },
  design:         { multiplier: 5,  human_rate_usd: 60 },
  communication:  { multiplier: 8,  human_rate_usd: 40 },
  analysis:       { multiplier: 10, human_rate_usd: 55 },
  testing:        { multiplier: 8,  human_rate_usd: 65 },
  planning:       { multiplier: 6,  human_rate_usd: 50 },
  other:          { multiplier: 8,  human_rate_usd: 50 },
};

export const DEFAULT_CONFIG: ClawckConfig = {
  port: 3456,
  data_dir: '.clawck',
  human_equivalents: DEFAULT_HUMAN_EQUIVALENTS,
  sync_interval: 60,
};

export const TASK_CATEGORIES: TaskCategory[] = [
  'research', 'content', 'code', 'data_entry', 'design',
  'communication', 'analysis', 'testing', 'planning', 'other',
];

// ─── Productivity Score ───────────────────────────────────

export interface DayScore {
  date: string;
  agent_runtime_hours: number;
  available_hours: number;
  utilization_percent: number;
  entry_count: number;
  top_category: TaskCategory | null;
  trend: 'up' | 'down' | 'stable';
}

export interface ProductivityScore {
  period_start: string;
  period_end: string;
  days: DayScore[];
  total_agent_runtime_hours: number;
  total_available_hours: number;
  overall_utilization_percent: number;
  busiest_category: TaskCategory | null;
  total_entries: number;
  daily_average_hours: number;
  trend: 'up' | 'down' | 'stable';
}

// ─── Category Trends ──────────────────────────────────────

export interface WeekTrend {
  week_start: string;
  week_end: string;
  week_number: number;
  categories: CategoryTrendEntry[];
  total_entries: number;
  total_hours: number;
}

export interface CategoryTrendEntry {
  category: TaskCategory;
  percentage: number;
  hours: number;
  entries: number;
  delta_percent: number | null; // Change from previous week
}

export interface CategoryTrends {
  period_start: string;
  period_end: string;
  weeks: WeekTrend[];
  biggest_shift: {
    category: TaskCategory;
    delta_percent: number;
    direction: 'up' | 'down';
  } | null;
}

// ─── Digests ──────────────────────────────────────────────

export type DigestPeriod = 'day' | 'week';

export interface DigestHighlight {
  type: 'top_project' | 'top_category' | 'top_agent' | 'longest_task' | 'most_tasks' | 'milestone';
  label: string;
  value: string;
  metric?: number;
}

export interface Digest {
  period: DigestPeriod;
  period_start: string;
  period_end: string;
  summary: {
    total_entries: number;
    total_agent_hours: number;
    total_human_equiv_hours: number;
    total_cost_usd: number;
    total_savings_usd: number;
    completed: number;
    failed: number;
    running: number;
  };
  highlights: DigestHighlight[];
  by_day?: {
    date: string;
    entries: number;
    agent_hours: number;
    top_category: TaskCategory | null;
  }[];
  top_tasks: {
    task: string;
    project: string;
    category: TaskCategory;
    duration_minutes: number;
  }[];
  comparison?: {
    vs_previous_period: {
      entries_delta: number;
      hours_delta: number;
      direction: 'up' | 'down' | 'same';
    };
  };
}
