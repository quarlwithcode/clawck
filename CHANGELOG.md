# Changelog

All notable changes to Clawck are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Clawck uses [Semantic Versioning](https://semver.org/).

## [0.5.0] - 2026-03-08

### Stabilization Release

No new features — this release focuses entirely on reliability, consistency, and maintenance readiness.

### Fixed
- MCP `serverInfo.version` now uses `APP_VERSION` constant (was hardcoded `'0.4.0'`)
- ATP `source_version` now uses `APP_VERSION` constant (was hardcoded `'0.4.0'`)
- `parseInt()` on API query params now handles NaN safely (returns sane defaults)
- Silent `catch {}` blocks in ingest and ATP import now report per-entry errors
- Express error middleware properly forwards built-in error status codes (e.g., 413)

### Added
- **ESLint** — flat config with typescript-eslint, `npm run lint` passes clean
- **GitHub Actions CI** — matrix build (Node 18/20/22), lint, test, CLI smoke test
- **Structured logging** — `src/core/logger.ts` with level-aware output and subsystem tags
- **Error taxonomy** — `ClawckError`, `ValidationError`, `NotFoundError`, `ConfigError` classes
- **Config validation in server** — `createServer()` now validates config before starting
- **Shared config validator** — `validateConfig()` extracted from CLI, reusable by SDK consumers
- **API body size limit** — `express.json({ limit: '1mb' })`
- **CORS configuration** — configurable `cors_origin` in config (default: allow all for localhost use)
- **Pricing module exports** — `estimateCost`, `getModelPricing`, `MODEL_PRICING` now public
- **Deprecation policy** — `docs/deprecation-policy.md`
- **Surface stability classification** — README documents stable vs experimental features
- 20 new tests: pricing module (10), API hardening (10)

### Changed
- README API table expanded from 15 to all 26 endpoints, grouped by category
- `.gitignore` now covers `.DS_Store`, `.env`, `.env.*`, `clawck-report-*`
- Webhook errors are now logged instead of silently swallowed
- Hook handler uses structured logger instead of `process.stderr.write`
- Sync manager logs success/failure per source

### Internal
- Removed unused imports across all source files
- Schema version: 5 (unchanged)
- Spec version: 0.2.0 (unchanged)

## [0.4.3] - 2026-03-08

### Fixed
- CLI version string now uses the `APP_VERSION` constant instead of a hardcoded value

### Internal
- Schema version: 5 (unchanged)
- Spec version: 0.2.0 (unchanged)

## [0.4.2] - 2026-03-08

### Fixed
- Agent runtime calculation now correctly falls back to wall clock time for hook-based tracking instead of returning null

## [0.4.1] - 2026-03-08

### Fixed
- Claude Code hooks schema corrected (proper `hooks` array nesting)
- Improved stop messaging when no running entry is found

### Added
- `--verbose` flag for CLI commands

## [0.3.0] - 2026-03-08

### Added
- **Tracking patterns** — reusable task templates (`default`, `code-review`, `research`, `content-creation`, `testing`) with CLI commands: `clawck pattern list|add|use`
- **Approval workflow** — `approved` column on entries, `clawck approve <id>`, `POST /api/entries/:id/approve`, `--approved`/`--unapproved` filters
- **Interactive HTML reports** — `clawck report --format html` with calendar, sortable table, Gantt chart, and CSV export tabs
- **Personal baselines** — record your own task timings for comparison (`personal_baselines` table, `/api/baselines` endpoints)
- **Reports storage** — `reports` table for saving generated reports, `/api/reports` CRUD endpoints
- **Industry benchmarks** — built-in timing data for human-equivalent comparisons
- **Entry comparison** — `/api/compare/:entryId` endpoint
- **ATP export/import** — `/api/export/atp` and `/api/import/atp` endpoints for portable data exchange

### Changed
- Human-equivalent calculations now use agent runtime (when available) instead of always using wall clock time
- Schema version bumped to 5 (added `personal_baselines` and `reports` tables)

### Fixed
- Accuracy improvements to duration and human-equivalent calculations

### Database Migrations
- Migration 2: `approved` column on `entries`
- Migration 3: `agent_runtime_ms` and `wall_clock_ms` columns on `entries`
- Migration 4: `personal_baselines` table
- Migration 5: `reports` table

## [0.1.0] - 2026-03-08

### Added
- Initial release
- Core time tracking: start/stop/log entries with full metadata (agent, model, client, project, category, tokens, cost)
- SQLite database via better-sqlite3 (WAL mode, zero-copy)
- REST API server (Express) with full CRUD
- MCP server (stdio) for Claude Code, Cline, Cursor, Windsurf integration
- Web dashboard (single-file HTML)
- CLI with commands: `init`, `serve`, `mcp`, `start`, `stop`, `log`, `status`, `list`, `get`, `entries`, `report`, `export`, `seed`, `edit`, `delete`, `setup`, `hooks`
- Human-equivalent multipliers with configurable rates per category
- Multi-agent sync (pull from remotes, push via `/api/ingest`)
- Webhooks (`task_completed`, `task_failed`, `idle_alert`)
- Platform hooks for Claude Code, Cursor, Cline, Windsurf, Gemini, Codex
- PDF report generation
- CSV/JSON export
- ClawckSpec v0.1 (ATP wire format)
- TypeScript SDK (`import { Clawck } from 'clawck'`)

### Database Migrations
- Migration 1: Initial schema (`entries`, `sync_state`, indexes)
- Schema version: 1
- Spec version: 0.1.0
