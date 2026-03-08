import { describe, it, expect } from 'vitest';
import { validateEntry, migrateV1toV2, exportATP, importATP } from '../src/core/atp';
import { SPEC_VERSION } from '../src/core/types';
import { makeEntry } from './helpers';

describe('ATP Validation', () => {
  it('valid entry passes validation', () => {
    const entry = makeEntry();
    const result = validateEntry(entry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('invalid entry (missing required fields) fails with errors', () => {
    const result = validateEntry({ id: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('agent'))).toBe(true);
  });

  it('null input fails', () => {
    const result = validateEntry(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('non-null object');
  });

  it('invalid category fails', () => {
    const entry = makeEntry({ category: 'invalid' as any });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid category'))).toBe(true);
  });

  it('invalid status fails', () => {
    const entry = makeEntry({ status: 'banana' as any });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid status'))).toBe(true);
  });

  it('negative tokens_in fails', () => {
    const entry = makeEntry({ tokens_in: -5 });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
  });

  it('valid agent_runtime_ms passes', () => {
    const entry = { ...makeEntry(), agent_runtime_ms: 5000 };
    const result = validateEntry(entry);
    expect(result.valid).toBe(true);
  });

  it('negative agent_runtime_ms fails', () => {
    const entry = { ...makeEntry(), agent_runtime_ms: -100 };
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
  });
});

describe('ATP Migration', () => {
  it('v1 to v2 migration fills defaults', () => {
    const v1Entry = makeEntry();
    // Remove v0.2 fields to simulate v1
    delete (v1Entry as any).agent_runtime_ms;
    delete (v1Entry as any).wall_clock_ms;

    const migrated = migrateV1toV2(v1Entry);
    expect(migrated.spec_version).toBe(SPEC_VERSION);
    expect((migrated as any).agent_runtime_ms).toBeNull();
    // wall_clock_ms should be calculated from start/end
    expect((migrated as any).wall_clock_ms).toBeGreaterThan(0);
  });

  it('preserves existing v0.2 fields', () => {
    const entry = { ...makeEntry(), agent_runtime_ms: 5000, wall_clock_ms: 3600000 };
    const migrated = migrateV1toV2(entry);
    expect((migrated as any).agent_runtime_ms).toBe(5000);
    expect((migrated as any).wall_clock_ms).toBe(3600000);
  });
});

describe('ATP Export/Import', () => {
  it('export envelope has correct structure', () => {
    const entries = [makeEntry(), makeEntry({ id: 'test-2' })];
    const envelope = exportATP(entries);

    expect(envelope.atp_version).toBe(SPEC_VERSION);
    expect(envelope.generated_at).toBeTruthy();
    expect(envelope.source_tool).toBe('clawck');
    expect(envelope.source_version).toBe('0.4.0');
    expect(envelope.entries).toHaveLength(2);
  });

  it('export with benchmarks includes them', () => {
    const envelope = exportATP([makeEntry()], [
      { category: 'code', task_type: 'test', human_median_minutes: 30, human_p25_minutes: 15, human_p75_minutes: 60, source: 'test', year: 2023 },
    ]);
    expect(envelope.benchmarks).toHaveLength(1);
  });

  it('import round-trip preserves data', () => {
    const original = [makeEntry({ id: 'roundtrip-1' }), makeEntry({ id: 'roundtrip-2' })];
    const envelope = exportATP(original);
    const imported = importATP(envelope);

    expect(imported).toHaveLength(2);
    expect(imported[0].id).toBe('roundtrip-1');
    expect(imported[1].id).toBe('roundtrip-2');
    expect(imported[0].task).toBe(original[0].task);
  });

  it('import invalid envelope throws', () => {
    expect(() => importATP({} as any)).toThrow('Invalid ATP envelope');
  });

  it('schema version is correct', () => {
    expect(SPEC_VERSION).toBe('0.2.0');
  });
});
