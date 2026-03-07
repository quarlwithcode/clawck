# ⏱️🦀 Clawck

**Time tracking for AI agents. Toggl for the agentic era.**

Clawck is an open-source tool that tracks how long AI agents spend on tasks, projects, and client work — then shows you how much human-equivalent time and money they saved.

Every service business runs on timesheets. AI agent businesses will too.

---

## Why Clawck?

AI agents are doing real work — writing code, researching grants, generating content, analyzing data. But nobody's tracking *how long* that work takes or *how much value* it delivers.

Clawck answers the questions your clients, managers, and finance teams are already asking:

- **"What did the AI actually do today?"** → A clear timesheet showing every task, duration, and outcome
- **"Is this worth what we're paying?"** → Human-equivalent hours and cost savings calculated automatically  
- **"Which agent is the most productive?"** → Per-agent breakdowns across projects and clients

## Quick Start

```bash
# Install
npm install -g clawck

# Initialize
clawck init

# Seed with sample data (to see the dashboard)
clawck seed --count 30

# Start the server + dashboard
clawck serve
# → Dashboard at http://localhost:3456
```

## How It Works

### 1. Agents clock in and out

**Via MCP (Claude Code, Cline, Cursor, Windsurf):**

Add to your MCP config (`~/.claude/mcp_servers.json` or similar):

```json
{
  "clawck": {
    "command": "npx",
    "args": ["-y", "clawck", "mcp"]
  }
}
```

Now your agent has access to:
- `clawck_start_task` — Start a timer
- `clawck_stop_task` — Stop a timer
- `clawck_log_task` — Log a completed task retroactively
- `clawck_status` — See what's running
- `clawck_timesheet` — Get a summary report

**Via REST API:**

```bash
# Start a task
curl -X POST http://localhost:3456/api/start \
  -H "Content-Type: application/json" \
  -d '{"task": "Research grant opportunities", "project": "grant-research", "client": "acme-corp", "category": "research", "agent": "cubi-research-01"}'

# Stop a task
curl -X POST http://localhost:3456/api/stop \
  -H "Content-Type: application/json" \
  -d '{"id": "entry-uuid-here", "status": "completed", "summary": "Found 12 matching grants", "tokens_in": 15000, "tokens_out": 3000}'
```

**Via the SDK (in your own code):**

```typescript
import { Clawck } from 'clawck';

const clawck = new Clawck({
  default_client: 'acme-corp',
  default_agent: 'my-agent',
});

const entry = clawck.start({
  task: 'Analyze Q3 customer data',
  project: 'analytics',
  category: 'analysis',
});

// ... agent does work ...

clawck.stop({
  id: entry.id,
  status: 'completed',
  tokens_in: 25000,
  tokens_out: 8000,
  cost_usd: 0.12,
  summary: 'Identified 3 key churn drivers',
});
```

### 2. Clawck calculates human-equivalent value

Every entry has a **category** (research, content, code, data_entry, design, etc.) and Clawck applies configurable multipliers to estimate how long a human would take:

| Category | Agent → Human Multiplier | Human Rate |
|----------|--------------------------|------------|
| Research | 12x | $50/hr |
| Content | 10x | $45/hr |
| Code | 6x | $75/hr |
| Data Entry | 20x | $25/hr |
| Design | 5x | $60/hr |
| Analysis | 10x | $55/hr |
| Testing | 8x | $65/hr |

So if an agent spends 30 minutes on research, Clawck reports it as **6 hours of human-equivalent work** and **$300 in estimated value**.

### 3. View the dashboard

Open `http://localhost:3456` to see:

- 📊 **Stats cards** — Agent hours, human-equiv hours, cost, active tasks
- 💚 **Savings banner** — Total estimated value delivered
- 📋 **Time entries** — Every task with duration, category, and status
- 📁 **By Project** — Hours breakdown per project with visual bars
- 🤖 **By Agent** — Per-agent productivity and success rates
- 🏷️ **By Category** — Where time is going across work types

## Multi-Agent Aggregation

Running 10 agents across multiple machines? Clawck merges them:

**Option A: Central collector pulls from remote instances**

```yaml
# .clawck/config.json
{
  "remote_sources": [
    { "name": "research-agent", "url": "http://cubi-01:3456/api/entries" },
    { "name": "writer-agent", "url": "http://cubi-02:3456/api/entries" },
    { "name": "coder-agent", "url": "http://cubi-03:3456/api/entries" }
  ],
  "sync_interval": 60
}
```

**Option B: Agents push to a central instance**

```bash
# From any agent, POST entries to central Clawck
curl -X POST http://central-clawck:3456/api/ingest \
  -H "Content-Type: application/json" \
  -d '[{"task": "...", "agent": "cubi-01", ...}]'
```

