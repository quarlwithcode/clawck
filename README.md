# Clawck v0.5.7

**System of record for AI agent work.**

Clawck tracks what AI agents do, how long it takes, and what it costs — then calculates the human-equivalent value. One source of truth for agent timesheets, billing, and ROI.

Every service business runs on timesheets. AI agent businesses will too.

## What's New in 0.5.7

- **Client-Scoped Timesheets** — `clawck timesheet <client>` for invoice-ready reports
- **Privacy Reports** — `--redact` and `--summary-only` flags for client-facing output
- **Platform Formatters** — `--format discord|slack|telegram|markdown` output
- **Edit Approval Flow** — `clawck edits` for pending changes requiring review
- **Channel Auto-Categorization** — `clawck channel` maps chat channels to projects/clients

### Previous (0.5.6)

- **Productivity Scoring** — `clawck score` for daily utilization and trends
- **Category Trends** — `clawck trends` for weekly work distribution analysis
- **Backup/Restore** — `clawck backup` and `clawck restore` for data portability
- **Config Profiles** — `clawck profile` for managing multiple client/project configs
- **Daily/Weekly Digests** — `clawck digest` for quick summary reports
- **Social Share Cards** — `clawck share` generates shareable HTML cards

See [CHANGELOG.md](CHANGELOG.md) for full details.

## Quick Start

```bash
# Install
npm install -g clawck

# Initialize
clawck init

# Seed with sample data
clawck seed --count 30

# Start the server + dashboard
clawck serve
# Open http://localhost:3456

# Generate an interactive HTML report
clawck report --format html
```

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — Release notes for every version
- [docs/api-reference.md](docs/api-reference.md) — Complete REST API and MCP tools reference
- [docs/deployment.md](docs/deployment.md) — Running in production, backup and restore
- [docs/migration-guide.md](docs/migration-guide.md) — Database migrations and upgrade steps
- [docs/security.md](docs/security.md) — Security posture and hardening guidance
- [docs/versioning.md](docs/versioning.md) — App, spec, and schema versioning policy
- [docs/atp-spec-v0.2.md](docs/atp-spec-v0.2.md) — Agent Time Protocol specification
- [docs/benchmarks-sources.md](docs/benchmarks-sources.md) — Industry benchmark data sources

## Features

- **Time tracking** - Start/stop timers or log completed tasks retroactively
- **Human-equivalent calculations** - Configurable multipliers estimate how long a human would take
- **Client timesheets** - `clawck timesheet <client>` for invoice-ready reports with privacy options
- **Tracking patterns** - Reusable task templates (code-review, research, testing, etc.)
- **Approval workflow** - Mark entries as approved for billing/invoicing
- **Edit approval flow** - Queue changes for review with `--needs-approval`
- **Channel mappings** - Auto-categorize entries based on Discord/Slack channels
- **Reports** - Terminal, PDF, and interactive HTML reports with calendar, table, Gantt, and CSV views
- **Platform formatters** - Output for Discord, Slack, Telegram, Markdown
- **Dashboard** - Real-time web dashboard with stats, entries, and breakdowns
- **MCP server** - Works with Claude Code, Cline, Cursor, Windsurf via stdio
- **REST API** - Full CRUD API for any agent framework
- **Multi-agent sync** - Pull from remote instances or push via ingest endpoint
- **Webhooks** - Notify on task completion, failure, or idle alerts
- **Platform hooks** - Auto-track via Claude Code hooks, Gemini, Cursor, etc.
- **PDF reports** - Professional timesheet PDFs with entry details table
- **CSV/JSON export** - Export data for external tools

## Getting Started

### 1. Agents clock in and out

**Via platform hooks (recommended — Claude Code, Cursor, Gemini, Windsurf, Codex):**

Hooks fire automatically on every turn — no agent cooperation needed.

Claude Code — add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "clawck hook start" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "clawck hook stop" }
        ]
      }
    ]
  }
}
```

Or run `clawck hooks install claude` for the full config.

**Via MCP (optional — for explicit agent control):**

Add to `~/.claude/mcp_servers.json` (or equivalent for Cline, Cursor, Windsurf):

```json
{ "clawck": { "command": "npx", "args": ["-y", "clawck", "mcp"] } }
```

This gives agents `clawck_start_task`, `clawck_stop_task`, etc. for granular control. Add CLAUDE.md instructions (run `clawck setup claude`) to tell the agent to use them.

**Via REST API:**

```bash
# Start a task
curl -X POST http://localhost:3456/api/start \
  -H "Content-Type: application/json" \
  -d '{"task": "Research grant opportunities", "project": "grant-research", "client": "acme-corp", "category": "research", "agent": "research-agent-01"}'

