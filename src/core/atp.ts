/**
 * ⏱️🦀 Clawck — Agentic Time Protocol (ATP)
 * Validation, migration, and export/import for ATP v0.2.
 */

import { ClawckEntry, SPEC_VERSION, TASK_CATEGORIES, TaskCategory } from './types';
import { IndustryBenchmark } from './benchmarks';
import { PersonalBaseline } from './personal';

export interface ATPExportEnvelope {
  atp_version: string;
  generated_at: string;
  source_tool: string;
  source_version: string;
  entries: ClawckEntry[];
  benchmarks?: IndustryBenchmark[];
  personal_baselines?: PersonalBaseline[];
}

export interface EntryComparison {
  industry_benchmark_minutes?: number;
  industry_source?: string;
  personal_benchmark_minutes?: number;
  agent_runtime_minutes: number;
  wall_clock_minutes: number;
}

const REQUIRED_FIELDS = ['id', 'agent', 'model', 'client', 'project', 'task', 'category', 'start', 'status'] as const;
const VALID_STATUSES = ['running', 'completed', 'failed', 'paused'];

export function validateEntry(entry: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['Entry must be a non-null object'] };
  }
  const e = entry as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (e[field] === undefined || e[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof e.id === 'string' && e.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (e.category && !TASK_CATEGORIES.includes(e.category as TaskCategory)) {
    errors.push(`Invalid category: ${e.category}. Must be one of: ${TASK_CATEGORIES.join(', ')}`);
  }
  if (e.status && !VALID_STATUSES.includes(e.status as string)) {
    errors.push(`Invalid status: ${e.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (e.start && typeof e.start === 'string') {
    if (isNaN(Date.parse(e.start))) {
      errors.push('start must be a valid ISO 8601 timestamp');
    }
  }
  if (e.end !== null && e.end !== undefined && typeof e.end === 'string') {
    if (isNaN(Date.parse(e.end))) {
      errors.push('end must be a valid ISO 8601 timestamp or null');
    }
  }
  if (e.tokens_in !== undefined && (typeof e.tokens_in !== 'number' || e.tokens_in < 0)) {
    errors.push('tokens_in must be a non-negative number');
  }
  if (e.tokens_out !== undefined && (typeof e.tokens_out !== 'number' || e.tokens_out < 0)) {
    errors.push('tokens_out must be a non-negative number');
  }
  if (e.agent_runtime_ms !== undefined && e.agent_runtime_ms !== null) {
    if (typeof e.agent_runtime_ms !== 'number' || e.agent_runtime_ms < 0) {
      errors.push('agent_runtime_ms must be a non-negative number');
    }
  }
  if (e.wall_clock_ms !== undefined && e.wall_clock_ms !== null) {
    if (typeof e.wall_clock_ms !== 'number' || e.wall_clock_ms < 0) {
      errors.push('wall_clock_ms must be a non-negative number');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function migrateV1toV2(entry: ClawckEntry): ClawckEntry {
  const migrated = { ...entry };
  migrated.spec_version = SPEC_VERSION;

  // Fill new v0.2 fields with defaults if missing
  if ((migrated as any).agent_runtime_ms === undefined) {
    (migrated as any).agent_runtime_ms = null;
  }
  if ((migrated as any).wall_clock_ms === undefined) {
    if (migrated.end) {
      (migrated as any).wall_clock_ms = new Date(migrated.end).getTime() - new Date(migrated.start).getTime();
    } else {
      (migrated as any).wall_clock_ms = null;
    }
  }

  return migrated;
}

export function exportATP(
  entries: ClawckEntry[],
  benchmarks?: IndustryBenchmark[],
  personalBaselines?: PersonalBaseline[]
): ATPExportEnvelope {
  return {
    atp_version: SPEC_VERSION,
    generated_at: new Date().toISOString(),
    source_tool: 'clawck',
    source_version: '0.4.0',
    entries: entries.map(e => migrateV1toV2(e)),
    ...(benchmarks ? { benchmarks } : {}),
    ...(personalBaselines ? { personal_baselines: personalBaselines } : {}),
  };
}

export function importATP(envelope: ATPExportEnvelope): ClawckEntry[] {
  if (!envelope || !Array.isArray(envelope.entries)) {
    throw new Error('Invalid ATP envelope: missing entries array');
  }
  return envelope.entries.map(e => migrateV1toV2(e));
}
