/**
 * ⏱️🦀 Clawck — Agent Runtime Estimation
 * Estimates actual agent processing time from token counts and tool calls.
 */

export interface RuntimeEstimatorConfig {
  model_tokens_per_second: Record<string, number>;
  default_tokens_per_second: number;
  avg_tool_duration_ms: number;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeEstimatorConfig = {
  model_tokens_per_second: {
    'claude-sonnet-4': 80,
    'claude-opus-4': 40,
    'claude-haiku-4': 150,
    'gpt-4o': 100,
    'gpt-4o-mini': 130,
    'gemini-2.0-flash': 120,
  },
  default_tokens_per_second: 80,
  avg_tool_duration_ms: 2000,
};

export function estimateAgentRuntime(
  entry: { tokens_out: number; model: string; tool_calls: number },
  config: RuntimeEstimatorConfig = DEFAULT_RUNTIME_CONFIG
): number {
  const tokensPerSec = findModelSpeed(entry.model, config);
  const tokenTimeMs = tokensPerSec > 0 ? (entry.tokens_out / tokensPerSec) * 1000 : 0;
  const toolTimeMs = entry.tool_calls * config.avg_tool_duration_ms;
  return Math.round(tokenTimeMs + toolTimeMs);
}

export function calculateWallClock(start: string, end: string): number {
  return new Date(end).getTime() - new Date(start).getTime();
}

/**
 * Merge overlapping time intervals and return the total merged duration in ms.
 * This reveals parallelization: if 3 agents run concurrently for 30min each,
 * total runtime is 90min but merged runtime is 30min.
 */
export function computeMergedRuntimeMs(entries: Array<{ start: string; end: string | null }>): number {
  if (entries.length === 0) return 0;

  // Convert to [startMs, endMs] intervals
  const intervals = entries.map(e => {
    const startMs = new Date(e.start).getTime();
    const endMs = e.end ? new Date(e.end).getTime() : Date.now();
    return [startMs, endMs] as [number, number];
  });

  // Sort by start time
  intervals.sort((a, b) => a[0] - b[0]);

  // Merge overlapping intervals
  const merged: [number, number][] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const curr = intervals[i];
    if (curr[0] <= last[1]) {
      // Overlapping — extend the end
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }

  // Sum merged interval durations
  return merged.reduce((sum, [start, end]) => sum + (end - start), 0);
}

function findModelSpeed(model: string, config: RuntimeEstimatorConfig): number {
  // Exact match first
  if (config.model_tokens_per_second[model]) {
    return config.model_tokens_per_second[model];
  }
  // Prefix match (e.g., 'claude-sonnet-4-20250514' matches 'claude-sonnet-4')
  for (const [key, speed] of Object.entries(config.model_tokens_per_second)) {
    if (model.startsWith(key)) return speed;
  }
  return config.default_tokens_per_second;
}
