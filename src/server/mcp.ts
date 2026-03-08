/**
 * ⏱️🦀 Clawck — MCP Server (stdio)
 * Implements the Model Context Protocol for agent tool integration.
 * Claude Code, Cline, Cursor, etc. can use this to clock in/out.
 */

import { Clawck } from '../core/clawck';
import { ClawckConfig, DEFAULT_CONFIG, TASK_CATEGORIES } from '../core/types';
import * as readline from 'readline';

const TOOLS = [
  {
    name: 'clawck_start_task',
    description: 'Clock yourself in — start tracking YOUR (the AI agent\'s) time on a task. Call this when you begin generating, reasoning, writing code, or taking actions for a task. Returns the entry ID needed to clock out later.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What you (the AI agent) are working on (e.g., "Research grant opportunities for NEA funding")' },
        project: { type: 'string', description: 'Project name (e.g., "grant-research", "website-rebuild")' },
        client: { type: 'string', description: 'Client name (e.g., "acme-corp")' },
        category: { type: 'string', enum: TASK_CATEGORIES, description: 'Type of work — used to estimate how long a human would take to do the same task' },
        agent: { type: 'string', description: 'Agent name/identifier' },
        model: { type: 'string', description: 'Model being used (e.g., "claude-sonnet-4-20250514")' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering' },
      },
      required: ['task'],
    },
  },
  {
    name: 'clawck_stop_task',
    description: 'Clock yourself out — stop tracking YOUR (the AI agent\'s) time on a task. Call this when you finish generating your response, complete your actions, or are done with the task. Provide the entry ID from clawck_start_task.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID from clawck_start_task' },
        status: { type: 'string', enum: ['completed', 'failed'], description: 'Outcome of the task' },
        summary: { type: 'string', description: 'Brief summary of what was accomplished' },
        tokens_in: { type: 'number', description: 'Input tokens consumed' },
        tokens_out: { type: 'number', description: 'Output tokens generated' },
        cost_usd: { type: 'number', description: 'Estimated cost in USD' },
        tool_calls: { type: 'number', description: 'Number of tool calls made' },
      },
      required: ['id'],
    },
  },
  {
    name: 'clawck_log_task',
    description: 'Log your own completed work retroactively — use when you (the AI agent) did work but forgot to call clawck_start_task beforehand. Provide the duration of your computation/actions and details.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What you (the AI agent) did' },
        duration_minutes: { type: 'number', description: 'How long your (the AI agent\'s) work took in minutes' },
        project: { type: 'string', description: 'Project name' },
        client: { type: 'string', description: 'Client name' },
        category: { type: 'string', enum: TASK_CATEGORIES, description: 'Type of work' },
        agent: { type: 'string', description: 'Agent name' },
        model: { type: 'string', description: 'Model used' },
        summary: { type: 'string', description: 'Summary of work done' },
        tokens_in: { type: 'number', description: 'Input tokens consumed' },
        tokens_out: { type: 'number', description: 'Output tokens generated' },
        cost_usd: { type: 'number', description: 'Estimated cost in USD' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      },
      required: ['task', 'duration_minutes'],
    },
  },
  {
    name: 'clawck_status',
    description: 'Get your currently running time entries and overall Clawck stats. Shows what you (the AI agent) are clocked into right now.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'clawck_timesheet',
    description: 'Get a timesheet summary of AI agent work for a date range. Shows agent computation hours, human-equivalent hours, costs, and savings.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (ISO 8601, defaults to 7 days ago)' },
        to: { type: 'string', description: 'End date (ISO 8601, defaults to now)' },
        client: { type: 'string', description: 'Filter by client' },
        project: { type: 'string', description: 'Filter by project' },
        agent: { type: 'string', description: 'Filter by agent' },
      },
    },
  },
  {
    name: 'clawck_get_entry',
    description: 'Get a single time entry by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'clawck_query_entries',
    description: 'Query time entries with filters. Returns up to `limit` entries (default 50).',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Filter by client' },
        project: { type: 'string', description: 'Filter by project' },
        agent: { type: 'string', description: 'Filter by agent' },
        status: { type: 'string', description: 'Filter by status (running, completed, failed, paused)' },
        from: { type: 'string', description: 'Start date (ISO 8601)' },
        to: { type: 'string', description: 'End date (ISO 8601)' },
        limit: { type: 'number', description: 'Max entries to return (default 50)' },
      },
    },
  },
  {
    name: 'clawck_update_entry',
    description: 'Update fields on an existing time entry.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID to update' },
        task: { type: 'string', description: 'Updated task description' },
        project: { type: 'string', description: 'Updated project' },
        client: { type: 'string', description: 'Updated client' },
        status: { type: 'string', description: 'Updated status' },
        summary: { type: 'string', description: 'Updated summary' },
        tokens_in: { type: 'number', description: 'Updated input tokens' },
        tokens_out: { type: 'number', description: 'Updated output tokens' },
        cost_usd: { type: 'number', description: 'Updated cost' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Updated tags' },
      },
      required: ['id'],
    },
  },
  {
    name: 'clawck_list_metadata',
    description: 'List unique clients, projects, or agents.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['clients', 'projects', 'agents'], description: 'Type of metadata to list' },
      },
      required: ['type'],
    },
  },
];