Entries merge cleanly by UUID — no conflicts, no duplicates.

## CLI Commands

```bash
clawck init                  # Create .clawck/ directory with config
clawck serve                 # Start API + dashboard (default: port 3456)
clawck serve --port 8080     # Custom port
clawck mcp                   # Start MCP server on stdio
clawck status                # Show running tasks and stats
clawck report                # Timesheet summary (last 7 days)
clawck report --days 30      # Last 30 days
clawck report --client acme  # Filter by client
clawck seed --count 50       # Generate test data
```

## Configuration

Edit `.clawck/config.json`:

```json
{
  "port": 3456,
  "default_client": "acme-corp",
  "default_project": "general",
  "default_agent": "cubi-01",
  "default_model": "claude-sonnet-4-20250514",
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
  }
}
```

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/start` | Start tracking a task |
| `POST` | `/api/stop` | Stop a running task |
| `POST` | `/api/log` | Log a completed task retroactively |
| `PATCH` | `/api/entries/:id` | Update an entry |
| `GET` | `/api/entries` | Query entries (with filters) |
| `GET` | `/api/entries/:id` | Get a single entry |
| `GET` | `/api/running` | Get currently running tasks |
| `GET` | `/api/timesheet` | Get timesheet summary |
| `GET` | `/api/clients` | List all clients |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/agents` | List all agents |
| `POST` | `/api/ingest` | Bulk import entries |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/stats` | Quick stats |

## Architecture

```
clawck/
  src/
    core/          → Schema, database (SQLite), entry manager
    server/        → REST API (Express) + MCP server (stdio)
    dashboard/     → Single-file HTML dashboard
    cli/           → Command-line interface
    adapters/      → Framework integrations (future)
  .clawck/
    config.json    → Your configuration
    clawck.db      → SQLite database (auto-created)
```

**Design principles:**
- **Zero external dependencies** — SQLite is embedded, no Redis/Postgres/Docker needed
- **One process** — API, dashboard, and MCP all run from the same `clawck serve`
- **Append-only writes** — Entries are created and updated, never deleted
- **UUID-based merging** — Multi-agent data combines without conflicts
- **Configurable multipliers** — Human-equivalent estimates are transparent and adjustable

## ClawckSpec v0.1

Clawck implements an open schema for agent work entries. Any tool can emit ClawckSpec-compatible entries:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "agent": "cubi-research-01",
  "model": "claude-sonnet-4-20250514",
  "client": "acme-corp",
  "project": "grant-research",
  "task": "Find NEA grants matching sustainability criteria",
  "category": "research",
  "start": "2026-03-07T10:00:00Z",
  "end": "2026-03-07T10:47:00Z",
  "status": "completed",
  "tokens_in": 12400,
  "tokens_out": 3200,
  "cost_usd": 0.0852,
  "tool_calls": 8,
  "summary": "Found 12 matching grants totaling $2.4M in available funding",
  "tags": ["grants", "sustainability"],
  "source": "clawck-mcp",
  "spec_version": "0.1.0"
}
```

## Integrations

### Claude Code
Add to `~/.claude/mcp_servers.json`:
```json
{ "clawck": { "command": "npx", "args": ["-y", "clawck", "mcp"] } }
```

### OpenClaw
Instrument at the harness level — auto-start/stop entries on task dispatch.

### n8n
POST to `/api/start` and `/api/stop` from HTTP Request nodes.

### LangGraph / CrewAI / Any Python Framework
```python
import requests

# Start
r = requests.post("http://localhost:3456/api/start", json={
    "task": "Analyze data", "project": "analytics", "agent": "my-agent"
})
entry_id = r.json()["id"]

# Stop
requests.post("http://localhost:3456/api/stop", json={
    "id": entry_id, "status": "completed"
})
```

## Roadmap

- [ ] Python SDK (`pip install clawck`)
- [ ] Auto-instrumentation (monkey-patch LLM client libraries)
- [ ] PDF report export
- [ ] Email digest (weekly summary to clients)
- [ ] Webhooks (notify on task completion)
- [ ] Claude Code hooks adapter
- [ ] OpenTelemetry exporter
- [ ] "Powered by Clawck" embeddable widget

## Contributing

Contributions welcome! Especially:
- **Adapters** — New framework integrations
- **Dashboard** — UI improvements and features
- **Multipliers** — Better human-equivalent estimates backed by data

## License

MIT — use it, fork it, build on it.

---

Built by [CubiCrew](https://cubicrew.com) · Created by [Vince Quarles](https://github.com/vincequarles)
