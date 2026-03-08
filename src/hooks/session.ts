/**
 * ⏱️🦀 Clawck — Session File Management
 * Persists hook session state as JSON files (not SQLite) to avoid DB lock issues.
 */

import fs from 'fs';
import path from 'path';
import { SessionState } from './types';

function sessionsDir(dataDir: string): string {
  return path.join(dataDir, 'hooks', 'sessions');
}

function sessionPath(dataDir: string, sessionId: string): string {
  // Sanitize session ID to prevent path traversal
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(sessionsDir(dataDir), `${safe}.json`);
}

export function saveSession(dataDir: string, sessionId: string, state: SessionState): void {
  const dir = sessionsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionPath(dataDir, sessionId), JSON.stringify(state));
}

export function loadSession(dataDir: string, sessionId: string): SessionState | null {
  const filePath = sessionPath(dataDir, sessionId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function clearSession(dataDir: string, sessionId: string): void {
  const filePath = sessionPath(dataDir, sessionId);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already gone — fine
  }
}

export function cleanStaleSessions(dataDir: string, maxAgeMs = 86400000): number {
  const dir = sessionsDir(dataDir);
  if (!fs.existsSync(dir)) return 0;

  let cleaned = 0;
  const now = Date.now();

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    } catch {
      // Skip files we can't stat
    }
  }

  return cleaned;
}
