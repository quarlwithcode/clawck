# Agentic Time Protocol (ATP) Specification v0.2

**Version:** 0.2.0
**Status:** Draft
**Date:** 2026-03-08
**Previous Version:** 0.1.0
**Authors:** Clawck Contributors
**License:** MIT

---

## 1. Introduction

The Agentic Time Protocol (ATP) defines a standard schema for recording, exchanging, and benchmarking time entries produced by AI agents. ATP enables interoperability between agent frameworks, time-tracking tools, and billing systems by providing a common data model for agent work.

ATP v0.2 extends v0.1 with timing instrumentation fields (`agent_runtime_ms`, `wall_clock_ms`) and an embedded comparison object that attaches industry, personal, and agent benchmarks directly to each entry.

## 2. Terminology

- **Entry**: A single unit of tracked agent work, from start to completion or failure.
- **Agent**: An autonomous or semi-autonomous AI system performing tasks.
- **Source Tool**: The software that creates ATP entries (e.g., Clawck, a custom integration).
- **Wall Clock Time**: The total elapsed real-world time from entry start to end.
- **Agent Runtime**: The estimated time the agent actively spent processing (excluding idle, queue, or human wait time).

## 3. Entry Schema

An ATP v0.2 entry is a JSON object conforming to the `ClawckEntry` interface. All string timestamps MUST be in ISO 8601 format with timezone offset or UTC `Z` suffix.

### 3.1 Required Fields

| Field | Type | Constraints | Semantics |
|-------|------|-------------|-----------|
| `id` | `string` | UUID v4, globally unique | Primary identifier for the entry. |
| `agent` | `string` | Non-empty | Identifier of the agent that performed the work (e.g., `"research-agent-01"`). |
| `model` | `string` | Non-empty | LLM model identifier used (e.g., `"claude-sonnet-4-20250514"`). |
| `client` | `string` | Non-empty | Client name or identifier the work is billed to. |
| `project` | `string` | Non-empty | Project name or identifier within the client. |
| `task` | `string` | Non-empty | Human-readable description of the task performed. |
| `category` | `TaskCategory` | Enum (see Section 3.3) | Classification of the task for benchmarking and human-equivalent estimation. |
| `start` | `string` | ISO 8601 datetime | Timestamp when the task began. |
| `end` | `string \| null` | ISO 8601 datetime or `null` | Timestamp when the task ended. `null` indicates the task is still running. |
| `status` | `EntryStatus` | Enum (see Section 3.4) | Current lifecycle state of the entry. |
| `tokens_in` | `number` | Integer >= 0 | Number of input tokens consumed during the task. |
| `tokens_out` | `number` | Integer >= 0 | Number of output tokens generated during the task. |
| `cost_usd` | `number` | >= 0.0 | Estimated cost of the task in US dollars. |
| `tool_calls` | `number` | Integer >= 0 | Number of tool/function calls the agent made during the task. |
| `summary` | `string` | May be empty | Agent-generated summary of the work performed. |
| `tags` | `string[]` | Array of non-empty strings | Arbitrary tags for filtering and categorization. |
| `source` | `string` | Non-empty | Identifier of the source tool that created this entry (e.g., `"clawck"`). |
| `spec_version` | `string` | Semver | ATP specification version this entry conforms to. For v0.2 entries: `"0.2.0"`. |

### 3.2 Optional Fields

| Field | Type | Default | Semantics |
|-------|------|---------|-----------|
| `created_at` | `string` | (auto-generated) | ISO 8601 timestamp of when the entry was first persisted. |
| `updated_at` | `string` | (auto-generated) | ISO 8601 timestamp of the most recent update to the entry. |
| `approved` | `boolean` | `false` | Whether this entry has been reviewed and approved by a human. |
| `agent_runtime_ms` | `number \| null` | `null` | Estimated agent active processing time in milliseconds. Excludes queue wait, human review, and idle time. |
| `wall_clock_ms` | `number \| null` | `null` | Total elapsed wall-clock time in milliseconds from `start` to `end`. Redundant with `start`/`end` but provided for convenience and for cases where start/end are approximate. |
| `comparison` | `EntryComparison \| undefined` | `undefined` | Benchmark comparison data attached to this entry (see Section 4). |

### 3.3 TaskCategory Enum

```
"research" | "content" | "code" | "data_entry" | "design"
| "communication" | "analysis" | "testing" | "planning" | "other"
```

Categories are used to select human-equivalent multipliers and industry benchmarks.

### 3.4 EntryStatus Enum

```
"running" | "completed" | "failed" | "paused"
```

- `running`: Task is actively in progress.
- `completed`: Task finished successfully.
- `failed`: Task terminated due to an error.
- `paused`: Task is temporarily suspended (may be resumed).

## 4. EntryComparison Object

The `comparison` field attaches benchmark data directly to an entry, enabling inline performance analysis without requiring a separate lookup.

### 4.1 Schema

| Field | Type | Required | Semantics |
|-------|------|----------|-----------|
| `industry_benchmark_minutes` | `number` | No | Estimated time in minutes a human professional would take for this task, sourced from industry data. |
| `industry_source` | `string` | No | Citation or identifier for the industry benchmark (e.g., `"Stack Overflow Developer Survey 2024"`). Required when `industry_benchmark_minutes` is present. |
| `personal_benchmark_minutes` | `number` | No | User's own historical average time in minutes for similar tasks. Derived from personal baselines. |
| `agent_runtime_minutes` | `number` | Yes | The agent's processing time in minutes, derived from `agent_runtime_ms` or from `start`/`end` timestamps. |
| `wall_clock_minutes` | `number` | Yes | The total wall-clock duration in minutes, derived from `wall_clock_ms` or from `start`/`end` timestamps. |

