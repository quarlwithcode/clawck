import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const CLI = path.resolve(__dirname, '../src/cli/index.ts');

function run(args: string, dataDir: string): string {
  return execSync(`npx tsx ${CLI} ${args}`, {
    encoding: 'utf-8',
    env: { ...process.env, CLAWCK_DIR: dataDir },
  });
}

describe('Config Profiles', () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawck-profiles-test-'));
    dataDir = path.join(tmpDir, '.clawck');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({ port: 3456, default_client: 'default-client', default_project: 'default-project' })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('profile list shows default profile', () => {
    const output = run(`--json profile list -d "${dataDir}"`, dataDir);
    const profiles = JSON.parse(output);
    expect(profiles.length).toBe(1);
    expect(profiles[0].name).toBe('default');
    expect(profiles[0].active).toBe(true);
    expect(profiles[0].client).toBe('default-client');
  });

  it('profile create creates a new profile', () => {
    const output = run(`--json profile create acme --client acme-corp --project website -d "${dataDir}"`, dataDir);
    const result = JSON.parse(output);
    expect(result.ok).toBe(true);
    expect(result.name).toBe('acme');

    // Verify file was created
    const profilePath = path.join(dataDir, 'profiles', 'acme.json');
    expect(fs.existsSync(profilePath)).toBe(true);

    const profileContent = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    expect(profileContent.default_client).toBe('acme-corp');
    expect(profileContent.default_project).toBe('website');
  });

  it('profile create --copy-from copies settings', () => {
    // Create first profile
    run(`profile create base --client base-client --project base-proj -d "${dataDir}"`, dataDir);

    // Create second profile copying from first
    run(`profile create derived --copy-from base -d "${dataDir}"`, dataDir);

    const derivedPath = path.join(dataDir, 'profiles', 'derived.json');
    const derivedContent = JSON.parse(fs.readFileSync(derivedPath, 'utf-8'));
    expect(derivedContent.default_client).toBe('base-client');
    expect(derivedContent.default_project).toBe('base-proj');
  });

  it('profile use switches active profile', () => {
    // Create a profile
    run(`profile create work --client work-client -d "${dataDir}"`, dataDir);

    // Switch to it
    const output = run(`--json profile use work -d "${dataDir}"`, dataDir);
    const result = JSON.parse(output);
    expect(result.ok).toBe(true);
    expect(result.active).toBe('work');

    // Verify .active-profile file
    const activeProfilePath = path.join(dataDir, '.active-profile');
    expect(fs.readFileSync(activeProfilePath, 'utf-8').trim()).toBe('work');

    // List should show work as active
    const listOutput = run(`--json profile list -d "${dataDir}"`, dataDir);
    const profiles = JSON.parse(listOutput);
    const workProfile = profiles.find((p: any) => p.name === 'work');
    expect(workProfile.active).toBe(true);
  });

  it('profile show displays profile settings', () => {
    run(`profile create test --client test-client --project test-proj -d "${dataDir}"`, dataDir);

    const output = run(`--json profile show test -d "${dataDir}"`, dataDir);
    const result = JSON.parse(output);
    expect(result.name).toBe('test');
    expect(result.default_client).toBe('test-client');
    expect(result.default_project).toBe('test-proj');
  });

  it('profile delete removes a profile', () => {
    // Create and then delete
    run(`profile create temporary -d "${dataDir}"`, dataDir);
    const profilePath = path.join(dataDir, 'profiles', 'temporary.json');
    expect(fs.existsSync(profilePath)).toBe(true);

    const output = run(`--json profile delete temporary -d "${dataDir}"`, dataDir);
    const result = JSON.parse(output);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(profilePath)).toBe(false);
  });

  it('active profile affects loaded config', async () => {
    // Create a profile with specific settings
    run(`profile create special --client special-client --project special-proj -d "${dataDir}"`, dataDir);
    run(`profile use special -d "${dataDir}"`, dataDir);

    // Start a task - it should use the profile's defaults
    const startOutput = run(`--json start "test task" -d "${dataDir}"`, dataDir);
    const entry = JSON.parse(startOutput);
    expect(entry.client).toBe('special-client');
    expect(entry.project).toBe('special-proj');
  });

  it('profile delete switches back to default if deleting active', () => {
    run(`profile create active-one -d "${dataDir}"`, dataDir);
    run(`profile use active-one -d "${dataDir}"`, dataDir);

    // Verify it's active
    const activeProfilePath = path.join(dataDir, '.active-profile');
    expect(fs.readFileSync(activeProfilePath, 'utf-8').trim()).toBe('active-one');

    // Delete it
    run(`profile delete active-one -d "${dataDir}"`, dataDir);

    // Should switch back to default
    expect(fs.readFileSync(activeProfilePath, 'utf-8').trim()).toBe('default');
  });
});