# Stop a task
curl -X POST http://localhost:3456/api/stop \
  -H "Content-Type: application/json" \
  -d '{"id": "entry-uuid-here", "status": "completed", "summary": "Found 12 matching grants"}'
```

**Via the SDK:**

```typescript
import { Clawck } from 'clawck';

const clawck = new Clawck({ default_client: 'acme-corp', default_agent: 'my-agent' });
const entry = clawck.start({ task: 'Analyze Q3 data', project: 'analytics', category: 'analysis' });
// ... agent does work ...
clawck.stop({ id: entry.id, status: 'completed', tokens_in: 25000, cost_usd: 0.12 });
```

### 2. Clawck calculates human-equivalent value

Every entry has a **category** and Clawck applies configurable multipliers:

| Category | Multiplier | Human Rate |
|----------|-----------|------------|
| Research | 12x | $50/hr |
| Content | 10x | $45/hr |
| Code | 6x | $75/hr |
| Data Entry | 20x | $25/hr |
| Design | 5x | $60/hr |
| Analysis | 10x | $55/hr |
| Testing | 8x | $65/hr |
| Planning | 6x | $50/hr |
| Communication | 8x | $40/hr |
| Other | 8x | $50/hr |

30 minutes of agent research = **6 hours human-equivalent** = **$300 estimated value**.

> **Note:** These multipliers are configurable starting estimates. They represent
> roughly how many hours of equivalent human work one hour of agent work produces
> for each category. Adjust them based on your team's actual experience.
> See `docs/benchmarks-sources.md` for industry timing data to help calibrate.

### 3. View results

- **Dashboard** at `http://localhost:3456` - stats, entries, breakdowns by project/agent/category
- **Terminal** - `clawck report` for quick summaries
- **HTML** - `clawck report --format html` - interactive report with calendar, sortable table, Gantt chart, CSV export
- **PDF** - `clawck report --format pdf` - printable timesheet with entry details

## Tracking Patterns

Patterns are reusable templates for common task types. They set default values for category, project, client, agent, and tags.

**Built-in patterns:** `default`, `code-review`, `research`, `content-creation`, `testing`

```bash
# List available patterns
clawck pattern list

# Use a pattern when starting a task
clawck start "Review auth module" --pattern code-review

# Add a custom pattern
clawck pattern add --name deploy --category code --project ops --tags deploy release

# Set a default pattern
clawck pattern use research
```

Patterns merge as defaults - any explicit flags you pass override the pattern's values.

## Approval Workflow

Entries can be approved for billing, invoicing, or quality control.

```bash
# Approve an entry (supports 8-char ID prefix)
clawck approve a1b2c3d4

# View only approved entries
clawck entries --approved

# View unapproved entries
clawck entries --unapproved

# Filter in list view too
clawck list --approved
```

The API also supports approval: `POST /api/entries/:id/approve`.

## Reports

### Terminal

```bash
clawck report                        # Last 7 days
clawck report --days 30 --detailed   # With individual entries
clawck report --client acme-corp     # Filter by client
```

### HTML (interactive)

```bash
clawck report --format html -o report.html
```

The HTML report includes four tabs:
- **Calendar** - Color-coded day grid showing entry count and hours
- **Table** - Sortable table of all entries with full details
- **Gantt** - Timeline visualization of tasks grouped by date
- **CSV** - Copyable CSV data for spreadsheets

### PDF

```bash
clawck report --format pdf -o report.pdf
```

Professional timesheet PDF with summary stats, breakdowns by project/agent/category, and an entry details table.

## CLI Commands

