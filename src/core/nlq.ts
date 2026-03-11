/**
 * ⏱️🦀 Clawck — Natural Language Query Parser
 * Parse common time-tracking questions using regex patterns (no LLM required).
 */

import { ClawckDB } from './database';
import { TimesheetSummary, ClawckEntry } from './types';

export interface NLQResult {
  understood: boolean;
  query_type?: string;
  response?: string;
  data?: any;
  suggestion?: string;
}

interface DateRange {
  from: string;
  to: string;
  label: string;
}

/**
 * Parse a natural language time reference into a date range.
 */
function parseTimeReference(text: string): DateRange | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Normalize text
  const lower = text.toLowerCase().trim();

  // Today
  if (/\btoday\b/.test(lower)) {
    const start = today.toISOString();
    const end = new Date(today.getTime() + 86400000).toISOString();
    return { from: start, to: end, label: 'today' };
  }

  // Yesterday
  if (/\byesterday\b/.test(lower)) {
    const yesterday = new Date(today.getTime() - 86400000);
    return {
      from: yesterday.toISOString(),
      to: today.toISOString(),
      label: 'yesterday',
    };
  }

  // This week (Monday to now)
  if (/\bthis week\b/.test(lower)) {
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 6 days back
    const monday = new Date(today.getTime() - mondayOffset * 86400000);
    return {
      from: monday.toISOString(),
      to: now.toISOString(),
      label: 'this week',
    };
  }

  // Last week
  if (/\blast week\b/.test(lower)) {
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today.getTime() - mondayOffset * 86400000);
    const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
    const lastSunday = new Date(thisMonday.getTime());
    return {
      from: lastMonday.toISOString(),
      to: lastSunday.toISOString(),
      label: 'last week',
    };
  }

  // This month
  if (/\bthis month\b/.test(lower)) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: monthStart.toISOString(),
      to: now.toISOString(),
      label: 'this month',
    };
  }

  // Last month
  if (/\blast month\b/.test(lower)) {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      from: lastMonthStart.toISOString(),
      to: thisMonthStart.toISOString(),
      label: 'last month',
    };
  }

  // All time
  if (/\ball time\b/.test(lower) || /\bever\b/.test(lower)) {
    return {
      from: '1970-01-01T00:00:00.000Z',
      to: now.toISOString(),
      label: 'all time',
    };
  }

  // Last N days
  const daysMatch = lower.match(/\blast\s+(\d+)\s+days?\b/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const start = new Date(today.getTime() - days * 86400000);
    return {
      from: start.toISOString(),
      to: now.toISOString(),
      label: `last ${days} days`,
    };
  }

  return null;
}

/**
 * Extract project/client name from query.
 */
function extractProjectOrClient(text: string, field: 'project' | 'client'): string | null {
  const lower = text.toLowerCase();

  // Patterns like "on project X", "for client Y"
  const patterns = field === 'project'
    ? [/\bon\s+(?:project\s+)?['""]?([a-zA-Z0-9_-]+)['""]?/i, /\bproject\s+['""]?([a-zA-Z0-9_-]+)['""]?/i]
    : [/\bfor\s+(?:client\s+)?['""]?([a-zA-Z0-9_-]+)['""]?/i, /\bclient\s+['""]?([a-zA-Z0-9_-]+)['""]?/i];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Extract agent name from query.
 */
function extractAgent(text: string): string | null {
  const match = text.match(/\b(?:agent\s+)?['""]?([a-zA-Z0-9_-]+)['""]?\s+work(?:ed)?\s+on/i);
  if (match) return match[1];

  const didMatch = text.match(/\bwhat did\s+['""]?([a-zA-Z0-9_-]+)['""]?\s+/i);
  if (didMatch) return didMatch[1];

  return null;
}

/**
 * Format duration nicely.
 */
function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  return `${hours.toFixed(2)} hours`;
}

/**
 * Process natural language query against the database.
 */
