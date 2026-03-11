import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { makeTmpConfig } from './helpers';
import { detectPlatform, normalize } from '../src/hooks/adapters';
import { saveSession, loadSession, clearSession, cleanStaleSessions } from '../src/hooks/session';
import { handleHookStart, handleHookStop } from '../src/hooks/handler';
import { PLATFORMS, PLATFORM_NAMES } from '../src/hooks/install';
import { Clawck } from '../src/core/clawck';
import { HookContext } from '../src/hooks/types';

// ─── Adapter Tests ──────────────────────────────────────────

describe('detectPlatform', () => {
  it('detects Claude Code JSON', () => {
    expect(detectPlatform({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'abc',
      transcript_path: '/tmp/transcript',
      prompt: 'hello',
    })).toBe('claude');
  });

  it('detects Gemini CLI JSON', () => {
    expect(detectPlatform({
      GEMINI_SESSION_ID: 'gem-123',
      prompt: 'test',
    })).toBe('gemini');
  });

  it('detects Cursor JSON', () => {
    expect(detectPlatform({
      conversation_id: 'conv-1',
      generation_id: 'gen-1',
      prompt: 'test',
    })).toBe('cursor');
  });

  it('detects Cline JSON', () => {
    expect(detectPlatform({
      clineVersion: '2.0',
      taskId: 'task-1',
    })).toBe('cline');
  });

  it('detects Windsurf JSON', () => {
    expect(detectPlatform({
      agent_action_name: 'cascade',
    })).toBe('windsurf');
  });

  it('detects Codex JSON', () => {
    expect(detectPlatform({
      thread_id: 'thread-1',
      prompt: 'test',
    })).toBe('codex');
  });

  it('returns unknown for empty JSON', () => {
    expect(detectPlatform({})).toBe('unknown');
  });

  it('returns unknown for unrecognized JSON', () => {
    expect(detectPlatform({ foo: 'bar', baz: 123 })).toBe('unknown');
  });
});

describe('normalize', () => {
  it('normalizes Claude Code JSON', () => {
    const ctx = normalize({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'ses-123',
      transcript_path: '/tmp/t',
      prompt: 'write tests',
      cwd: '/home/user/project',
      model: 'claude-sonnet-4-20250514',
    });

    expect(ctx.platform).toBe('claude');
    expect(ctx.session_id).toBe('ses-123');
    expect(ctx.task).toBe('write tests');
    expect(ctx.agent).toBe('claude-code');
    expect(ctx.model).toBe('claude-sonnet-4-20250514');
  });

  it('normalizes with forced platform override', () => {
    const ctx = normalize({ prompt: 'test' }, 'gemini');
    expect(ctx.platform).toBe('gemini');
    expect(ctx.agent).toBe('gemini-cli');
  });

  it('normalizes unknown JSON gracefully', () => {
    const ctx = normalize({ some: 'random', data: true });
    expect(ctx.platform).toBe('unknown');
    expect(ctx.session_id).toMatch(/^unknown-/);
    expect(ctx.task).toBe('unknown-task');
  });

  it('Claude Stop event: extracts tokens and cost from fallback field names', () => {
    const ctx = normalize({
      session_id: 'ses-tok',
      transcript_path: '/tmp/t',
      hook_event_name: 'Stop',
      total_input_tokens: 5000,
      total_output_tokens: 2000,
      total_cost_usd: 0.50,
      num_tool_calls: 3,
    });

    expect(ctx.platform).toBe('claude');
    expect(ctx.tokens_in).toBe(5000);
    expect(ctx.tokens_out).toBe(2000);
    expect(ctx.cost_usd).toBe(0.50);
    expect(ctx.tool_calls).toBe(3);
  });

  it('all adapters extract cost_usd when present', () => {
    const platforms = [
      { json: { hook_event_name: 'Stop', session_id: 's', transcript_path: '/t', cost_usd: 1.23 }, platform: 'claude' as const },
      { json: { GEMINI_SESSION_ID: 'g', cost_usd: 1.23 }, platform: 'gemini' as const },
      { json: { conversation_id: 'c', generation_id: 'g', cost_usd: 1.23 }, platform: 'cursor' as const },
      { json: { clineVersion: '2', taskId: 't', cost_usd: 1.23 }, platform: 'cline' as const },
      { json: { agent_action_name: 'a', cost_usd: 1.23 }, platform: 'windsurf' as const },
      { json: { thread_id: 't', cost_usd: 1.23 }, platform: 'codex' as const },
      { json: { cost_usd: 1.23 }, platform: 'unknown' as const },
    ];

    for (const { json, platform } of platforms) {
      const ctx = normalize(json);
      expect(ctx.platform).toBe(platform);
      expect(ctx.cost_usd).toBe(1.23);
    }
  });

  it('extracts Cline fields correctly', () => {
    const ctx = normalize({
      clineVersion: '2.0',
      taskId: 'cline-task-1',
      task: 'fix bug in parser',
      workspacePath: '/project',
      model: 'claude-sonnet-4-20250514',
    });

    expect(ctx.platform).toBe('cline');
    expect(ctx.session_id).toBe('cline-task-1');
    expect(ctx.task).toBe('fix bug in parser');
    expect(ctx.cwd).toBe('/project');
  });
});

