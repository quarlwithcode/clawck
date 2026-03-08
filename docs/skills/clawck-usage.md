# Clawck Usage Protocol

Detailed guide for AI agents using Clawck to measure their own generation time.

## What Clawck Measures

Clawck measures **your active generation/computation time** — the wall-clock duration from when you start processing a user message to when you finish generating your response. This is NOT human time tracking. Typical durations are seconds to minutes. Think of it as a stopwatch on your own CPU.

The resulting data enables:
- **Billing**: How much compute time each task consumed
- **Cost analysis**: Tokens + cost per task/project/client
- **Human-equivalent estimates**: How long this work would take a human (calculated from the `category`)
- **ROI reporting**: Agent cost vs. human-equivalent cost

## Generation Lifecycle

Every agent turn follows this lifecycle:

```
User message received
        │
        ▼
┌─ clawck_start_task ──────────┐
│  (start generation timer)    │
└──────────────────────────────┘
        │
        ▼
┌─ Process request ────────────┐
│  • Reason / plan             │
│  • Call tools                │
│  • Write code                │
│  • Generate output           │
│  (all ONE generation cycle)  │
└──────────────────────────────┘
        │
        ▼
┌─ clawck_stop_task ───────────┐
│  (stop generation timer)     │
└──────────────────────────────┘
        │
        ▼
Send response to user
```

## Multi-Message Tracking

Each turn in a conversation is timed independently:

| Turn | User Says | Agent Times |
|------|-----------|-------------|
| 1 | "Fix the login bug" | start → generate → stop (entry 1) |
| 2 | "Add tests for it" | start → generate → stop (entry 2) |
| 3 | "Deploy to staging" | start → generate → stop (entry 3) |

A 5-message session produces 5 time entries. This gives granular visibility into what each generation cycle cost.

## Field Guidelines

### task
Describe what YOU (the agent) are doing, not what the user asked:
- Good: "Refactor auth module to use JWT tokens"
- Bad: "User asked me to fix authentication"

### project
The project being worked on. Infer from context, directory name, or ask once and reuse:
- "website-rebuild", "grant-research", "api-v2"

### client
The client or organization. Infer from context or prior entries:
- "acme-corp", "internal", "cubicrew"

### category
Classify the type of work. Available categories:
- `code` — Writing, reviewing, or refactoring code
- `research` — Searching, reading, analyzing information
- `content` — Writing docs, emails, copy, blog posts
- `analysis` — Data analysis, reporting, insights
- `data_entry` — Data migration, formatting, entry
- `communication` — Emails, messages, outreach
- `testing` — Writing or running tests
- `design` — UI/UX design, mockups, wireframes

### summary (on stop)
Brief description of what was accomplished:
- "Fixed JWT token refresh logic and added error handling"
- "Searched 3 grant databases, found 2 relevant opportunities"

### tokens / cost (on stop)
Report if your platform provides this data:
- `tokens_in`: Input tokens consumed this turn
- `tokens_out`: Output tokens generated this turn
- `cost_usd`: Estimated cost in USD

## Edge Cases

### Errors / Failures
Always stop the timer even when things go wrong:
```
clawck_stop_task({ id: "...", status: "failed", summary: "Build failed due to missing dependency" })
```

### Forgot to Start the Timer
Use retroactive logging:
```
clawck_log_task({ task: "Debug API timeout", duration_minutes: 3, project: "api-v2", category: "code" })
```

### Long Generations
If a turn takes unusually long (e.g., large codebase analysis), that's fine — one turn = one entry regardless of duration.

### Idle Time Between Turns
Do NOT track time between turns. Only measure your active generation time within a turn. The time between your response and the user's next message is NOT your computation — don't record it.

### Sub-Tasks Within a Turn
All work within one turn is a single entry. If you call 10 tools during one turn, that's still ONE generation cycle. Don't create separate entries for each tool call.

## Examples

### Basic Turn
```
1. Receive: "Add input validation to the signup form"
2. clawck_start_task({ task: "Add input validation to signup form", project: "website", client: "acme-corp", category: "code" })
   → Timer starts. Your generation begins.
3. Read files, write code, run tests
4. clawck_stop_task({ id: "abc-123", status: "completed", summary: "Added email format and password strength validation", tokens_out: 1500 })
   → Timer stops. Your generation is complete.
5. Send response
```

### Failed Task
```
1. Receive: "Deploy to production"
2. clawck_start_task({ task: "Deploy to production", project: "api-v2", client: "acme-corp", category: "code" })
3. Attempt deployment, encounter error
4. clawck_stop_task({ id: "def-456", status: "failed", summary: "Deploy failed: missing ENV vars on production server" })
5. Send error response to user
```

### Retroactive Log
```
1. Receive: "What was that error about?"
2. Realize forgot to start timer on previous turn
3. clawck_log_task({ task: "Diagnosed API timeout in payment service", duration_minutes: 2, project: "api-v2", category: "code" })
4. clawck_start_task({ task: "Explain previous API timeout diagnosis", project: "api-v2", category: "communication" })
5. Explain the error
6. clawck_stop_task({ id: "ghi-789", status: "completed", summary: "Explained root cause of API timeout to user" })
7. Send response
```
