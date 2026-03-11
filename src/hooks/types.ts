/**
 * ⏱️🦀 Clawck — Hook Types
 * Type definitions for platform hook integration.
 */

export type HookEvent = 'start' | 'stop';

export type Platform = 'claude' | 'gemini' | 'cursor' | 'cline' | 'windsurf' | 'codex' | 'openclaw' | 'unknown';

export interface HookContext {
  platform: Platform;
  session_id: string;
  task: string;
  project?: string;
  agent?: string;
  model?: string;
  cwd?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  tool_calls?: number;
  /** Agent runtime in milliseconds (from signal file or explicit field) */
  agent_runtime_ms?: number;
  /** Start timestamp in epoch ms (from signal file) */
  start_epoch_ms?: number;
  /** End timestamp in epoch ms (from signal file) */
  end_epoch_ms?: number;
  raw: unknown;
}

export interface SessionState {
  entry_id: string;
  platform: Platform;
  started_at: string;
  session_id: string;
}