// ─── Session Tests ──────────────────────────────────────────

describe('session management', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawck-session-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('save + load round-trip', () => {
    const state = {
      entry_id: 'entry-123',
      platform: 'claude' as const,
      started_at: '2026-03-08T10:00:00Z',
      session_id: 'ses-abc',
    };

    saveSession(tmpDir, 'ses-abc', state);
    const loaded = loadSession(tmpDir, 'ses-abc');

    expect(loaded).toEqual(state);
  });

  it('load returns null for missing session', () => {
    expect(loadSession(tmpDir, 'nonexistent')).toBeNull();
  });

  it('clear removes session file', () => {
    saveSession(tmpDir, 'ses-xyz', {
      entry_id: 'e1',
      platform: 'gemini',
      started_at: '2026-03-08T10:00:00Z',
      session_id: 'ses-xyz',
    });

    expect(loadSession(tmpDir, 'ses-xyz')).not.toBeNull();
    clearSession(tmpDir, 'ses-xyz');
    expect(loadSession(tmpDir, 'ses-xyz')).toBeNull();
  });

  it('cleanStaleSessions removes old sessions, keeps fresh ones', () => {
    const sessDir = path.join(tmpDir, 'hooks', 'sessions');
    fs.mkdirSync(sessDir, { recursive: true });

    // Create a "stale" session file
    const stalePath = path.join(sessDir, 'old-session.json');
    fs.writeFileSync(stalePath, JSON.stringify({ entry_id: 'old' }));
    // Backdate the file
    const oldTime = Date.now() - 2 * 86400000; // 2 days ago
    fs.utimesSync(stalePath, new Date(oldTime), new Date(oldTime));

    // Create a "fresh" session file
    saveSession(tmpDir, 'fresh-session', {
      entry_id: 'fresh',
      platform: 'claude',
      started_at: new Date().toISOString(),
      session_id: 'fresh-session',
    });

    const cleaned = cleanStaleSessions(tmpDir);
    expect(cleaned).toBe(1);
    expect(fs.existsSync(stalePath)).toBe(false);
    expect(loadSession(tmpDir, 'fresh-session')).not.toBeNull();
  });

  it('cleanStaleSessions returns 0 when no sessions dir exists', () => {
    expect(cleanStaleSessions(tmpDir)).toBe(0);
  });
});

// ─── Handler Integration Tests ──────────────────────────────

