/**
 * ⏱️🦀 Clawck — Hooks Module
 */

export { HookEvent, Platform, HookContext, SessionState } from './types';
export { readStdin } from './stdin';
export { detectPlatform, normalize } from './adapters';
export { saveSession, loadSession, clearSession, cleanStaleSessions } from './session';
export { handleHookStart, handleHookStop } from './handler';
export { PLATFORMS, PLATFORM_NAMES, PlatformInstallInfo } from './install';
