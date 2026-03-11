# Changelog

All notable changes to Clawck are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Clawck uses [Semantic Versioning](https://semver.org/).

## [0.5.7] - 2026-03-11

### Added
- **Client-Scoped Time Queries** — `clawck timesheet <client>` command
  - `--days`, `--weekly`, `--monthly` flags for date range
  - `--redact` flag to replace task descriptions with category labels
  - `--summary-only` flag to hide individual entries
  - API: `GET /api/timesheet` with `client`, `days`, `redact`, `summary_only` query params
- **Abstracted/Privacy Reports** — privacy controls for client-facing output
  - `--redact` flag on `report`, `list`, `export` commands
  - `--summary-only` flag on `timesheet` command
- **Platform-Aware Output Formatting** — `--format discord|slack|telegram|markdown`
  - Discord: 2000 char limit, emoji syntax
  - Slack: mrkdwn format with `*bold*` and code blocks
  - Telegram: HTML format with `<b>`, `<code>`, `<i>` tags
  - Markdown: standard GFM tables and formatting
  - Applies to `report`, `score`, `digest` commands
- **Entry Edit with Approval Flow** — pending edits system
  - `clawck edit --needs-approval` queues changes for review
  - `clawck edits` command to list, approve, reject pending edits
  - API: `GET /api/edits`, `POST /api/edits/:id/approve`, `POST /api/edits/:id/reject`
  - Schema migration 6: `edit_pending` column, `pending_edits` column
- **Channel & Memory-Aware Auto-Categorization**
  - `clawck channel list|add|update|delete` commands
  - Auto-fill project/client/category from channel_mappings when `channel_id` in hook context
  - `category_keywords` config for keyword-based category detection
  - API: `GET /api/channels`, `POST /api/channels`, `PATCH /api/channels/:id`, `DELETE /api/channels/:id`
  - Schema migration 6: `channel_mappings` table

### Changed
- Schema version: 6 (added pending edits and channel mappings)

### Tests
- 326 passing tests

### Internal
- Spec version: 0.2.0 (unchanged)
- Added missing openclaw entry to PLATFORMS Record

## [0.5.6] - 2026-03-11

### Added
- **Productivity Scoring** — `clawck score` command and `GET /api/score` endpoint
  - Daily utilization rate (agent hours vs available hours)
  - Trend analysis (up/down/stable)
  - Busiest category identification
- **Category Trends** — `clawck trends` command and `GET /api/trends` endpoint
  - Weekly category distribution with week-over-week deltas
  - Biggest shift detection
- **Backup/Restore** — `clawck backup` and `clawck restore` commands
  - Exports database, config, and entries.jsonl to .tar.gz
  - Restore to existing or new directory with --force option
- **Config Profiles** — `clawck profile list|create|use|show|delete` commands
  - Store multiple configurations for different clients/projects
  - Profiles stored in .clawck/profiles/*.json
  - Active profile overrides default config
- **Daily/Weekly Digests** — `clawck digest` command and `GET /api/digest` endpoint
  - Summary stats, highlights, top tasks, and period comparison
  - Weekly digests include per-day breakdown
- **Social Share Cards** — `clawck share` command and `GET /api/share` endpoint
  - Generate 1200x630 HTML cards for social media
  - Three themes: light, dark, gradient
  - Open Graph and Twitter Card meta tags included
- **OpenClaw Integration** — `clawck setup openclaw` outputs hook config
  - Signal file support (.agent-done with epoch timestamps)
  - handler.ts and hook.json templates
- **Hook Reliability**
  - OpenClaw platform adapter with signal file parsing
  - agent_runtime_ms validation (never null after completion)
  - Improved runtime estimation from hook context

### Changed
- loadConfig() now merges active profile settings automatically
- Setup command expanded with gemini, cursor targets

### Tests
- 326 passing tests (up from 298)
- New test files: score, trends, backup, profiles, digest, share-card

### Internal
- Schema version: 5 (unchanged)
- Spec version: 0.2.0 (unchanged)

## [0.5.3] - 2026-03-08

### Fixed
- **Time Saved bug**: `total_time_saved_hours` now uses merged runtime instead of additive agent hours, correctly accounting for concurrent agents (e.g., 3 agents running 30min concurrently now shows 8.5h saved instead of 7.5h)

### Added
- Token/cost extraction to all platform adapters (Gemini, Cursor, Cline, Windsurf, Codex) with speculative field name fallbacks
- Debug logging in hook handler (`LOG_LEVEL=debug`) to diagnose token/cost extraction
- New tests: concurrent time saved calculation, adapter token/cost extraction, hook round-trip token preservation
- Skill docs: hook data flow documentation, verification instructions

### Changed
- README tagline: "System of record for AI agent work" (was "Toggl for the agentic era")
- README status table reorganized with stable/experimental classification

### Internal
- Schema version: 5 (unchanged)
- Spec version: 0.2.0 (unchanged)

## [0.5.2] - 2026-03-08

### Added
- **Merged Runtime**: new `total_agent_merged_runtime_hours` on `TimesheetSummary` — merges overlapping time intervals to show wall-clock span vs additive total, revealing parallelization benefits
- Parallelization ratio displayed in CLI, HTML, PDF, and dashboard when merged < total runtime
- `computeMergedRuntimeMs()` utility in `src/core/runtime.ts` for interval merging

### Changed
- Renamed `agent_runtime_minutes` → `agent_total_runtime_minutes` on `TimesheetRow` and `EntryComparison`
- Renamed "Wall-clock hours" → "Total runtime" and "Runtime" → "Total Runtime" across CLI, HTML reports, and PDF reports
- CSV header "Runtime (min)" → "Total Runtime (min)"
- Dashboard "Agent Hours" card now shows "Total Runtime" with merged runtime subtitle

## [0.5.1] - 2026-03-08

### Fixed
- Cost auto-estimation now uses Sonnet-class fallback pricing for unknown models instead of returning $0
- Timeline entries within each date now sort newest-first (was oldest-first)

### Added
- **Time Saved** metric: `time_saved_hours` on `TimesheetRow`, `total_time_saved_hours` on `TimesheetSummary` — shows hours of human work avoided
- **Token breakdown**: `tokens_in`/`tokens_out` on `TimesheetRow`, `total_tokens_in`/`total_tokens_out` on `TimesheetSummary`
- Time Saved card in HTML reports
- Token In/Out split columns in HTML table and CSV export
- Time Saved and token breakdown in CLI report output and PDF reports
- 14 new tests: savings accuracy, cost estimation fallback, HTML report assertions

### Internal
- Schema version: 5 (unchanged)
- Spec version: 0.2.0 (unchanged)

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
