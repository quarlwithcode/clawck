import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLI = path.resolve(__dirname, '../src/cli/index.ts');

function run(args: string, env: Record<string, string> = {}): string {
  return execSync(`npx tsx ${CLI} ${args}`, {
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    timeout: 15000,
  }).trim();
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clawck-dir-test-'));
}

let dirs: string[] = [];

function freshDir(): string {
  const d = tmpDir();
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  dirs = [];
});

describe('Data directory resolution', () => {
  it('subcommand -d still works (backward compat)', () => {
    const dir = freshDir();
    const out = run(`--json start -d ${dir} "sub-flag task"`);
    const entry = JSON.parse(out);
    expect(entry.task).toBe('sub-flag task');
    expect(entry.status).toBe('running');

    // Verify entry is in the right database
    const entries = JSON.parse(run(`--json entries -d ${dir}`));
    expect(entries.some((e: any) => e.id === entry.id)).toBe(true);
  });

  it('program-level -d works (clawck -d /path start "task")', () => {
    const dir = freshDir();
    const out = run(`--json -d ${dir} start "prog-flag task"`);
    const entry = JSON.parse(out);
    expect(entry.task).toBe('prog-flag task');

    // Verify entry is findable via program-level -d
    const entries = JSON.parse(run(`--json -d ${dir} entries`));
    expect(entries.some((e: any) => e.id === entry.id)).toBe(true);
  });

  it('CLAWCK_DIR env var works as fallback', () => {
    const dir = freshDir();
    const out = run(`--json start "env-var task"`, { CLAWCK_DIR: dir });
    const entry = JSON.parse(out);
    expect(entry.task).toBe('env-var task');

    const entries = JSON.parse(run(`--json entries`, { CLAWCK_DIR: dir }));
    expect(entries.some((e: any) => e.id === entry.id)).toBe(true);
  });

  it('priority: subcommand > program > env > default', () => {
    const dirSub = freshDir();
    const dirProg = freshDir();
    const dirEnv = freshDir();

    // Subcommand wins over program and env
    const out1 = run(`--json -d ${dirProg} start -d ${dirSub} "priority task"`, { CLAWCK_DIR: dirEnv });
    const entry1 = JSON.parse(out1);

    const inSub = JSON.parse(run(`--json entries -d ${dirSub}`));
    expect(inSub.some((e: any) => e.id === entry1.id)).toBe(true);

    const inProg = JSON.parse(run(`--json entries -d ${dirProg}`));
    expect(inProg.some((e: any) => e.id === entry1.id)).toBe(false);

    const inEnv = JSON.parse(run(`--json entries -d ${dirEnv}`));
    expect(inEnv.some((e: any) => e.id === entry1.id)).toBe(false);
  });

  it('cross-command consistency: start + stop with same -d finds the entry', () => {
    const dir = freshDir();
    const startOut = run(`--json -d ${dir} start "cross-cmd task"`);
    const entry = JSON.parse(startOut);

    const stopOut = run(`--json -d ${dir} stop ${entry.id}`);
    const stopped = JSON.parse(stopOut);
    expect(stopped.status).toBe('completed');
    expect(stopped.end).toBeTruthy();
  });

  it('data does not leak between different -d paths', () => {
    const dir1 = freshDir();
    const dir2 = freshDir();

    run(`--json -d ${dir1} start "dir1 task"`);
    run(`--json -d ${dir2} start "dir2 task"`);

    const entries1 = JSON.parse(run(`--json -d ${dir1} entries`));
    const entries2 = JSON.parse(run(`--json -d ${dir2} entries`));

    expect(entries1.every((e: any) => e.task === 'dir1 task')).toBe(true);
    expect(entries2.every((e: any) => e.task === 'dir2 task')).toBe(true);
  });

  it('defaults to .clawck when nothing specified', () => {
    const cwd = freshDir();
    // Run in an isolated temp dir so .clawck is created there
    const out = execSync(`npx tsx ${CLI} --json start "default task"`, {
      env: { ...process.env, CLAWCK_DIR: undefined },
      encoding: 'utf-8',
      cwd,
      timeout: 15000,
    }).trim();
    const entry = JSON.parse(out);
    expect(entry.task).toBe('default task');

    // .clawck directory should have been created in cwd
    expect(fs.existsSync(path.join(cwd, '.clawck', 'clawck.db'))).toBe(true);
  });
});
