# Clawck Platform Testing Guide

## Pre-Flight: Get Clawck Running

Before testing on any platform, make sure the server is up:

```bash
# Verify installed
clawck --version   # Should show 0.4.0

# Initialize if not already done
clawck init

# Start the server (leave this running in a terminal)
clawck serve
# Dashboard: http://localhost:3456
```

Keep `clawck serve` running in a background terminal for all tests. Every platform below will write entries to the same database, so you'll see everything show up in one dashboard.

---

## Platform 1: Claude Code (Hooks + MCP -- Terminal)

**What it is:** Claude Code runs in your terminal. It supports both hooks (automatic, fires every turn) and MCP (explicit agent control). Hooks are the recommended default.

### Setup

**Step 1: Install hooks (recommended — automatic tracking)**

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "clawck hook start"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "clawck hook stop"
          }
        ]
      }
    ]
  }
}
```

Or run `clawck hooks install claude` for the full config.

Hooks fire automatically on every turn — no agent cooperation needed. Every prompt submission starts a timer, every stop event ends it. This is the most reliable integration because it doesn't depend on the agent remembering to call tools.

**Step 2: Add MCP server (optional — for explicit agent control)**

If you want the agent to set richer task names, categories, or project metadata, add the MCP server too. Edit `~/.claude/mcp_servers.json` (global) or `.claude/mcp_servers.json` (per-project):

```json
{
  "clawck": {
    "command": "npx",
    "args": ["-y", "clawck", "mcp"]
  }
}
```

This gives agents `clawck_start_task`, `clawck_stop_task`, `clawck_log_task`, `clawck_status`, and `clawck_timesheet` tools. When MCP tools are used alongside hooks, the agent's explicit start/stop overrides the hook's auto-tracking for that turn.

**Step 3: Add CLAUDE.md instructions (only needed if using MCP)**

Add to `~/.claude/CLAUDE.md` (global) or your project's `CLAUDE.md`. Run `clawck setup claude` to get the full snippet. These instructions tell the agent how to use the MCP tools — they're not needed if you're only using hooks.

### Test Sequence

1. Open Claude Code: `claude`
2. Give it a real task: "Read the README.md in this project and suggest 3 improvements"
3. If using hooks: check `clawck status` — an entry should be running automatically
4. If using MCP: watch for `clawck_start_task` and `clawck_stop_task` tool calls in the output
5. Open `http://localhost:3456` — your entry should appear

### What to Verify

- [ ] Entry appears in dashboard with correct task description
- [ ] Duration is reasonable (seconds to minutes, not hours)
- [ ] Category is set (code, research, content, etc.)
- [ ] Agent shows as "claude-code" or similar
- [ ] Multi-turn conversations create separate entries per turn
- [ ] Hooks fire even when the agent doesn't explicitly call MCP tools

---

## Platform 2: Claude Desktop (MCP -- App)

**What it is:** The Claude desktop app supports MCP servers through its config file. Same MCP protocol as Claude Code, different config location.

### Setup

**Step 1: Find your config file**

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Create it if it doesn't exist.

**Step 2: Add Clawck MCP server**

```json
{
  "mcpServers": {
    "clawck": {
      "command": "npx",
      "args": ["-y", "clawck", "mcp"]
    }
  }
}
```

**Step 3: Restart Claude Desktop**

Completely quit and reopen the app. Check the MCP icon (hammer/wrench icon) in the chat -- you should see Clawck's tools listed:
- `clawck_start_task`
- `clawck_stop_task`
- `clawck_log_task`
- `clawck_status`
- `clawck_timesheet`

### Test Sequence

1. Open Claude Desktop
2. Verify MCP tools are visible (click the hammer icon)
3. Tell Claude: "Use your clawck tools to start tracking, then research the top 3 trends in AI agents for 2026, then stop tracking when done"
4. Claude should call `clawck_start_task` -> do the research -> call `clawck_stop_task`
5. Check `http://localhost:3456` for the entry

### What to Verify

- [ ] MCP tools appear in the tool list
- [ ] Claude calls start/stop without being reminded each turn
- [ ] Entry shows up in the dashboard
- [ ] If Claude doesn't auto-track, test with explicit "start your clawck timer" prompt

### Note on Claude Desktop

