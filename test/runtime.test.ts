import { describe, it, expect } from 'vitest';
import { estimateAgentRuntime, calculateWallClock, DEFAULT_RUNTIME_CONFIG } from '../src/core/runtime';

describe('Agent Runtime Estimation', () => {
  it('known model at known speed produces correct estimate', () => {
    // claude-sonnet-4 = 80 tokens/sec
    const ms = estimateAgentRuntime({
      tokens_out: 800,
      model: 'claude-sonnet-4',
      tool_calls: 0,
    });
    // 800 tokens / 80 tps = 10 seconds = 10000ms
    expect(ms).toBe(10000);
  });

  it('prefix-matches model names with version suffixes', () => {
    const ms = estimateAgentRuntime({
      tokens_out: 800,
      model: 'claude-sonnet-4-20250514',
      tool_calls: 0,
    });
    expect(ms).toBe(10000);
  });

  it('unknown model uses default speed', () => {
    // default = 80 tokens/sec
    const ms = estimateAgentRuntime({
      tokens_out: 160,
      model: 'some-custom-model',
      tool_calls: 0,
    });
    // 160 / 80 = 2 seconds = 2000ms
    expect(ms).toBe(2000);
  });

  it('tool calls add expected time', () => {
    const ms = estimateAgentRuntime({
      tokens_out: 0,
      model: 'claude-sonnet-4',
      tool_calls: 3,
    });
    // 3 * 2000ms = 6000ms
    expect(ms).toBe(6000);
  });

  it('combines token time and tool time', () => {
    const ms = estimateAgentRuntime({
      tokens_out: 400,
      model: 'claude-opus-4', // 40 tps
      tool_calls: 2,
    });
    // 400/40 = 10s = 10000ms + 2*2000ms = 4000ms = 14000ms
    expect(ms).toBe(14000);
  });

  it('zero tokens and zero tools = 0ms', () => {
    const ms = estimateAgentRuntime({
      tokens_out: 0,
      model: 'claude-sonnet-4',
      tool_calls: 0,
    });
    expect(ms).toBe(0);
  });

  it('custom config overrides defaults', () => {
    const ms = estimateAgentRuntime(
      { tokens_out: 100, model: 'my-model', tool_calls: 1 },
      {
        model_tokens_per_second: { 'my-model': 50 },
        default_tokens_per_second: 100,
        avg_tool_duration_ms: 500,
      }
    );
    // 100/50 = 2s = 2000ms + 1*500ms = 2500ms
    expect(ms).toBe(2500);
  });
});

describe('Wall Clock Calculation', () => {
  it('calculates milliseconds between ISO timestamps', () => {
    const ms = calculateWallClock(
      '2026-03-07T10:00:00.000Z',
      '2026-03-07T10:30:00.000Z'
    );
    expect(ms).toBe(30 * 60 * 1000);
  });
});
