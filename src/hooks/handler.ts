/**
 * ⏱️🦀 Clawck — Hook Handler
 * Core orchestrator: wires platform adapters → clawck core → session files.
 */

import { ClawckConfig } from '../core/types';
import { Clawck } from '../core/clawck';
import { HookContext } from './types';
import { saveSession, loadSession, clearSession, cleanStaleSessions } from './session';
import fs from 'fs';
import path from 'path';

function logError(dataDir: string, message: string): void {
  try {
    const logDir = path.join(dataDir, 'hooks');
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'hook-errors.log');
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logPath, line);
  } catch {
    // Can't even log — give up silently
  }
}

export async function handleHookStart(config: ClawckConfig, context: HookContext): Promise<void> {
  try {
    const clawck = await new Clawck(config).ready();

    try {
      const entry = clawck.start({
        task: context.task,
        project: context.project,
        client: undefined,
        agent: context.agent,
        model: context.model,
        tags: ['hook', context.platform],
      });

      saveSession(config.data_dir, context.session_id, {
        entry_id: entry.id,
        platform: context.platform,
        started_at: entry.start,
        session_id: context.session_id,
      });

      process.stderr.write(`clawck: started ${entry.id.slice(0, 8)} (${context.platform})\n`);

      // Opportunistic cleanup of stale sessions
      cleanStaleSessions(config.data_dir);
    } finally {
      clawck.close();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`clawck: hook start error: ${msg}\n`);
    logError(config.data_dir, `start error: ${msg}`);
  }
}

export async function handleHookStop(config: ClawckConfig, context: HookContext): Promise<void> {
  try {
    const session = loadSession(config.data_dir, context.session_id);
    if (!session) {
      process.stderr.write(`clawck: stop skipped — session already stopped or not started (expected if hooks fire multiple times per session)\n`);
      return;
    }

    const clawck = await new Clawck(config).ready();

    try {
      const entry = clawck.stop({
        id: session.entry_id,
        status: 'completed',
        tokens_in: context.tokens_in,
        tokens_out: context.tokens_out,
        tool_calls: context.tool_calls,
      });

      clearSession(config.data_dir, context.session_id);

      if (entry && entry.end) {
        const durationMs = new Date(entry.end).getTime() - new Date(entry.start).getTime();
        const durationMin = (durationMs / 60000).toFixed(1);
        process.stderr.write(`clawck: stopped ${entry.id.slice(0, 8)} (${durationMin}m)\n`);
      }
    } finally {
      clawck.close();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`clawck: hook stop error: ${msg}\n`);
    logError(config.data_dir, `stop error: ${msg}`);
  }
}
