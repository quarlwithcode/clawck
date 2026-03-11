/**
 * Clawck Hook Handler for OpenClaw
 *
 * Place this file in: ~/.openclaw/hooks/clawck-auto/handler.ts
 *
 * This handler automatically tracks agent work time using Clawck.
 * It fires on agent start/stop events and records timing + metrics.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface HookEvent {
  event: 'agent_start' | 'agent_stop' | 'turn_start' | 'turn_stop';
  session_id: string;
  agent?: string;
  project?: string;
  task?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  tool_calls?: number;
  start_epoch_ms?: number;
  end_epoch_ms?: number;
}

export async function handle(event: HookEvent): Promise<void> {
  const json = JSON.stringify({
    openclaw_session_id: event.session_id,
    session_id: event.session_id,
    task: event.task || `${event.event} - ${event.agent || 'openclaw-agent'}`,
    agent: event.agent || 'openclaw-agent',
    project: event.project,
    model: event.model,
    tokens_in: event.tokens_in,
    tokens_out: event.tokens_out,
    cost_usd: event.cost_usd,
    tool_calls: event.tool_calls,
    start_epoch_ms: event.start_epoch_ms,
    end_epoch_ms: event.end_epoch_ms,
    cwd: process.cwd(),
  });

  const hookCmd = event.event.includes('start') ? 'start' : 'stop';

  try {
    execSync(`echo '${json.replace(/'/g, "'\\''")}' | clawck hook ${hookCmd} --platform openclaw`, {
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 5000,
    });
  } catch {
    // Silent failure — don't block agent operations
  }
}

// Signal file support: read .agent-done file with epoch timestamps
export function readSignalFile(signalPath: string): { start_ms: number; end_ms: number } | null {
  try {
    const content = fs.readFileSync(signalPath, 'utf-8');
    const data = JSON.parse(content);
    if (typeof data.start_ms === 'number' && typeof data.end_ms === 'number') {
      return { start_ms: data.start_ms, end_ms: data.end_ms };
    }
  } catch {
    // Invalid or missing signal file
  }
  return null;
}
