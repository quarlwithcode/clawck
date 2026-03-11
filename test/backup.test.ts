import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { makeTmpConfig } from './helpers';
import { Clawck } from '../src/core/clawck';

const CLI = path.resolve(__dirname, '../src/cli/index.ts');

describe('Backup and Restore', () => {
  let tmpDir: string;
  let dataDir: string;
  let backupPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawck-backup-test-'));
    dataDir = path.join(tmpDir, '.clawck');
    backupPath = path.join(tmpDir, 'test-backup.tar.gz');
    fs.mkdirSync(dataDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('backup creates tar.gz with database and config', async () => {
    // Create a database with some entries
    const config = makeTmpConfig({ data_dir: dataDir });
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ port: 3456 }));

    const clawck = await new Clawck(config).ready();
    clawck.log({ task: 'test task 1', duration_minutes: 30, category: 'code' });
    clawck.log({ task: 'test task 2', duration_minutes: 60, category: 'research' });
    clawck.close();

    // Run backup command
    execSync(`npx tsx ${CLI} backup -d "${dataDir}" -o "${backupPath}"`, {
      stdio: 'pipe',
    });

    // Verify backup file exists
    expect(fs.existsSync(backupPath)).toBe(true);

    // Extract and verify contents
    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir);
    execSync(`tar -xzf "${backupPath}" -C "${extractDir}"`, { stdio: 'pipe' });

    expect(fs.existsSync(path.join(extractDir, 'clawck.db'))).toBe(true);
    expect(fs.existsSync(path.join(extractDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(extractDir, 'entries.jsonl'))).toBe(true);

    // Verify entries.jsonl content
    const jsonlContent = fs.readFileSync(path.join(extractDir, 'entries.jsonl'), 'utf-8');
    const lines = jsonlContent.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(2);

    const entry1 = JSON.parse(lines[0]);
    expect(entry1.task).toBeDefined();
  });

  it('restore replaces database from backup', async () => {
    // Create original database
    const config = makeTmpConfig({ data_dir: dataDir });
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ port: 3456 }));

    let clawck = await new Clawck(config).ready();
    clawck.log({ task: 'original task', duration_minutes: 30, category: 'code' });
    clawck.close();

    // Create backup
    execSync(`npx tsx ${CLI} backup -d "${dataDir}" -o "${backupPath}"`, {
      stdio: 'pipe',
    });

    // Modify the database
    clawck = await new Clawck(config).ready();
    clawck.log({ task: 'new task after backup', duration_minutes: 60, category: 'research' });
    const statsAfterMod = clawck.stats();
    clawck.close();
    expect(statsAfterMod.total_entries).toBe(2);

    // Restore from backup
    execSync(`npx tsx ${CLI} restore "${backupPath}" -d "${dataDir}" --force`, {
      stdio: 'pipe',
    });

    // Verify restoration
    clawck = await new Clawck(config).ready();
    const stats = clawck.stats();
    clawck.close();

    // Should be back to 1 entry (the backup state)
    expect(stats.total_entries).toBe(1);
  });

  it('restore to new directory creates it', async () => {
    // Create source database and backup
    const sourceDir = path.join(tmpDir, 'source');
    fs.mkdirSync(sourceDir, { recursive: true });
    const sourceConfig = makeTmpConfig({ data_dir: sourceDir });
    fs.writeFileSync(path.join(sourceDir, 'config.json'), JSON.stringify({ port: 3456 }));

    let clawck = await new Clawck(sourceConfig).ready();
    clawck.log({ task: 'source task', duration_minutes: 30, category: 'code' });
    clawck.close();

    // Create backup
    execSync(`npx tsx ${CLI} backup -d "${sourceDir}" -o "${backupPath}"`, {
      stdio: 'pipe',
    });

    // Restore to a new directory
    const newDir = path.join(tmpDir, 'new-restore');

    execSync(`npx tsx ${CLI} restore "${backupPath}" -d "${newDir}" --force`, {
      stdio: 'pipe',
    });

    // Verify new directory was created with data
    expect(fs.existsSync(newDir)).toBe(true);
    expect(fs.existsSync(path.join(newDir, 'clawck.db'))).toBe(true);

    const newConfig = makeTmpConfig({ data_dir: newDir });
    clawck = await new Clawck(newConfig).ready();
    const stats = clawck.stats();
    clawck.close();

    expect(stats.total_entries).toBe(1);
  });

  it('backup includes entry count in output', async () => {
    const config = makeTmpConfig({ data_dir: dataDir });
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ port: 3456 }));

    const clawck = await new Clawck(config).ready();
    clawck.log({ task: 'task 1', duration_minutes: 30, category: 'code' });
    clawck.log({ task: 'task 2', duration_minutes: 30, category: 'code' });
    clawck.log({ task: 'task 3', duration_minutes: 30, category: 'code' });
    clawck.close();

    const output = execSync(
      `npx tsx ${CLI} --json backup -d "${dataDir}" -o "${backupPath}"`,
      { encoding: 'utf-8' }
    );

    const result = JSON.parse(output);
    expect(result.ok).toBe(true);
    expect(result.entry_count).toBe(3);
    expect(result.size_bytes).toBeGreaterThan(0);
  });
});