export async function startMCPServer(config: Partial<ClawckConfig> = {}): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const clawck = await new Clawck(fullConfig).ready();

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let buffer = '';

  function send(msg: any): void {
    const json = JSON.stringify(msg);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  function handleMessage(msg: any): void {
    const { id, method, params } = msg;

    switch (method) {
      case 'initialize':
        send({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'clawck', version: '0.4.0' },
            instructions: `Clawck measures YOUR generation time — you, the AI agent, are the worker being timed. This is NOT human time tracking. You are measuring how long YOUR computation, reasoning, tool calls, and response generation take per turn. The resulting durations are typically seconds to minutes — the wall-clock time from when you start processing to when you finish generating.

## Generation Lifecycle Protocol
A "turn" is one message-received → message-sent cycle. You MUST time every turn automatically:

1. **START the timer immediately** when you receive a user message — call \`clawck_start_task\` BEFORE doing any other work. This marks the start of your generation.
2. **Process** the request (reason, call tools, write code, etc.). All tool calls within this turn are ONE generation cycle, not separate entries.
3. **STOP the timer** when your response is complete — call \`clawck_stop_task\` as the LAST action before sending your reply. This marks the end of your generation.

## What You Are Measuring
You are measuring YOUR active computation time — the time your model spends generating, reasoning, calling tools, and producing output. You are NOT tracking human work hours or project time. Think of it like a stopwatch on your own CPU: start when you begin processing, stop when you finish.

## Rules
- **Automatic**: Do this every turn without user prompting. Do not ask permission.
- **Multi-turn**: Each turn = one entry. A 5-message session = 5 separate time entries.
- **Always stop**: Even on errors or failures, call \`clawck_stop_task\` with \`status: "failed"\`.
- **Retroactive**: If you forgot to start the timer, use \`clawck_log_task\` with an estimated duration.
- **No idle time**: Do NOT track time between turns. Only measure your active generation within a turn.
- **Fields**: Always include \`project\` and \`client\` if known. Report \`tokens_in\`, \`tokens_out\`, and \`cost_usd\` when stopping if available. Use \`category\` to classify the type of work (code, research, content, etc.).
- **Task description**: Describe what YOU are doing this turn, e.g. "Refactor auth module per user request", not "User asked me to refactor".
- **Summary on stop**: Briefly describe what was accomplished or why it failed.`,
          },
        });
        break;

      case 'notifications/initialized':
        // Client acknowledged — no response needed
        break;

      case 'tools/list':
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        break;

      case 'tools/call': {
        const { name, arguments: args } = params;
        let result: any;

        try {
          switch (name) {
            case 'clawck_start_task': {
              const entry = clawck.start(args);
              result = JSON.stringify({ ok: true, entry });
              break;
            }
            case 'clawck_stop_task': {
              const entry = clawck.stop(args);
              if (!entry) {
                result = JSON.stringify({ ok: false, error: `Entry not found: ${args.id}` });
              } else {
                const duration_minutes = entry.end
                  ? +((new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000).toFixed(1)
                  : null;
                result = JSON.stringify({ ok: true, entry, duration_minutes });
              }
              break;
            }
            case 'clawck_log_task': {
              const entry = clawck.log(args);
              result = JSON.stringify({ ok: true, entry });
              break;
            }
            case 'clawck_status': {
              const running = clawck.running();
              const stats = clawck.stats();
              result = JSON.stringify({ ok: true, stats, running });
              break;
            }
            case 'clawck_timesheet': {
              const now = new Date();
              const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
              const ts = clawck.timesheet(
                args.from || weekAgo.toISOString(),
                args.to || now.toISOString(),
                { client: args.client, project: args.project, agent: args.agent }
              );
              result = JSON.stringify({ ok: true, timesheet: ts });
              break;
            }
            case 'clawck_get_entry': {
              const entry = clawck.get(args.id);
              if (!entry) {
                result = JSON.stringify({ ok: false, error: `Entry not found: ${args.id}` });
              } else {
                result = JSON.stringify({ ok: true, entry });
              }
              break;
            }
            case 'clawck_query_entries': {
              const entries = clawck.query({
                client: args.client,
                project: args.project,
                agent: args.agent,
                status: args.status,
                from: args.from,
                to: args.to,
                limit: args.limit ?? 50,
              });
              result = JSON.stringify({ ok: true, entries, count: entries.length });
              break;
            }
            case 'clawck_update_entry': {
              const { id, ...fields } = args;
              const entry = clawck.update(id, fields);
              if (!entry) {
                result = JSON.stringify({ ok: false, error: `Entry not found: ${id}` });
              } else {
                result = JSON.stringify({ ok: true, entry });
              }
              break;
            }
            case 'clawck_list_metadata': {
              const type = args.type as 'clients' | 'projects' | 'agents';
              const values = clawck[type]();
              result = JSON.stringify({ ok: true, type, values });
              break;
            }
            default:
              result = JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
          }

          send({
            jsonrpc: '2.0', id,
            result: { content: [{ type: 'text', text: result }] },
          });
        } catch (err: any) {
          send({
            jsonrpc: '2.0', id,
            result: { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: err.message }) }], isError: true },
          });
        }
        break;
      }

      default:
        if (id) {
          send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
        }
    }
  }

  // Parse Content-Length delimited JSON-RPC messages from stdin
  rl.on('line', (line) => {
    buffer += line + '\n';

    // Try to parse complete messages
    while (buffer.includes('\r\n\r\n') || buffer.includes('\n\n')) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      const altEnd = buffer.indexOf('\n\n');
      const end = headerEnd !== -1 ? headerEnd : altEnd;
      const sep = headerEnd !== -1 ? '\r\n\r\n' : '\n\n';

      if (end === -1) break;

      const header = buffer.substring(0, end);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);

      if (contentLengthMatch) {
        const length = parseInt(contentLengthMatch[1]);
        const bodyStart = end + sep.length;
        const remaining = buffer.substring(bodyStart);

        if (remaining.length >= length) {
          const body = remaining.substring(0, length);
          buffer = remaining.substring(length);

          try {
            const msg = JSON.parse(body);
            handleMessage(msg);
          } catch (e) {
            // Malformed JSON — skip
          }
        } else {
          break; // Wait for more data
        }
      } else {
        // No content-length header — try parsing as plain JSON line
        const lines = buffer.split('\n').filter(l => l.trim());
        buffer = '';
        for (const l of lines) {
          try {
            const msg = JSON.parse(l.trim());
            handleMessage(msg);
          } catch (e) {
            // Not JSON — skip
          }
        }
      }
    }
  });

  process.stderr.write('⏱️🦀 Clawck MCP server running on stdio\n');
}