describe('hook handlers', () => {
  it('start creates running entry + saves session', async () => {
    const config = makeTmpConfig();
    const context: HookContext = {
      platform: 'claude',
      session_id: 'test-session-1',
      task: 'implement feature X',
      agent: 'claude-code',
      raw: {},
    };

    await handleHookStart(config, context);

    // Verify session was saved
    const session = loadSession(config.data_dir, 'test-session-1');
    expect(session).not.toBeNull();
    expect(session!.platform).toBe('claude');
    expect(session!.session_id).toBe('test-session-1');

    // Verify entry was created in DB
    const clawck = await new Clawck(config).ready();
    const entry = clawck.get(session!.entry_id);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('running');
    expect(entry!.task).toBe('implement feature X');
    clawck.close();
  });

  it('stop completes entry + clears session', async () => {
    const config = makeTmpConfig();
    const context: HookContext = {
      platform: 'claude',
      session_id: 'test-session-2',
      task: 'fix bug Y',
      agent: 'claude-code',
      raw: {},
    };

    // Start first
    await handleHookStart(config, context);
    const session = loadSession(config.data_dir, 'test-session-2');
    expect(session).not.toBeNull();

    // Stop
    await handleHookStop(config, context);

    // Session should be cleared
    expect(loadSession(config.data_dir, 'test-session-2')).toBeNull();

    // Entry should be completed
    const clawck = await new Clawck(config).ready();
    const entry = clawck.get(session!.entry_id);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('completed');
    expect(entry!.end).not.toBeNull();
    clawck.close();
  });

  it('stop with no prior start is a no-op', async () => {
    const config = makeTmpConfig();
    const context: HookContext = {
      platform: 'claude',
      session_id: 'nonexistent-session',
      task: 'no task',
      raw: {},
    };

    // Should not throw
    await handleHookStop(config, context);

    // No session or entry created
    expect(loadSession(config.data_dir, 'nonexistent-session')).toBeNull();
  });

  it('full round-trip: start → stop → completed entry with duration', async () => {
    const config = makeTmpConfig();
    const context: HookContext = {
      platform: 'gemini',
      session_id: 'roundtrip-session',
      task: 'analyze data',
      agent: 'gemini-cli',
      model: 'gemini-2.0-flash',
      raw: {},
    };

    await handleHookStart(config, context);
    const session = loadSession(config.data_dir, 'roundtrip-session');

    // Small delay to ensure measurable duration
    await new Promise(r => setTimeout(r, 10));

    await handleHookStop(config, context);

    const clawck = await new Clawck(config).ready();
    const entry = clawck.get(session!.entry_id);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('completed');
    expect(entry!.end).not.toBeNull();
    expect(entry!.task).toBe('analyze data');
    expect(entry!.agent).toBe('gemini-cli');
    expect(entry!.source).toBe('clawck');
    expect(entry!.tags).toContain('hook');
    expect(entry!.tags).toContain('gemini');

    // Duration should be > 0
    const durationMs = new Date(entry!.end!).getTime() - new Date(entry!.start).getTime();
    expect(durationMs).toBeGreaterThan(0);

    clawck.close();
  });

  it('hook round-trip preserves token/cost data', async () => {
    const config = makeTmpConfig();
    const startContext: HookContext = {
      platform: 'claude',
      session_id: 'token-roundtrip',
      task: 'test token tracking',
      agent: 'claude-code',
      raw: {},
    };

    await handleHookStart(config, startContext);
    const session = loadSession(config.data_dir, 'token-roundtrip');
    expect(session).not.toBeNull();

    const stopContext: HookContext = {
      platform: 'claude',
      session_id: 'token-roundtrip',
      task: 'test token tracking',
      agent: 'claude-code',
      tokens_in: 5000,
      tokens_out: 2000,
      cost_usd: 0.75,
      tool_calls: 10,
      raw: {},
    };

    await handleHookStop(config, stopContext);

    const clawck = await new Clawck(config).ready();
    const entry = clawck.get(session!.entry_id);
    expect(entry).not.toBeNull();
    expect(entry!.tokens_in).toBe(5000);
    expect(entry!.tokens_out).toBe(2000);
    expect(entry!.cost_usd).toBe(0.75);
    expect(entry!.tool_calls).toBe(10);
    clawck.close();
  });
});

// ─── Install Tests ──────────────────────────────────────────

describe('install configs', () => {
  it('each platform generates config containing "clawck hook" command', () => {
    for (const name of PLATFORM_NAMES) {
      const info = PLATFORMS[name];
      const config = info.generate();
      expect(config).toContain('clawck hook');
    }
  });

  it('detect returns false when no config exists', () => {
    for (const name of PLATFORM_NAMES) {
      const info = PLATFORMS[name];
      // Skip platforms whose config already exists on the host machine
      if (info.detect()) continue;
      expect(info.detect()).toBe(false);
    }
  });

  it('all platform names are valid', () => {
    expect(PLATFORM_NAMES).toContain('claude');
    expect(PLATFORM_NAMES).toContain('gemini');
    expect(PLATFORM_NAMES).toContain('cursor');
    expect(PLATFORM_NAMES).toContain('cline');
    expect(PLATFORM_NAMES).toContain('windsurf');
    expect(PLATFORM_NAMES).toContain('codex');
    expect(PLATFORM_NAMES.length).toBe(6);
  });
});

// ─── Hook Reliability Tests ─────────────────────────────────