Claude Desktop's MCP support may require you to explicitly tell the model to use the tools at first. Unlike Claude Code where you can add CLAUDE.md instructions, Desktop doesn't have a persistent system prompt you control. You may need to start each conversation with "Use your Clawck tools to track your time on every response."

---

## Platform 3: Claude Web (claude.ai)

**What it is:** Claude.ai supports URL-based MCP connectors, but Clawck's MCP server is stdio-based (designed for local tools). So we need a different approach.

### The Reality

Clawck's MCP server uses stdio (stdin/stdout), which works for local tools like Claude Code and Cursor. Claude.ai needs URL-based MCP servers (SSE endpoints). Right now there's no direct MCP integration path.

### Option A: REST API via Artifacts (Demo/Showcase)

You can build an artifact that talks to Clawck's REST API. This works if Clawck is running on a publicly accessible server (not localhost from claude.ai's perspective).

**This is mostly useful for demos**, not daily tracking.

### Option B: Manual Logging via Conversation

Log entries after the fact using the CLI:

```bash
clawck log "Testing playbook refinement" --duration 45 --project my-project --client my-client --category planning
```

### Option C: Build an SSE MCP Wrapper (Roadmap)

This is the real unlock. Add an SSE endpoint to Clawck's server so URL-based MCP clients (like claude.ai) can connect:

```
clawck serve --mcp-sse
# Exposes: http://localhost:3456/mcp/sse
```

Then add it as a connector in claude.ai settings. **This should go on the Clawck roadmap** -- it's the feature that makes Clawck work everywhere, not just in IDEs.

### What to Do Now

For claude.ai, just use the CLI to log work manually after sessions. The real play is shipping the SSE MCP endpoint so claude.ai users can connect directly.

---

## Platform 4: OpenClaw

**What it is:** An agent gateway that can run on dedicated hardware. OpenClaw uses behavioral markdown files (AGENT.md, HEARTBEAT.md) to configure agent behavior.

### Setup

**Option A: MCP (if OpenClaw supports MCP servers)**

If OpenClaw has MCP client support, add the same config:

```json
{
  "clawck": {
    "command": "npx",
    "args": ["-y", "clawck", "mcp"]
  }
}
```

**Option B: REST API Integration**

If OpenClaw runs tasks via scripts or workflows, call Clawck's REST API directly:

```bash
# At the start of an agent task
ENTRY_ID=$(curl -s -X POST http://localhost:3456/api/start \
  -H "Content-Type: application/json" \
  -d '{"task": "Handle customer inquiry", "project": "client-support", "client": "acme-corp", "category": "communication", "agent": "receptionist-agent-01"}' \
  | jq -r '.id')

# ... agent does work ...

# At the end
curl -s -X POST http://localhost:3456/api/stop \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"$ENTRY_ID\", \"status\": \"completed\", \"summary\": \"Handled booking inquiry, scheduled appointment\"}"
```

**Option C: Behavioral Files (Agent Self-Tracking)**

Add to your OpenClaw agent's `AGENT.md`:

```markdown
## Generation Time Tracking (Clawck)

You are responsible for measuring your own generation time using Clawck MCP tools.
This is NOT human time tracking -- you are timing how long YOUR computation takes per turn.

### Rules
- Start the timer (`clawck_start_task`) at the START of every turn.
- Stop the timer (`clawck_stop_task`) at the END of every turn.
- One turn = one time entry.
- Always stop on failure with `status: "failed"`.
- Never skip timing. Never ask permission.
```

Add to `HEARTBEAT.md` (per-turn hooks):

```markdown
## Per-Turn Timing
1. On message received -> `clawck_start_task` with task, project, client, category
2. On response complete -> `clawck_stop_task` with entry ID, status, summary
3. On error -> `clawck_stop_task` with `status: "failed"`
```

### Test Sequence

1. Deploy Clawck alongside OpenClaw on the target machine
2. Send a test message to the agent via its configured channel (Telegram, Slack, etc.)
3. Check `clawck status` on the machine
4. Verify entry appears with correct client/project mapping

### What to Verify

- [ ] Entries are created for each agent interaction
- [ ] Client and project fields map correctly
- [ ] Duration reflects actual agent processing time, not human wait time
- [ ] Failed interactions are logged with `status: "failed"`