### 4.2 Semantics

- When `industry_benchmark_minutes` is provided, `industry_source` SHOULD also be provided to enable traceability.
- `personal_benchmark_minutes` is populated from the user's personal baselines configuration (see Section 6.3).
- `agent_runtime_minutes` and `wall_clock_minutes` are always present in a comparison object. They provide a normalized view of the entry's timing data in minutes.

## 5. Comparison Metadata

### 5.1 How Benchmarks Attach to Entries

Benchmarks are resolved at entry completion time using the following precedence:

1. **Industry benchmarks**: Looked up by `category` and optionally by task description keywords. See `docs/benchmarks-sources.md` for data sources.
2. **Personal benchmarks**: Looked up from `personal_baselines` in the export envelope or user configuration, matched by `category` and optionally `project`.
3. **Agent timing**: Computed from the entry's own `start`, `end`, `agent_runtime_ms`, and `wall_clock_ms` fields.

### 5.2 Benchmarking Dimensions

ATP v0.2 supports four benchmarking dimensions:

#### 5.2.1 Agent vs. Agent
Compare `agent_runtime_minutes` across entries from different agents performing the same category of work. Useful for evaluating model performance (e.g., Claude vs. GPT on code review tasks).

#### 5.2.2 Task vs. Task
Compare `wall_clock_minutes` across entries within the same agent but different task categories. Identifies which work types benefit most from AI assistance.

#### 5.2.3 Cross-Application
Compare `agent_runtime_minutes` or `wall_clock_minutes` against `industry_benchmark_minutes`. Quantifies the speedup factor: `industry_benchmark_minutes / agent_runtime_minutes`.

#### 5.2.4 Personal
Compare `agent_runtime_minutes` or `wall_clock_minutes` against `personal_benchmark_minutes`. Shows how much faster the agent is compared to the specific user's historical performance.

## 6. Export Envelope Format

The `ATPExportEnvelope` is the standard format for exporting, importing, and syncing ATP data between systems.

### 6.1 Schema

```json
{
  "atp_version": "0.2.0",
  "generated_at": "2026-03-08T12:00:00.000Z",
  "source_tool": "clawck",
  "source_version": "0.3.0",
  "entries": [ ... ],
  "benchmarks": { ... },
  "personal_baselines": { ... }
}
```

| Field | Type | Required | Semantics |
|-------|------|----------|-----------|
| `atp_version` | `string` | Yes | ATP specification version. `"0.2.0"` for this version. |
| `generated_at` | `string` | Yes | ISO 8601 timestamp of when this envelope was generated. |
| `source_tool` | `string` | Yes | Name of the tool that produced this export (e.g., `"clawck"`). |
| `source_version` | `string` | Yes | Version of the source tool (e.g., `"0.3.0"`). |
| `entries` | `ClawckEntry[]` | Yes | Array of ATP entries. May be empty. |
| `benchmarks` | `object` | No | Industry benchmark lookup table, keyed by `TaskCategory`. Each value is an object with `minutes` (number) and `source` (string). |
| `personal_baselines` | `object` | No | Personal baseline lookup table, keyed by `TaskCategory`. Each value is an object with `minutes` (number) and optional `project` (string) for project-specific baselines. |

### 6.2 Benchmarks Object

```json
{
  "code": { "minutes": 240, "source": "Industry average for feature development" },
  "content": { "minutes": 180, "source": "Content Marketing Institute 2024" },
  ...
}
```

### 6.3 Personal Baselines Object

```json
{
  "code": { "minutes": 300 },
  "content": { "minutes": 200, "project": "blog" },
  ...
}
```

Personal baselines are optional and user-configured. They represent the user's own historical averages for tasks in each category.

## 7. Versioning and Migration

### 7.1 Version History

| Version | Changes |
|---------|---------|
| `0.1.0` | Initial specification. Core entry fields. |
| `0.2.0` | Added `agent_runtime_ms`, `wall_clock_ms`, `comparison`. Added `ATPExportEnvelope` with `benchmarks` and `personal_baselines`. |

### 7.2 Migrating v0.1 Entries to v0.2

Existing v0.1.0 entries are forward-compatible with v0.2.0. To migrate:

1. Set `agent_runtime_ms` to `null` (unknown for historical entries).
2. Set `wall_clock_ms` to `null`, or compute it from `start` and `end` if both are present: `wall_clock_ms = Date.parse(end) - Date.parse(start)`.
3. Leave `comparison` as `undefined` (omit from JSON). It can be backfilled later if benchmark data is available.
4. Optionally update `spec_version` to `"0.2.0"` once the entry has been processed through a v0.2 pipeline.

### 7.3 Backward Compatibility

- v0.2 consumers MUST accept entries where `agent_runtime_ms`, `wall_clock_ms`, and `comparison` are absent.
- v0.1 consumers SHOULD ignore unrecognized fields per standard JSON forward-compatibility practices.
- The `spec_version` field indicates which version the producer targeted. Consumers should use this to determine which fields to expect.

## 8. Conformance

A tool conforms to ATP v0.2 if:

1. It produces entries with all required fields from Section 3.1 populated with valid values.
2. It sets `spec_version` to `"0.2.0"`.
3. It accepts entries where optional v0.2 fields are absent (backward compatibility).
4. It uses ISO 8601 timestamps for all datetime fields.
5. It generates UUID v4 values for `id` fields.

---

*ATP is an open specification maintained by the Clawck project. Contributions welcome at https://github.com/quarlwithcode/clawck.*