```bash
# Setup
clawck init                              # Create .clawck/ directory with config
clawck serve [--port 8080]               # Start API + dashboard
clawck mcp                               # Start MCP server on stdio
clawck seed [--count 50]                 # Generate test data

# Time tracking
clawck start <task> [--pattern <name>]   # Start a timer
clawck stop <id>                         # Stop a timer
clawck log <task> --duration 30          # Log a completed task

# Viewing entries
clawck status                            # Show running tasks and stats
clawck list [--days 30] [--approved]     # List entries in a table
clawck get <id>                          # Show a single entry
clawck entries [--status running]        # Query with filters

# Reports and export
clawck report [--format terminal|pdf|html] [--output path]
clawck export [--format csv|json] [--days 30]

# Patterns
clawck pattern list                      # Show tracking patterns
clawck pattern add --name <n> [opts]     # Add a custom pattern
clawck pattern use <name>                # Set default pattern

# Approval
clawck approve <id>                      # Approve an entry

# Editing and deleting
clawck edit <id> --task "New name"       # Edit fields
clawck delete <id>                       # Delete an entry (8-char prefix OK)

# Hooks
clawck hooks install <platform>          # Show hook config for a platform
clawck hooks status                      # Check installed hooks
clawck setup [claude|mcp|openclaw]       # Output integration snippets

# Global options
clawck --json <command>                  # JSON output for scripting
clawck -d <path> <command>               # Custom data directory
```

## Configuration

Edit `.clawck/config.json`:

```json
{
  "port": 3456,
  "default_client": "acme-corp",
  "default_project": "general",
  "default_agent": "agent-01",
  "default_model": "claude-sonnet-4-20250514",
  "default_source": "clawck",
  "default_pattern": "default",
  "human_equivalents": {
    "research": { "multiplier": 12, "human_rate_usd": 50 },
    "content": { "multiplier": 10, "human_rate_usd": 45 },
    "code": { "multiplier": 6, "human_rate_usd": 75 },
    "data_entry": { "multiplier": 20, "human_rate_usd": 25 },
    "design": { "multiplier": 5, "human_rate_usd": 60 },
    "analysis": { "multiplier": 10, "human_rate_usd": 55 },
    "testing": { "multiplier": 8, "human_rate_usd": 65 },
    "planning": { "multiplier": 6, "human_rate_usd": 50 },
    "communication": { "multiplier": 8, "human_rate_usd": 40 },
    "other": { "multiplier": 8, "human_rate_usd": 50 }
  },
  "patterns": [
    { "name": "default", "description": "General task tracking", "category": "other" },
    { "name": "code-review", "description": "Code review and refactoring", "category": "code", "tags": ["review"] },
    { "name": "research", "description": "Research and analysis", "category": "research" },
    { "name": "content-creation", "description": "Content writing", "category": "content" },
    { "name": "testing", "description": "Writing and running tests", "category": "testing" }
  ],
  "remote_sources": [],
  "webhooks": []
}
```

Config is validated on load. Invalid values produce clear error messages.

## Status

| Component | Status | Notes |
|-----------|--------|-------|
| Core tracking (start/stop/log) | **Stable** | Entry lifecycle locked |
| MCP tools | **Stable** | 9 tools, input schemas locked |
| REST API | **Stable** | 26 endpoints, request/response shapes locked |
| CLI | **Stable** | 31 commands, flag signatures locked |
| Platform Hooks | **Stable** | Claude, Gemini, Cursor, Cline, Windsurf, Codex |
| Reports (terminal/HTML/PDF) | **Stable** | Calendar, Gantt, CSV export |
| SQLite storage | **Stable** | Schema v5, migrations auto-applied |
| ATP export/import | **Stable** | Spec v0.2.0 |
| Multi-agent sync | Experimental | Pull-mode only, no conflict resolution |
| Webhooks | Experimental | Fire-and-forget, no retry/delivery guarantee |
| Pricing estimation | Experimental | Model pricing table manually maintained |

**Planned (not started):** Python SDK, auto-instrumentation, email digest, OpenTelemetry exporter, embeddable widget.

## REST API

26 endpoints. See [docs/api-reference.md](docs/api-reference.md) for full request/response details.

**Health & Stats**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (version, spec) |
| `GET` | `/api/stats` | Quick database statistics |

**Time Tracking**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/start` | Start tracking a task |
| `POST` | `/api/stop` | Stop a running task |
| `POST` | `/api/log` | Log a completed task retroactively |

**Entries**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/entries` | Query entries (with filters) |
| `GET` | `/api/entries/:id` | Get a single entry |
| `PATCH` | `/api/entries/:id` | Update an entry |
| `POST` | `/api/entries/:id/approve` | Approve an entry |
| `GET` | `/api/running` | Get currently running tasks |