### Client-Facing Reports

Each OpenClaw instance generates its own Clawck reports. Monthly, you can run:

```bash
clawck report --format html --days 30 --client acme-corp -o acme-march-2026.html
```

Send that to the client. They see exactly what their AI agent did, how much time it saved, and the dollar value.

---

## Platform 5: Cursor

**What it is:** AI-powered code editor with MCP support. Configuration is per-project.

### Setup

**Step 1: Create MCP config**

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "clawck": {
      "command": "npx",
      "args": ["-y", "clawck", "mcp"]
    }
  }
}
```

**Step 2 (Optional): Add hooks**

Create `.cursor/hooks.json`:

```json
{
  "hooks": {
    "pre_user_prompt": [
      {
        "type": "command",
        "command": "clawck hook start"
      }
    ],
    "stop": [
      {
        "type": "command",
        "command": "clawck hook stop"
      }
    ]
  }
}
```

**Step 3: Restart Cursor**

Reopen the project. The MCP server should initialize automatically.

### Test Sequence

1. Open a project in Cursor with the MCP config
2. Use Cursor's AI chat: "Refactor this function to use async/await"
3. Check if Clawck tools are called
4. Verify at `http://localhost:3456`
5. Run `clawck hooks status` to check hook detection

### What to Verify

- [ ] MCP server initializes (check Cursor's MCP panel if available)
- [ ] Entries appear in the dashboard
- [ ] Agent identified as "cursor"
- [ ] Project inferred from workspace directory

---

## Cross-Platform Verification Checklist

After testing on at least 2-3 platforms, verify these in the dashboard:

### Data Quality
- [ ] Different agents appear (claude-code, cursor, receptionist-agent-01, etc.)
- [ ] Task descriptions are meaningful, not generic
- [ ] Categories are set appropriately
- [ ] Durations are realistic (seconds-minutes for IDE, minutes for OpenClaw)

### Dashboard
- [ ] Stats cards show correct totals
- [ ] Savings banner calculates properly
- [ ] By Agent tab shows breakdown per platform
- [ ] By Project tab groups correctly

### Reports
- [ ] `clawck report --format html` generates a clean report
- [ ] `clawck report --format pdf` generates a valid PDF
- [ ] Multi-platform entries appear together in one report

### The Screenshot Test
- [ ] Take a screenshot of the dashboard after 1 day of real use
- [ ] Does it look impressive enough for LinkedIn?
- [ ] Is the savings number prominent?
- [ ] Would someone who knows nothing about Clawck understand the value in 5 seconds?

---

## Showcase Polish Checklist (Before Marketing)

### Version Sync
- [ ] `package.json` version matches everywhere
- [ ] MCP server `serverInfo.version` matches
- [ ] API `/api/health` version matches
- [ ] README badges (if any) match

### First-Run Experience
- [ ] `npm install -g clawck && clawck init && clawck serve` works in under 60 seconds
- [ ] Dashboard loads with clear empty state, not errors
- [ ] `clawck seed` generates convincing demo data
- [ ] `clawck setup claude` outputs clean, copy-pasteable config

### Dashboard Visual Pass
- [ ] Savings banner is visually dominant (this is your hero metric)
- [ ] No layout issues at common screen widths
- [ ] Dark theme looks polished in screenshots

### README / GitHub
- [ ] Hero screenshot of dashboard at the top of README
- [ ] Quick start works as written (test fresh install)
- [ ] All links resolve
- [ ] License and attribution are clean

### The LinkedIn Screenshot
- [ ] Dashboard with real data (not seeded)
- [ ] At least 3-4 hours of tracked agent work visible
- [ ] Savings number is compelling ($100+)
- [ ] Multiple agents/projects showing activity

---

## Roadmap Items Discovered

Based on this testing guide, these should go on the Clawck roadmap:

1. **SSE MCP endpoint** -- Enables claude.ai, web-based tools, and remote MCP clients
2. **Auto-detect project from cwd** -- Less manual field-setting for IDE users
3. **Dashboard screenshot mode** -- One-click clean export for social sharing
4. **Client-facing report template** -- Branded HTML report for sending to clients
5. **`clawck doctor`** -- Diagnostic command that checks version sync, MCP connectivity, hook installation status
