/**
 * ⏱️🦀 Clawck — Platform Adapters
 * Normalizes platform-specific hook JSON into a common HookContext.
 */

import { HookContext, Platform } from './types';

// ─── Platform Detection ────────────────────────────────────

export function detectPlatform(json: Record<string, unknown>): Platform {
  if (json.hook_event_name || json.session_id && json.transcript_path) return 'claude';
  if (json.GEMINI_SESSION_ID || (json.context && typeof json.context === 'object')) return 'gemini';
  if (json.conversation_id && json.generation_id) return 'cursor';
  if (json.clineVersion || json.taskId) return 'cline';
  if (json.agent_action_name) return 'windsurf';
  if (json.turn_id || json.thread_id) return 'codex';
  return 'unknown';
}

// ─── Claude Code Adapter ───────────────────────────────────

function normalizeClaude(json: Record<string, unknown>): HookContext {
  const prompt = json.prompt as Record<string, unknown> | undefined;
  return {
    platform: 'claude',
    session_id: str(json.session_id) || 'claude-' + Date.now(),
    task: str(prompt?.content) || str(json.prompt) || str(json.hook_event_name) || 'claude-task',
    project: str(json.project_dir) || str(json.cwd),
    agent: 'claude-code',
    model: str(json.model),
    cwd: str(json.cwd),
    raw: json,
  };
}

// ─── Gemini CLI Adapter ────────────────────────────────────

function normalizeGemini(json: Record<string, unknown>): HookContext {
  const ctx = json.context as Record<string, unknown> | undefined;
  return {
    platform: 'gemini',
    session_id: str(json.GEMINI_SESSION_ID) || str(ctx?.session_id) || 'gemini-' + Date.now(),
    task: str(json.prompt) || str(ctx?.prompt) || 'gemini-task',
    project: str(json.cwd) || str(ctx?.cwd),
    agent: 'gemini-cli',
    model: str(json.model) || str(ctx?.model),
    cwd: str(json.cwd) || str(ctx?.cwd),
    raw: json,
  };
}

// ─── Cursor Adapter ────────────────────────────────────────

function normalizeCursor(json: Record<string, unknown>): HookContext {
  return {
    platform: 'cursor',
    session_id: str(json.conversation_id) || 'cursor-' + Date.now(),
    task: str(json.prompt) || str(json.message) || 'cursor-task',
    project: str(json.workspace_path) || str(json.cwd),
    agent: 'cursor',
    model: str(json.model),
    cwd: str(json.workspace_path) || str(json.cwd),
    raw: json,
  };
}

// ─── Cline Adapter ─────────────────────────────────────────

function normalizeCline(json: Record<string, unknown>): HookContext {
  return {
    platform: 'cline',
    session_id: str(json.taskId) || 'cline-' + Date.now(),
    task: str(json.task) || str(json.message) || 'cline-task',
    project: str(json.workspacePath) || str(json.cwd),
    agent: 'cline',
    model: str(json.model) || str(json.apiProvider),
    cwd: str(json.workspacePath) || str(json.cwd),
    raw: json,
  };
}

// ─── Windsurf Adapter ──────────────────────────────────────

function normalizeWindsurf(json: Record<string, unknown>): HookContext {
  return {
    platform: 'windsurf',
    session_id: str(json.session_id) || str(json.conversation_id) || 'windsurf-' + Date.now(),
    task: str(json.prompt) || str(json.agent_action_name) || 'windsurf-task',
    project: str(json.workspace_path) || str(json.cwd),
    agent: 'windsurf',
    model: str(json.model),
    cwd: str(json.workspace_path) || str(json.cwd),
    raw: json,
  };
}

// ─── Codex Adapter ─────────────────────────────────────────

function normalizeCodex(json: Record<string, unknown>): HookContext {
  return {
    platform: 'codex',
    session_id: str(json.thread_id) || str(json.turn_id) || 'codex-' + Date.now(),
    task: str(json.prompt) || str(json.message) || 'codex-task',
    project: str(json.cwd),
    agent: 'codex',
    model: str(json.model),
    cwd: str(json.cwd),
    raw: json,
  };
}

// ─── Unknown / Fallback Adapter ────────────────────────────

function normalizeUnknown(json: Record<string, unknown>): HookContext {
  return {
    platform: 'unknown',
    session_id: str(json.session_id) || str(json.id) || 'unknown-' + Date.now(),
    task: str(json.task) || str(json.prompt) || str(json.message) || 'unknown-task',
    project: str(json.project) || str(json.cwd),
    agent: str(json.agent) || 'unknown',
    model: str(json.model),
    cwd: str(json.cwd),
    raw: json,
  };
}

// ─── Public API ────────────────────────────────────────────

const adapters: Record<Platform, (json: Record<string, unknown>) => HookContext> = {
  claude: normalizeClaude,
  gemini: normalizeGemini,
  cursor: normalizeCursor,
  cline: normalizeCline,
  windsurf: normalizeWindsurf,
  codex: normalizeCodex,
  unknown: normalizeUnknown,
};

export function normalize(json: Record<string, unknown>, platform?: Platform): HookContext {
  const p = platform || detectPlatform(json);
  return adapters[p](json);
}

// ─── Helpers ───────────────────────────────────────────────

function str(val: unknown): string | undefined {
  if (typeof val === 'string' && val.length > 0) return val;
  return undefined;
}
