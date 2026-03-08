import fs from 'fs';
import path from 'path';
import os from 'os';
import { ClawckEntry, ClawckConfig, DEFAULT_CONFIG, SPEC_VERSION } from '../src/core/types';

export function makeTmpConfig(overrides: Partial<ClawckConfig> = {}): ClawckConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawck-test-'));
  return { ...DEFAULT_CONFIG, data_dir: dir, ...overrides };
}

export function makeEntry(overrides: Partial<ClawckEntry> = {}): ClawckEntry {
  return {
    id: overrides.id || `test-${Math.random().toString(36).slice(2)}`,
    agent: 'test-agent',
    model: 'test-model',
    client: 'test-client',
    project: 'test-project',
    task: 'test task',
    category: 'code',
    start: '2026-03-07T10:00:00.000Z',
    end: '2026-03-07T11:00:00.000Z',
    status: 'completed',
    tokens_in: 100,
    tokens_out: 200,
    cost_usd: 0.01,
    tool_calls: 5,
    summary: 'test summary',
    tags: ['test'],
    source: 'test',
    spec_version: SPEC_VERSION,
    ...overrides,
  };
}