**Reports & Timesheets**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/timesheet` | Get timesheet summary |
| `POST` | `/api/reports/generate` | Generate a report (terminal/HTML/PDF) |
| `GET` | `/api/reports` | List saved reports |
| `GET` | `/api/reports/:id` | Get a saved report |
| `DELETE` | `/api/reports/:id` | Delete a saved report |

**Baselines & Comparison**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/baselines` | List personal baselines |
| `POST` | `/api/baselines` | Create a personal baseline |
| `DELETE` | `/api/baselines/:id` | Delete a baseline |
| `GET` | `/api/compare/:entryId` | Compare entry against benchmarks |

**Import/Export & Sync**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/export/atp` | Export entries as ATP envelope |
| `POST` | `/api/import/atp` | Import entries from ATP envelope |
| `POST` | `/api/ingest` | Bulk import/merge entries |
| `GET` | `/api/sync/status` | Get sync status for remote sources |
| `POST` | `/api/sync/trigger` | Manually trigger sync |

**Filter Options**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/clients` | List distinct clients |
| `GET` | `/api/projects` | List distinct projects |
| `GET` | `/api/agents` | List distinct agents |

## Multi-Agent Aggregation

Running agents across multiple machines? Clawck merges them:

**Pull mode** - central collector fetches from remote instances:

```json
{
  "remote_sources": [
    { "name": "research-agent", "url": "http://agent-01:3456/api/entries" },
    { "name": "writer-agent", "url": "http://agent-02:3456/api/entries" }
  ],
  "sync_interval": 60
}
```

**Push mode** - agents POST entries to a central instance:

```bash
curl -X POST http://central-clawck:3456/api/ingest \
  -H "Content-Type: application/json" \
  -d '[{"task": "...", "agent": "agent-01", ...}]'
```

Entries merge by UUID - no conflicts, no duplicates.

## Architecture

```
clawck/
  src/
    core/          - Types, database (SQLite), entry manager, patterns
    server/        - REST API (Express) + MCP server (stdio)
    dashboard/     - Single-file HTML dashboard
    reports/       - PDF and HTML report generators
    cli/           - Command-line interface
    hooks/         - Platform hook integrations
  .clawck/
    config.json    - Your configuration
    clawck.db      - SQLite database (auto-created)
```

**Design principles:**
- **Zero infrastructure** - SQLite embedded, no Redis/Postgres/Docker needed
- **One process** - API, dashboard, and MCP all run from `clawck serve`
- **Append-first** - Entries are created and updated; deletion available via CLI
- **UUID-based merging** - Multi-agent data combines without conflicts
- **Configurable** - Human-equivalent multipliers are transparent and adjustable

## Integrations

**Platform hooks (recommended)** - Auto-track via `clawck hooks install claude|cursor|cline|windsurf|gemini|codex`

**Claude Code MCP** - Add to `~/.claude/mcp_servers.json` for explicit agent control:
```json
{ "clawck": { "command": "npx", "args": ["-y", "clawck", "mcp"] } }
```

**n8n** - POST to `/api/start` and `/api/stop` from HTTP Request nodes.

**Python frameworks (LangGraph, CrewAI, etc.):**
```python
import requests
r = requests.post("http://localhost:3456/api/start", json={"task": "Analyze data", "agent": "my-agent"})
entry_id = r.json()["id"]
requests.post("http://localhost:3456/api/stop", json={"id": entry_id, "status": "completed"})
```

## Help / Troubleshooting

- `clawck --help` for CLI usage
- `clawck setup` for agent integration snippets
- `clawck hooks status` to check hook installations
- Data directory defaults to `.clawck/` in your working directory. Override with `-d <path>` or `CLAWCK_DIR` env var.

## Roadmap

- [x] PDF report export
- [x] Webhooks (task completion, failure, idle alerts)
- [x] Claude Code hooks adapter
- [x] Tracking patterns
- [x] Approval workflow
- [x] HTML interactive reports
- [ ] Python SDK (`pip install clawck`)
- [ ] Auto-instrumentation (monkey-patch LLM client libraries)
- [ ] Email digest (weekly summary to clients)
- [ ] OpenTelemetry exporter
- [ ] Embeddable widget

## Contributing

Contributions welcome! Especially:
- **Adapters** - New framework integrations
- **Dashboard** - UI improvements and features
- **Multipliers** - Better human-equivalent estimates backed by data

## License

MIT

---

Built by [CubiCrew](https://cubicrew.com) - Created by [Vince Quarles](https://github.com/vincequarles)
