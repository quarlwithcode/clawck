/**
 * ⏱️🦀 Clawck — Hook Types
 * Type definitions for platform hook integration.
 */

export type HookEvent = 'start' | 'stop';

export type Platform = 'claude' | 'gemini' | 'cursor' | 'cline' | 'windsurf' | 'codex' | 'unknown';

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
  raw: unknown;
}

export interface SessionState {
  entry_id: string;
  platform: Platform;
  started_at: string;
  session_id: string;
}
