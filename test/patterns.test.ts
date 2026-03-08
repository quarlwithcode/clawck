import { describe, it, expect, afterEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { DEFAULT_PATTERNS } from '../src/core/patterns';
import { makeTmpConfig } from './helpers';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
});

async function setup(configOverrides = {}) {
  clawck = await new Clawck(makeTmpConfig(configOverrides)).ready();
  return clawck;
}

describe('Tracking Patterns', () => {
  it('returns DEFAULT_PATTERNS when no config patterns set', async () => {
    const c = await setup();
    const patterns = c.getPatterns();
    expect(patterns).toEqual(DEFAULT_PATTERNS);
    expect(patterns.length).toBe(5);
  });

  it('returns config patterns when set', async () => {
    const custom = [{ name: 'custom', category: 'code' as const }];
    const c = await setup({ patterns: custom });
    expect(c.getPatterns()).toEqual(custom);
  });

  it('getPattern returns pattern by name', async () => {
    const c = await setup();
    const pat = c.getPattern('code-review');
    expect(pat).toBeDefined();
    expect(pat!.category).toBe('code');
    expect(pat!.tags).toEqual(['review']);
  });

  it('getPattern returns undefined for unknown name', async () => {
    const c = await setup();
    expect(c.getPattern('nonexistent')).toBeUndefined();
  });

  it('pattern fields merge into start() as defaults', async () => {
    const c = await setup({
      patterns: [{ name: 'test-pat', category: 'research', project: 'pat-project', client: 'pat-client', tags: ['from-pattern'] }],
    });
    const entry = c.start({ task: 'test', pattern: 'test-pat' });
    expect(entry.category).toBe('research');
    expect(entry.project).toBe('pat-project');
    expect(entry.client).toBe('pat-client');
    expect(entry.tags).toEqual(['from-pattern']);
  });

  it('explicit fields override pattern fields', async () => {
    const c = await setup({
      patterns: [{ name: 'test-pat', category: 'research', project: 'pat-project' }],
    });
    const entry = c.start({ task: 'test', pattern: 'test-pat', category: 'code', project: 'my-project' });
    expect(entry.category).toBe('code');
    expect(entry.project).toBe('my-project');
  });

  it('pattern works with log() too', async () => {
    const c = await setup({
      patterns: [{ name: 'test-pat', category: 'testing', tags: ['automated'] }],
    });
    const entry = c.log({ task: 'test log', duration_minutes: 10, pattern: 'test-pat' });
    expect(entry.category).toBe('testing');
    expect(entry.tags).toEqual(['automated']);
  });

  it('default_pattern is used when no pattern specified', async () => {
    const c = await setup({
      patterns: [{ name: 'auto', category: 'analysis', project: 'auto-proj' }],
      default_pattern: 'auto',
    });
    const entry = c.start({ task: 'auto test' });
    expect(entry.category).toBe('analysis');
    expect(entry.project).toBe('auto-proj');
  });
});
