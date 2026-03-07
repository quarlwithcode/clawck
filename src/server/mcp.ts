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
    description: 'Start tracking time for a new task. Call this when beginning work on a task, project, or client deliverable. Returns the entry ID needed to stop the timer later.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What work is being done (e.g., "Research grant opportunities for NEA funding")' },
        project: { type: 'string', description: 'Project name (e.g., "grant-research", "website-rebuild")' },
        client: { type: 'string', description: 'Client name (e.g., "acme-corp")' },
        category: { type: 'string', enum: TASK_CATEGORIES, description: 'Type of work for human-equivalent time estimates' },
        agent: { type: 'string', description: 'Agent name/identifier' },
        model: { type: 'string', description: 'Model being used (e.g., "claude-sonnet-4-20250514")' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering' },
      },
      required: ['task'],
    },
  },
  {
    name: 'clawck_stop_task',
    description: 'Stop tracking time for a task. Call this when finished with a task. Provide the entry ID from clawck_start_task.',
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
    description: 'Log a completed task retroactively (when you forgot to start the timer). Provide the duration and details.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What work was done' },
        duration_minutes: { type: 'number', description: 'How long the task took in minutes' },
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
    description: 'Get currently running tasks and overall Clawck stats.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'clawck_timesheet',
    description: 'Get a timesheet summary for a date range. Shows agent hours, human equivalent hours, costs, and savings.',
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
            serverInfo: { name: 'clawck', version: '0.1.0' },
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
              result = `⏱️ Timer started!\n\nEntry ID: ${entry.id}\nTask: ${entry.task}\nProject: ${entry.project}\nClient: ${entry.client}\nStarted: ${entry.start}\n\n💡 Call clawck_stop_task with id="${entry.id}" when done.`;
              break;
            }
            case 'clawck_stop_task': {
              const entry = clawck.stop(args);
              if (!entry) {
                result = `❌ Entry not found: ${args.id}`;
              } else {
                const dur = entry.end
                  ? ((new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000).toFixed(1)
                  : '?';
                result = `⏱️ Timer stopped!\n\nTask: ${entry.task}\nDuration: ${dur} minutes\nStatus: ${entry.status}\nTokens: ${entry.tokens_in + entry.tokens_out}\nCost: $${entry.cost_usd.toFixed(4)}`;
              }
              break;
            }
            case 'clawck_log_task': {
              const entry = clawck.log(args);
              result = `📝 Task logged!\n\nEntry ID: ${entry.id}\nTask: ${entry.task}\nDuration: ${args.duration_minutes} minutes\nProject: ${entry.project}\nClient: ${entry.client}`;
              break;
            }
            case 'clawck_status': {
              const running = clawck.running();
              const stats = clawck.stats();
              const runningList = running.length > 0
                ? running.map(e => `  • ${e.task} (${e.project}/${e.client}) — started ${e.start}`).join('\n')
                : '  No tasks running';
              result = `🦀 Clawck Status\n\n📊 Total entries: ${stats.total_entries}\n🏃 Running: ${stats.running}\n👥 Clients: ${stats.clients}\n📁 Projects: ${stats.projects}\n🤖 Agents: ${stats.agents}\n\n⏱️ Running tasks:\n${runningList}`;
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
              result = `📋 Timesheet (${ts.period_start.split('T')[0]} → ${ts.period_end.split('T')[0]})\n\n` +
                `⏱️  Agent hours:     ${ts.total_agent_hours.toFixed(1)} hrs\n` +
                `👤 Human equiv:     ${ts.total_human_equiv_hours.toFixed(1)} hrs\n` +
                `💰 Agent cost:      $${ts.total_cost_usd.toFixed(2)}\n` +
                `💚 Est. savings:    $${ts.total_savings_usd.toFixed(2)}\n` +
                `🔢 Total entries:   ${ts.total_entries}\n` +
                `🪙 Total tokens:    ${ts.total_tokens.toLocaleString()}\n\n` +
                `📁 By Project:\n${ts.by_project.map(p => `  • ${p.project} (${p.client}): ${p.agent_hours.toFixed(1)}h agent → ${p.human_equiv_hours.toFixed(1)}h human equiv`).join('\n') || '  None'}\n\n` +
                `🤖 By Agent:\n${ts.by_agent.map(a => `  • ${a.agent} (${a.model}): ${a.agent_hours.toFixed(1)}h, ${a.success_rate}% success`).join('\n') || '  None'}`;
              break;
            }
            default:
              result = `Unknown tool: ${name}`;
          }

          send({
            jsonrpc: '2.0', id,
            result: { content: [{ type: 'text', text: result }] },
          });
        } catch (err: any) {
          send({
            jsonrpc: '2.0', id,
            result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true },
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
