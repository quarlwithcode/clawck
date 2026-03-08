/**
 * ⏱️🦀 Clawck — HTML Report Generation
 * Generates interactive timesheet HTML reports.
 */

import { TimesheetSummary, ClawckEntry } from '../core/types';

export interface HTMLReportOptions {
  title?: string;
  clientName?: string;
  dateRange: string;
  rawEntries?: ClawckEntry[];
}

export function generateTimesheetHTML(
  summary: TimesheetSummary,
  options: HTMLReportOptions
): string {
  const title = options.title || 'Clawck Timesheet Report';
  const entries = summary.entries;
  const rawEntries = options.rawEntries || [];

  // Group entries by date for calendar
  const byDate = new Map<string, { count: number; hours: number }>();
  for (const e of entries) {
    const d = byDate.get(e.date) || { count: 0, hours: 0 };
    d.count++;
    d.hours += e.duration_minutes / 60;
    byDate.set(e.date, d);
  }

  // Build CSV string
  const csvHeader = 'Date,Agent,Client,Project,Task,Category,Duration (min),Tokens,Cost,Human Equiv Hrs,Status,Approved';
  const csvRows = entries.map(e => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [e.date, esc(e.agent), esc(e.client), esc(e.project), esc(e.task), e.category,
      e.duration_minutes.toFixed(2), e.tokens_total, e.cost_usd.toFixed(4),
      e.human_equiv_hours.toFixed(2), e.status, e.approved ? 'yes' : 'no'].join(',');
  });
  const csvContent = [csvHeader, ...csvRows].join('\\n');

  // Calendar range
  const startDate = summary.period_start.split('T')[0];
  const endDate = summary.period_end.split('T')[0];

  // Max hours for color scaling
  const maxHours = Math.max(...[...byDate.values()].map(d => d.hours), 1);

  // Build calendar HTML
  const calendarDays = buildCalendarDays(startDate, endDate, byDate, maxHours);

  // Build Gantt data from raw entries
  const ganttHTML = buildGanttChart(rawEntries);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #242836;
    --border: #2d3348;
    --text: #e4e6ed;
    --text-dim: #8b8fa3;
    --accent: #6c63ff;
    --green: #4ade80;
    --red: #f87171;
    --orange: #fb923c;
    --blue: #60a5fa;
    --cyan: #22d3ee;
    --purple: #a78bfa;
    --pink: #f472b6;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; padding: 2rem; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.25rem; }
  .subtitle { color: var(--text-dim); font-size: 0.95rem; margin-bottom: 0.5rem; }
  .meta { color: var(--text-dim); font-size: 0.8rem; margin-bottom: 1.5rem; }

  /* Summary Cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem; }
  .card-label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
  .card-value { font-family: 'JetBrains Mono', monospace; font-size: 1.4rem; font-weight: 600; }
  .card-value.green { color: var(--green); }
  .card-value.blue { color: var(--blue); }
  .card-value.accent { color: var(--accent); }
  .card-value.orange { color: var(--orange); }

  /* Tabs */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; }
  .tab { padding: 0.7rem 1.5rem; cursor: pointer; color: var(--text-dim); font-size: 0.9rem; font-weight: 500; border-bottom: 2px solid transparent; transition: all 0.2s; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Calendar */
  .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cal-header { font-size: 0.7rem; color: var(--text-dim); text-align: center; padding: 4px; font-weight: 600; }
  .cal-day { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px; min-height: 60px; font-size: 0.75rem; }
  .cal-day.empty { background: transparent; border-color: transparent; }
  .cal-day .day-num { font-weight: 600; margin-bottom: 2px; }
  .cal-day .day-info { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--text-dim); }
  .cal-day.has-entries { border-color: var(--accent); }

  /* Table */
  .data-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .data-table th { background: var(--surface2); padding: 8px 10px; text-align: left; font-weight: 600; font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.03em; cursor: pointer; user-select: none; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .data-table th:hover { color: var(--text); }
  .data-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
  .data-table tr:hover td { background: var(--surface); }
  .data-table .mono { font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; }
  .status-completed { color: var(--green); }
  .status-running { color: var(--orange); }
  .status-failed { color: var(--red); }

  /* Gantt */
  .gantt-container { overflow-x: auto; }
  .gantt-row { display: flex; align-items: center; margin-bottom: 4px; min-height: 28px; }
  .gantt-label { width: 120px; flex-shrink: 0; font-size: 0.75rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gantt-bars { flex: 1; position: relative; height: 22px; background: var(--surface); border-radius: 4px; }
  .gantt-bar { position: absolute; height: 18px; top: 2px; border-radius: 3px; opacity: 0.85; min-width: 3px; }
  .gantt-bar[title]:hover { opacity: 1; }
  .gantt-axis { display: flex; margin-left: 120px; margin-bottom: 8px; }
  .gantt-tick { flex: 1; font-size: 0.65rem; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; }

  /* CSV */
  .csv-container { position: relative; }
  .csv-pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; line-height: 1.6; white-space: pre; max-height: 500px; }
  .copy-btn { position: absolute; top: 8px; right: 8px; background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 0.78rem; font-weight: 500; }
  .copy-btn:hover { opacity: 0.9; }

  /* Category colors */
  .cat-research { background: var(--blue); }
  .cat-content { background: var(--purple); }
  .cat-code { background: var(--green); }
  .cat-data_entry { background: var(--cyan); }
  .cat-design { background: var(--pink); }
  .cat-communication { background: var(--orange); }
  .cat-analysis { background: #818cf8; }
  .cat-testing { background: #fbbf24; }
  .cat-planning { background: #34d399; }
  .cat-other { background: var(--text-dim); }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${options.clientName ? `<div class="subtitle">Client: ${escapeHtml(options.clientName)}</div>` : ''}
<div class="subtitle">Period: ${escapeHtml(options.dateRange)}</div>
<div class="meta">Generated ${new Date().toISOString()}</div>

<div class="cards">
  <div class="card"><div class="card-label">Agent Hours</div><div class="card-value mono blue">${summary.total_agent_hours.toFixed(2)}</div></div>
  <div class="card"><div class="card-label">Human Equiv</div><div class="card-value mono accent">${summary.total_human_equiv_hours.toFixed(2)} hrs</div></div>
  <div class="card"><div class="card-label">Cost</div><div class="card-value mono orange">$${summary.total_cost_usd.toFixed(2)}</div></div>
  <div class="card"><div class="card-label">Savings</div><div class="card-value mono green">$${summary.total_savings_usd.toFixed(0)}</div></div>
  <div class="card"><div class="card-label">Entries</div><div class="card-value mono">${summary.total_entries}</div></div>
  <div class="card"><div class="card-label">Tokens</div><div class="card-value mono">${summary.total_tokens.toLocaleString()}</div></div>
</div>

<div class="tabs">
  <div class="tab active" data-tab="calendar">Calendar</div>
  <div class="tab" data-tab="table">Table</div>
  <div class="tab" data-tab="gantt">Gantt</div>
  <div class="tab" data-tab="csv">CSV</div>
</div>

<div id="tab-calendar" class="tab-content active">
  <div class="calendar-grid">
    <div class="cal-header">Sun</div><div class="cal-header">Mon</div><div class="cal-header">Tue</div>
    <div class="cal-header">Wed</div><div class="cal-header">Thu</div><div class="cal-header">Fri</div><div class="cal-header">Sat</div>
    ${calendarDays}
  </div>
</div>

<div id="tab-table" class="tab-content">
  <table class="data-table" id="entries-table">
    <thead>
      <tr>
        <th data-col="0">Date</th><th data-col="1">Agent</th><th data-col="2">Client</th>
        <th data-col="3">Project</th><th data-col="4">Task</th><th data-col="5">Category</th>
        <th data-col="6">Duration</th><th data-col="7">Tokens</th><th data-col="8">Cost</th>
        <th data-col="9">Human Equiv</th><th data-col="10">Status</th><th data-col="11">Approved</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map(e => `<tr>
        <td class="mono">${e.date}</td><td>${escapeHtml(e.agent)}</td><td>${escapeHtml(e.client)}</td>
        <td>${escapeHtml(e.project)}</td><td title="${escapeHtml(e.task)}">${escapeHtml(e.task)}</td><td>${e.category}</td>
        <td class="mono">${formatMins(e.duration_minutes)}</td><td class="mono">${e.tokens_total.toLocaleString()}</td>
        <td class="mono">$${e.cost_usd.toFixed(4)}</td><td class="mono">${e.human_equiv_hours.toFixed(2)}h</td>
        <td class="status-${e.status}">${e.status}</td><td>${e.approved ? 'Yes' : '-'}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>
</div>

<div id="tab-gantt" class="tab-content">
  ${ganttHTML}
</div>

<div id="tab-csv" class="tab-content">
  <div class="csv-container">
    <button class="copy-btn" onclick="copyCSV()">Copy</button>
    <pre class="csv-pre" id="csv-data">${escapeHtml([csvHeader, ...csvRows].join('\n'))}</pre>
  </div>
</div>

<script>
// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Table sorting
document.querySelectorAll('#entries-table th').forEach(th => {
  let asc = true;
  th.addEventListener('click', () => {
    const col = parseInt(th.dataset.col);
    const tbody = document.querySelector('#entries-table tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const av = a.children[col].textContent.trim();
      const bv = b.children[col].textContent.trim();
      const an = parseFloat(av.replace(/[^0-9.-]/g, ''));
      const bn = parseFloat(bv.replace(/[^0-9.-]/g, ''));
      if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    rows.forEach(r => tbody.appendChild(r));
    asc = !asc;
  });
});

// Copy CSV
function copyCSV() {
  const text = document.getElementById('csv-data').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMins(mins: number): string {
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildCalendarDays(startStr: string, endStr: string, byDate: Map<string, { count: number; hours: number }>, maxHours: number): string {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const days: string[] = [];

  // Pad to start of week (Sunday)
  const firstDay = new Date(start);
  firstDay.setDate(firstDay.getDate() - firstDay.getDay());

  const current = new Date(firstDay);
  while (current <= end || current.getDay() !== 0) {
    const dateStr = current.toISOString().split('T')[0];
    const inRange = current >= start && current <= end;
    const data = byDate.get(dateStr);

    if (!inRange && !data) {
      days.push(`<div class="cal-day empty"></div>`);
    } else {
      const hasEntries = data && data.count > 0;
      const intensity = hasEntries ? Math.min(data!.hours / maxHours, 1) : 0;
      const bgStyle = hasEntries ? `background: rgba(108,99,255,${0.1 + intensity * 0.5})` : '';
      days.push(`<div class="cal-day${hasEntries ? ' has-entries' : ''}" style="${bgStyle}">
        <div class="day-num">${current.getDate()}</div>
        ${hasEntries ? `<div class="day-info">${data!.count} entries<br>${data!.hours.toFixed(1)}h</div>` : ''}
      </div>`);
    }
    current.setDate(current.getDate() + 1);
    if (current > end && current.getDay() === 0) break;
  }
  return days.join('\n');
}

function buildGanttChart(rawEntries: ClawckEntry[]): string {
  if (rawEntries.length === 0) return '<p style="color:var(--text-dim)">No entries to display.</p>';

  // Group by date
  const byDate = new Map<string, ClawckEntry[]>();
  for (const e of rawEntries) {
    const date = e.start.split('T')[0];
    const arr = byDate.get(date) || [];
    arr.push(e);
    byDate.set(date, arr);
  }

  const categoryColors: Record<string, string> = {
    research: 'cat-research', content: 'cat-content', code: 'cat-code',
    data_entry: 'cat-data_entry', design: 'cat-design', communication: 'cat-communication',
    analysis: 'cat-analysis', testing: 'cat-testing', planning: 'cat-planning', other: 'cat-other',
  };

  const sortedDates = [...byDate.keys()].sort();
  const rows: string[] = [];

  // Axis
  rows.push(`<div class="gantt-axis">${Array.from({ length: 24 }, (_, i) => `<div class="gantt-tick">${String(i).padStart(2, '0')}</div>`).join('')}</div>`);

  for (const date of sortedDates.slice(-14)) { // Limit to last 14 days
    const dateEntries = byDate.get(date)!;
    const bars = dateEntries.map(e => {
      const startHour = new Date(e.start).getHours() + new Date(e.start).getMinutes() / 60;
      const endTime = e.end ? new Date(e.end) : new Date();
      const durHours = (endTime.getTime() - new Date(e.start).getTime()) / 3600000;
      const left = (startHour / 24) * 100;
      const width = Math.max((durHours / 24) * 100, 0.5);
      const cls = categoryColors[e.category] || 'cat-other';
      return `<div class="gantt-bar ${cls}" style="left:${left}%;width:${width}%" title="${escapeHtml(e.task)} (${e.category}, ${formatMins(durHours * 60)})"></div>`;
    }).join('');

    rows.push(`<div class="gantt-row"><div class="gantt-label">${date}</div><div class="gantt-bars">${bars}</div></div>`);
  }

  return `<div class="gantt-container">${rows.join('\n')}</div>`;
}