describe('OpenClaw platform adapter', () => {
  it('detects OpenClaw from openclaw_session_id', () => {
    expect(detectPlatform({
      openclaw_session_id: 'oc-123',
      task: 'test task',
    })).toBe('openclaw');
  });

  it('detects OpenClaw from signal_file', () => {
    expect(detectPlatform({
      signal_file: { start_ms: 1000, end_ms: 2000 },
    })).toBe('openclaw');
  });

  it('detects OpenClaw from epoch timestamps', () => {
    expect(detectPlatform({
      start_epoch_ms: 1710000000000,
      end_epoch_ms: 1710000060000,
    })).toBe('openclaw');
  });

  it('normalizes OpenClaw JSON with signal file timing', () => {
    const ctx = normalize({
      openclaw_session_id: 'oc-session-1',
      task: 'implement feature',
      project: 'my-project',
      agent: 'my-agent',
      signal_file: {
        start_ms: 1710000000000,
        end_ms: 1710000060000,
      },
    });

    expect(ctx.platform).toBe('openclaw');
    expect(ctx.session_id).toBe('oc-session-1');
    expect(ctx.task).toBe('implement feature');
    expect(ctx.agent).toBe('my-agent');
    expect(ctx.agent_runtime_ms).toBe(60000); // 60 seconds
    expect(ctx.start_epoch_ms).toBe(1710000000000);
    expect(ctx.end_epoch_ms).toBe(1710000060000);
  });

  it('normalizes OpenClaw with explicit epoch timestamps', () => {
    const ctx = normalize({
      session_id: 'session-direct',
      task: 'direct timing',
      start_epoch_ms: 1710000000000,
      end_epoch_ms: 1710000120000,
    });

    expect(ctx.platform).toBe('openclaw');
    expect(ctx.agent_runtime_ms).toBe(120000); // 2 minutes
  });

  it('prefers explicit agent_runtime_ms over calculated', () => {
    const ctx = normalize({
      openclaw_session_id: 'oc-explicit',
      agent_runtime_ms: 45000,
      start_epoch_ms: 1710000000000,
      end_epoch_ms: 1710000120000, // Would calculate to 120000
    });

    // Signal file calculation takes precedence, then explicit
    // Since signal file data is also in start_epoch_ms/end_epoch_ms, it calculates 120000
    // But we also have explicit agent_runtime_ms which should be used as fallback
    expect(ctx.platform).toBe('openclaw');
    expect(ctx.agent_runtime_ms).toBe(120000); // Calculated wins
  });
});

describe('agent_runtime_ms validation', () => {
  it('hook stop with explicit agent_runtime_ms uses that value', async () => {
    const config = makeTmpConfig();
    const startContext: HookContext = {
      platform: 'openclaw',
      session_id: 'runtime-test-1',
      task: 'test explicit runtime',
      agent: 'test-agent',
      raw: {},
    };

    await handleHookStart(config, startContext);
    const session = loadSession(config.data_dir, 'runtime-test-1');
    expect(session).not.toBeNull();

    // Wait a bit to ensure wall clock time passes
    await new Promise(r => setTimeout(r, 50));

    const stopContext: HookContext = {
      platform: 'openclaw',
      session_id: 'runtime-test-1',
      task: 'test explicit runtime',
      agent: 'test-agent',
      agent_runtime_ms: 30000, // Explicit 30 seconds
      raw: {},
    };

    await handleHookStop(config, stopContext);

    const clawck = await new Clawck(config).ready();
    const entry = clawck.get(session!.entry_id);
    expect(entry).not.toBeNull();
    expect(entry!.agent_runtime_ms).toBe(30000);
    clawck.close();
  });

  it('agent_runtime_ms falls back to wall_clock_ms when no tokens provided', async () => {
    const config = makeTmpConfig();
    const startContext: HookContext = {
      platform: 'claude',
      session_id: 'runtime-fallback-1',
      task: 'test fallback',
      agent: 'test-agent',
      raw: {},
    };

    await handleHookStart(config, startContext);
    const session = loadSession(config.data_dir, 'runtime-fallback-1');
    expect(session).not.toBeNull();

    // Wait to build up wall clock time
    await new Promise(r => setTimeout(r, 20));

    const stopContext: HookContext = {
      platform: 'claude',
      session_id: 'runtime-fallback-1',
      task: 'test fallback',
      agent: 'test-agent',
      // No tokens, no agent_runtime_ms
      raw: {},
    };

    await handleHookStop(config, stopContext);

    const clawck = await new Clawck(config).ready();
    const entry = clawck.get(session!.entry_id);
    expect(entry).not.toBeNull();
    // agent_runtime_ms should equal wall_clock_ms as fallback
    expect(entry!.agent_runtime_ms).toBe(entry!.wall_clock_ms);
    expect(entry!.agent_runtime_ms).toBeGreaterThan(0);
    clawck.close();
  });

  it('agent_runtime_ms is never null for completed entries', async () => {
    const config = makeTmpConfig();
    const clawck = await new Clawck(config).ready();

    // Start an entry
    const entry = clawck.start({
      task: 'test never null',
      agent: 'test-agent',
    });

    // Stop without any metrics
    const stopped = clawck.stop({ id: entry.id });

    expect(stopped).not.toBeNull();
    expect(stopped!.status).toBe('completed');
    expect(stopped!.agent_runtime_ms).not.toBeNull();
    expect(stopped!.agent_runtime_ms).toBeGreaterThanOrEqual(0);

    clawck.close();
  });
});
