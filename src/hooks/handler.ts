/**
 * ⏱️🦀 Clawck — Hook Handler
 * Core orchestrator: wires platform adapters → clawck core → session files.
 */

import { ClawckConfig } from '../core/types';
import { Clawck } from '../core/clawck';
import { HookContext } from './types';
import { saveSession, loadSession, clearSession, cleanStaleSessions } from './session';
import { logger } from '../core/logger';
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
    // If a session already exists for this session_id, skip creating a new entry.
    // Claude Code fires UserPromptSubmit on every prompt, but session_id stays the
    // same for the entire conversation. We only want one entry per conversation.
    const existing = loadSession(config.data_dir, context.session_id);
    if (existing) {
      logger.debug('hooks', `Session ${context.session_id.slice(0, 8)} already active, skipping start`);
      return;
    }

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

      logger.info('hooks', `Started ${entry.id.slice(0, 8)} (${context.platform})`);

      // Opportunistic cleanup of stale sessions
      cleanStaleSessions(config.data_dir);
    } finally {
      clawck.close();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('hooks', `Hook start error: ${msg}`);
    logError(config.data_dir, `start error: ${msg}`);
  }
}

export async function handleHookStop(config: ClawckConfig, context: HookContext): Promise<void> {
  try {
    const session = loadSession(config.data_dir, context.session_id);
    if (!session) {
      logger.debug('hooks', 'Stop skipped — session already stopped or not started');
      return;
    }

    const rawKeys = context.raw && typeof context.raw === 'object' ? Object.keys(context.raw as Record<string, unknown>).join(',') : '(none)';
    logger.debug('hooks', `Stop context: tokens_in=${context.tokens_in} tokens_out=${context.tokens_out} cost_usd=${context.cost_usd} tool_calls=${context.tool_calls} agent_runtime_ms=${context.agent_runtime_ms} | raw_keys=[${rawKeys}]`);

    const clawck = await new Clawck(config).ready();

    try {
      const entry = clawck.stop({
        id: session.entry_id,
        status: 'completed',
        tokens_in: context.tokens_in,
        tokens_out: context.tokens_out,
        cost_usd: context.cost_usd,
        tool_calls: context.tool_calls,
        agent_runtime_ms: context.agent_runtime_ms,
      });

      clearSession(config.data_dir, context.session_id);

      if (entry && entry.end) {
        const durationMs = new Date(entry.end).getTime() - new Date(entry.start).getTime();
        const durationMin = (durationMs / 60000).toFixed(1);
        logger.info('hooks', `Stopped ${entry.id.slice(0, 8)} (${durationMin}m)`);
      }
    } finally {
      clawck.close();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('hooks', `Hook stop error: ${msg}`);
    logError(config.data_dir, `stop error: ${msg}`);
  }
}