export function processNLQ(question: string, db: ClawckDB): NLQResult {
  const q = question.toLowerCase().trim();

  // ─── Pattern 1: "how much time on [project] [time period]" ─────
  if (/\bhow much time\b/.test(q) || /\bhow long\b/.test(q)) {
    const project = extractProjectOrClient(question, 'project');
    const client = extractProjectOrClient(question, 'client');
    const timeRange = parseTimeReference(q) || {
      from: new Date(Date.now() - 7 * 86400000).toISOString(),
      to: new Date().toISOString(),
      label: 'last 7 days'
    };

    const ts = db.getTimesheet(timeRange.from, timeRange.to, { project: project || undefined, client: client || undefined });
    const subject = project ? `project "${project}"` : client ? `client "${client}"` : 'all projects';

    return {
      understood: true,
      query_type: 'time_on_project',
      response: `You spent ${formatDuration(ts.total_agent_hours)} on ${subject} ${timeRange.label} (${ts.total_entries} entries).`,
      data: {
        total_hours: ts.total_agent_hours,
        total_entries: ts.total_entries,
        period: timeRange.label,
        filter: project || client || null,
      },
    };
  }

  // ─── Pattern 2: "what was my busiest [day|week|project|category]" ─────
  if (/\bbusiest\b/.test(q)) {
    const timeRange = parseTimeReference(q) || {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
      label: 'last 30 days',
    };

    const ts = db.getTimesheet(timeRange.from, timeRange.to);

    if (/\bday\b/.test(q)) {
      // Group by day and find max
      const byDay = new Map<string, number>();
      for (const entry of ts.entries) {
        const hours = entry.duration_minutes / 60;
        byDay.set(entry.date, (byDay.get(entry.date) || 0) + hours);
      }
      const sorted = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
      const busiest = sorted[0];

      if (!busiest) {
        return { understood: true, query_type: 'busiest_day', response: 'No entries found in this period.' };
      }

      return {
        understood: true,
        query_type: 'busiest_day',
        response: `Your busiest day was ${busiest[0]} with ${formatDuration(busiest[1])}.`,
        data: { date: busiest[0], hours: busiest[1] },
      };
    }

    if (/\bproject\b/.test(q)) {
      const sorted = [...ts.by_project].sort((a, b) => b.agent_hours - a.agent_hours);
      const busiest = sorted[0];

      if (!busiest) {
        return { understood: true, query_type: 'busiest_project', response: 'No projects found in this period.' };
      }

      return {
        understood: true,
        query_type: 'busiest_project',
        response: `Your busiest project was "${busiest.project}" with ${formatDuration(busiest.agent_hours)} (${busiest.entries} entries).`,
        data: busiest,
      };
    }

    if (/\bcategory\b/.test(q)) {
      const sorted = [...ts.by_category].sort((a, b) => b.agent_hours - a.agent_hours);
      const busiest = sorted[0];

      if (!busiest) {
        return { understood: true, query_type: 'busiest_category', response: 'No categories found in this period.' };
      }

      return {
        understood: true,
        query_type: 'busiest_category',
        response: `Your busiest category was "${busiest.category}" with ${formatDuration(busiest.agent_hours)} (${busiest.entries} entries).`,
        data: busiest,
      };
    }

    // Default to busiest day
    const byDay = new Map<string, number>();
    for (const entry of ts.entries) {
      const hours = entry.duration_minutes / 60;
      byDay.set(entry.date, (byDay.get(entry.date) || 0) + hours);
    }
    const sorted = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
    const busiest = sorted[0];

    return {
      understood: true,
      query_type: 'busiest_day',
      response: busiest ? `Your busiest day was ${busiest[0]} with ${formatDuration(busiest[1])}.` : 'No entries found.',
      data: busiest ? { date: busiest[0], hours: busiest[1] } : null,
    };
  }

  // ─── Pattern 3: "how many tasks [time period]" ─────
  if (/\bhow many\s+(?:tasks?|entries)\b/.test(q)) {
    const timeRange = parseTimeReference(q) || {
      from: new Date(Date.now() - 7 * 86400000).toISOString(),
      to: new Date().toISOString(),
      label: 'last 7 days',
    };

    const entries = db.query({ from: timeRange.from, to: timeRange.to, limit: 10000 });

    return {
      understood: true,
      query_type: 'task_count',
      response: `You completed ${entries.length} tasks ${timeRange.label}.`,
      data: { count: entries.length, period: timeRange.label },
    };
  }

  // ─── Pattern 4: "what did [agent] work on [time period]" ─────
  if (/\bwhat did\b/.test(q) || /\bwhat.*work(?:ed)?\s+on\b/.test(q)) {
    const agent = extractAgent(question);
    const timeRange = parseTimeReference(q) || {
      from: new Date(Date.now() - 7 * 86400000).toISOString(),
      to: new Date().toISOString(),
      label: 'last 7 days',
    };

    const entries = db.query({
      from: timeRange.from,
      to: timeRange.to,
      agent: agent || undefined,
      limit: 20,
    });

    if (entries.length === 0) {
      const agentLabel = agent ? `Agent "${agent}"` : 'Agents';
      return {
        understood: true,
        query_type: 'agent_work',
        response: `${agentLabel} had no tracked work ${timeRange.label}.`,
        data: { entries: [] },
      };
    }

    const taskList = entries.slice(0, 5).map(e => `• ${e.task.slice(0, 50)}${e.task.length > 50 ? '...' : ''}`).join('\n');
    const agentLabel = agent ? `"${agent}"` : 'Agents';

    return {
      understood: true,
      query_type: 'agent_work',
      response: `${agentLabel} worked on ${entries.length} tasks ${timeRange.label}:\n${taskList}${entries.length > 5 ? `\n...and ${entries.length - 5} more` : ''}`,
      data: { entries: entries.map(e => ({ task: e.task, duration_minutes: e.agent_runtime_ms ? e.agent_runtime_ms / 60000 : 0 })) },
    };
  }

  // ─── Pattern 5: "compare [project A] vs [project B]" ─────
  if (/\bcompare\b/.test(q) && /\bvs\b|\bversus\b|\band\b/.test(q)) {
    const match = q.match(/compare\s+['""]?([a-zA-Z0-9_-]+)['""]?\s+(?:vs|versus|and)\s+['""]?([a-zA-Z0-9_-]+)['""]?/i);

    if (match) {
      const [, proj1, proj2] = match;
      const timeRange = parseTimeReference(q) || {
        from: new Date(Date.now() - 30 * 86400000).toISOString(),
        to: new Date().toISOString(),
        label: 'last 30 days',
      };

      const ts1 = db.getTimesheet(timeRange.from, timeRange.to, { project: proj1 });
      const ts2 = db.getTimesheet(timeRange.from, timeRange.to, { project: proj2 });

      return {
        understood: true,
        query_type: 'compare_projects',
        response: `Comparison ${timeRange.label}:\n` +
          `• ${proj1}: ${formatDuration(ts1.total_agent_hours)} (${ts1.total_entries} entries, $${ts1.total_cost_usd.toFixed(2)})\n` +
          `• ${proj2}: ${formatDuration(ts2.total_agent_hours)} (${ts2.total_entries} entries, $${ts2.total_cost_usd.toFixed(2)})`,
        data: {
          [proj1]: { hours: ts1.total_agent_hours, entries: ts1.total_entries, cost: ts1.total_cost_usd },
          [proj2]: { hours: ts2.total_agent_hours, entries: ts2.total_entries, cost: ts2.total_cost_usd },
        },
      };
    }
  }

  // ─── Pattern 6: "total cost [time period]" ─────
  if (/\btotal cost\b/.test(q) || /\bhow much.*cost\b/.test(q) || /\bhow much.*spend\b/.test(q)) {
    const timeRange = parseTimeReference(q) || {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
      label: 'last 30 days',
    };

    const ts = db.getTimesheet(timeRange.from, timeRange.to);

    return {
      understood: true,
      query_type: 'total_cost',
      response: `Total agent cost ${timeRange.label}: $${ts.total_cost_usd.toFixed(2)} (saved ~$${ts.total_savings_usd.toFixed(0)} vs human equivalent).`,
      data: {
        cost_usd: ts.total_cost_usd,
        savings_usd: ts.total_savings_usd,
        period: timeRange.label,
      },
    };
  }

  // ─── Pattern 7: "who is the most productive agent" ─────
  if (/\bmost productive\s+agent\b/.test(q) || /\bbest\s+agent\b/.test(q) || /\btop\s+agent\b/.test(q)) {
    const timeRange = parseTimeReference(q) || {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
      label: 'last 30 days',
    };

    const ts = db.getTimesheet(timeRange.from, timeRange.to);

    if (ts.by_agent.length === 0) {
      return {
        understood: true,
        query_type: 'top_agent',
        response: 'No agent activity found in this period.',
      };
    }

    const sorted = [...ts.by_agent].sort((a, b) => b.agent_hours - a.agent_hours);
    const top = sorted[0];

    return {
      understood: true,
      query_type: 'top_agent',
      response: `Most productive agent ${timeRange.label}: "${top.agent}" with ${formatDuration(top.agent_hours)} (${top.entries} tasks, ${top.success_rate}% success rate).`,
      data: top,
    };
  }

  // ─── Not understood ─────
  return {
    understood: false,
    suggestion: `I don't understand that question. Try queries like:
• "How much time on project X this week?"
• "What was my busiest day last month?"
• "How many tasks today?"
• "What did agent-1 work on yesterday?"
• "Compare project-A vs project-B"
• "Total cost this month"
• "Who is the most productive agent?"`,
  };
}

/**
 * Get help text for the ask command.
 */
export function getAskHelp(): string {
  return `
  Natural Language Queries — Example Questions:

  Time tracking:
    "How much time on project X this week?"
    "How long did I spend on client Y yesterday?"

  Productivity:
    "What was my busiest day last month?"
    "What was my busiest project this week?"
    "What was my busiest category?"

  Counting:
    "How many tasks today?"
    "How many entries this month?"

  Agent activity:
    "What did agent-1 work on yesterday?"
    "What did research-bot work on this week?"

  Comparisons:
    "Compare project-A vs project-B"
    "Compare website vs api last month"

  Costs:
    "Total cost this week"
    "How much did I spend this month?"

  Agent rankings:
    "Who is the most productive agent?"
    "Which agent worked the most?"

  Time periods: today, yesterday, this week, last week, this month, last month, last N days, all time
`;
}
