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

  /** Agent identifier (e.g., "cubi-research-01") */
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

// ─── Reports ─────────────────────────────────────────────

export interface TimesheetRow {
  date: string;
  agent: string;
  client: string;
  project: string;
  task: string;
  category: TaskCategory;
  duration_minutes: number;
  tokens_total: number;
  cost_usd: number;
  human_equiv_hours: number;
  human_equiv_cost_saved: number;
  status: EntryStatus;
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
  by_client: ClientSummary[];
  by_agent: AgentSummary[];
  by_project: ProjectSummary[];
  by_category: CategorySummary[];
  entries: TimesheetRow[];
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

export const SPEC_VERSION = '0.1.0';

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
