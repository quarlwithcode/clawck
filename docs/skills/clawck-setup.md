# Clawck Setup Guide

Integrate Clawck generation time tracking into your AI agent platform. Clawck measures how long an AI agent's computation, reasoning, and response generation take per turn — it is NOT human time tracking.

## Claude Code

### 1. Add MCP Server

Add to your `mcp_servers.json` (or `~/.claude/mcp_servers.json` for global):

```json
{
  "clawck": {
    "command": "npx",
    "args": ["-y", "clawck", "mcp"],
    "env": {}
  }
}
```

### 2. Add CLAUDE.md Instructions

Add the following to your project's `CLAUDE.md` (or `~/.claude/CLAUDE.md` for global):

```markdown
## Generation Time Tracking (Clawck)

You have Clawck tools via MCP that measure YOUR generation time — how long your computation, reasoning, tool calls, and response generation take. This is NOT human time tracking. You are timing your own AI processing.

You MUST time every turn automatically:

1. **Start of every turn**: Call `clawck_start_task` IMMEDIATELY when you receive a message, BEFORE doing any other work.
2. **End of every turn**: Call `clawck_stop_task` as the LAST action before sending your reply.
3. **Every turn**: Each user message = one generation cycle. A 5-message conversation = 5 time entries.
4. **Errors**: Always stop the timer even on failure — use `status: "failed"`.
5. **Forgot to start?** Use `clawck_log_task` with an estimated duration.
```

Run `clawck setup claude` to get the full snippet.

## OpenClaw

OpenClaw agents use behavioral files for persistent integration:

### AGENT.md

Add clawck rules to your `AGENT.md`. Run `clawck setup openclaw` for the snippet.

### HEARTBEAT.md

Add per-turn hooks to your `HEARTBEAT.md`. Run `clawck setup openclaw` for the snippet.

### SOUL.md

Add accountability identity to your `SOUL.md`:

```markdown
I track my own work time using Clawck. Every turn I clock in and out automatically.
This is part of my accountability to the humans I work for — they deserve to know
how their AI resources are being spent.
```

## Cursor / Cline / Windsurf

These editors support MCP servers. Add the clawck MCP config to:

- **Cursor**: `.cursor/mcp.json` in your project root
- **Cline**: VS Code settings → Cline → MCP Servers
- **Windsurf**: `.windsurf/mcp.json` in your project root

The MCP config block is the same for all:

```json
{
  "clawck": {
    "command": "npx",
    "args": ["-y", "clawck", "mcp"],
    "env": {}
  }
}
```

## API Agents (Python / n8n / LangGraph)

For agents that don't support MCP natively, use the Clawck REST API:

### Start the server

```bash
clawck serve --port 3456
```

### Python wrapper

```python
import requests
import time

CLAWCK_URL = "http://localhost:3456/api"

def clawck_start(task, project="", client="", category="code"):
    r = requests.post(f"{CLAWCK_URL}/start", json={
        "task": task, "project": project, "client": client, "category": category
    })
    return r.json()["id"]

def clawck_stop(entry_id, status="completed", summary=""):
    requests.post(f"{CLAWCK_URL}/stop", json={
        "id": entry_id, "status": status, "summary": summary
    })
```

### n8n / LangGraph

Use HTTP Request nodes to call the REST API at `http://localhost:3456/api/start` and `/api/stop` at the beginning and end of each agent turn.

## Quick Start CLI

```bash
# See all setup options
clawck setup

# Get CLAUDE.md snippet
clawck setup claude

# Get MCP config JSON
clawck setup mcp

# Get OpenClaw snippets
clawck setup openclaw
```
