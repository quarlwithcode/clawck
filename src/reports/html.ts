/**
 * Clawck — HTML Report Generation
 * Generates interactive timesheet HTML reports with light/dark theme support.
 */

import { TimesheetSummary, ClawckEntry, ReportStyle } from '../core/types';

export interface HTMLReportOptions {
  title?: string;
  clientName?: string;
  dateRange: string;
  rawEntries?: ClawckEntry[];
  style?: ReportStyle;
}

export function generateTimesheetHTML(
  summary: TimesheetSummary,
  options: HTMLReportOptions
): string {
  const title = options.title || 'Clawck Timesheet Report';
  const entries = summary.entries;
  const rawEntries = options.rawEntries || [];
  const style: ReportStyle = options.style || 'full';

  // Determine which sections to show based on style
  const showCards = style !== 'table' && style !== 'calendar' && style !== 'visual';
  const showCalendar = style === 'full' || style === 'visual' || style === 'calendar';
  const showTable = style === 'full' || style === 'table';
  const showTimeline = style === 'full' || style === 'visual';
  const showCSV = style === 'full';
  const showTabs = [showCalendar, showTable, showTimeline, showCSV].filter(Boolean).length > 1;
  const isShort = style === 'short';
  const isText = style === 'text';

  // Group entries by date for calendar
  const byDate = new Map<string, { count: number; hours: number }>();
  for (const e of entries) {
    const d = byDate.get(e.date) || { count: 0, hours: 0 };
    d.count++;
    d.hours += e.duration_minutes / 60;
    byDate.set(e.date, d);
  }

  // Build CSV string (no wall clock)
  const csvHeader = 'Date,Time,Agent,Client,Project,Task,Category,Runtime (min),Tokens In,Tokens Out,Cost,Human Equiv Hrs,Time Saved (hrs),Status,Approved';
  const csvRows = entries.map(e => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const time = formatTime(e.start_time);
    return [e.date, time, esc(e.agent), esc(e.client), esc(e.project), esc(e.task), e.category,
      e.duration_minutes.toFixed(2), e.tokens_in, e.tokens_out, e.cost_usd.toFixed(4),
      e.human_equiv_hours.toFixed(2), e.time_saved_hours.toFixed(2), e.status, e.approved ? 'yes' : 'no'].join(',');
  });

  // Calendar range
  const startDate = summary.period_start.split('T')[0];
  const endDate = summary.period_end.split('T')[0];

  // Max hours for color scaling
  const maxHours = Math.max(...[...byDate.values()].map(d => d.hours), 1);

  // Build calendar HTML
  const calendarDays = buildCalendarDays(startDate, endDate, byDate, maxHours);

  // Build Timeline from raw entries
  const timelineHTML = buildTimeline(rawEntries);

  // Human-friendly generated timestamp
  const generatedAt = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());

  // Total runtime
  const totalRuntimeMin = entries.reduce((s, e) => s + e.duration_minutes, 0);

  // Entries as JSON for calendar click filtering
  const entriesJSON = JSON.stringify(entries.map(e => ({
    date: e.date,
    time: formatTime(e.start_time),
    agent: e.agent,
    client: e.client,
    project: e.project,
    task: e.task,
    category: e.category,
    duration: formatMins(e.duration_minutes),
    tokens_in: e.tokens_in,
    tokens_out: e.tokens_out,
    cost: e.cost_usd.toFixed(4),
    status: e.status,
  })));

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
    --bg: #ffffff;
    --surface: #f5f5f7;
    --surface2: #eaeaed;
    --border: #d1d5db;
    --text: #1a1a2e;
    --text-dim: #6b7280;
    --accent: #36a2eb;
    --green: #16a34a;
    --red: #dc2626;
    --orange: #ea580c;
    --blue: #2563eb;
    --cyan: #0891b2;
    --purple: #7c3aed;
    --pink: #db2777;
  }
  [data-theme="dark"] {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #242836;
    --border: #2d3348;
    --text: #e4e6ed;
    --text-dim: #8b8fa3;
    --accent: #36a2eb;
    --green: #4ade80;
    --red: #f87171;
    --orange: #fb923c;
    --blue: #60a5fa;
    --cyan: #22d3ee;
    --purple: #a78bfa;
    --pink: #f472b6;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; padding: 2rem; transition: background 0.3s, color 0.3s; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem; }
  h1 { font-size: 1.8rem; font-weight: 700; }
  .subtitle { color: var(--text-dim); font-size: 0.95rem; margin-bottom: 0.5rem; }
  .meta { color: var(--text-dim); font-size: 0.8rem; margin-bottom: 1.5rem; }

  /* Theme toggle */
  .theme-toggle { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; width: 40px; height: 40px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; transition: background 0.3s; }
  .theme-toggle:hover { background: var(--surface2); }

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
  .cal-day { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px; min-height: 60px; font-size: 0.75rem; cursor: default; transition: border-color 0.2s; }
  .cal-day.empty { background: transparent; border-color: transparent; }
  .cal-day .day-num { font-weight: 600; margin-bottom: 2px; }
  .cal-day .day-info { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--text-dim); }
  .cal-day.has-entries { border-color: var(--accent); cursor: pointer; }
  .cal-day.has-entries:hover { border-color: var(--blue); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
  .cal-day.selected { border-color: var(--blue); border-width: 2px; }

  /* Calendar detail panel */
  .cal-detail { margin-top: 1rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; display: none; }
  .cal-detail.active { display: block; }
  .cal-detail h3 { font-size: 0.95rem; margin-bottom: 0.75rem; color: var(--accent); }

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

  /* Timeline */
  .timeline { max-width: 800px; }
  .timeline-date { position: sticky; top: 0; z-index: 2; background: var(--bg); padding: 0.75rem 0 0.5rem; font-weight: 700; font-size: 0.95rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
  .timeline-card { display: flex; align-items: flex-start; gap: 1rem; padding: 0.75rem 1rem; margin-bottom: 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; border-left: 4px solid var(--accent); }
  .timeline-card .tl-time { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: var(--text-dim); white-space: nowrap; min-width: 110px; }
  .timeline-card .tl-body { flex: 1; min-width: 0; }
  .timeline-card .tl-task { font-weight: 600; font-size: 0.88rem; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .timeline-card .tl-meta { font-size: 0.75rem; color: var(--text-dim); display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .timeline-card .tl-pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; color: #fff; }
  .timeline-card .tl-duration { font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; font-weight: 600; white-space: nowrap; color: var(--accent); }
  .tl-status { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; }
  .tl-status.completed { background: var(--green); }
  .tl-status.running { background: var(--orange); }
  .tl-status.failed { background: var(--red); }
  .tl-status.paused { background: var(--text-dim); }

  /* Category pill colors */
  .pill-research { background: var(--blue); }
  .pill-content { background: var(--purple); }
  .pill-code { background: var(--green); }
  .pill-data_entry { background: var(--cyan); }
  .pill-design { background: var(--pink); }
  .pill-communication { background: var(--orange); }
  .pill-analysis { background: #818cf8; }
  .pill-testing { background: #d97706; }
  .pill-planning { background: #059669; }
  .pill-other { background: var(--text-dim); }

  /* Category colors for calendar (backwards compat) */
  .cat-research { background: var(--blue); }
  .cat-content { background: var(--purple); }
  .cat-code { background: var(--green); }
  .cat-data_entry { background: var(--cyan); }
  .cat-design { background: var(--pink); }
  .cat-communication { background: var(--orange); }
  .cat-analysis { background: #818cf8; }
  .cat-testing { background: #d97706; }
  .cat-planning { background: #059669; }
  .cat-other { background: var(--text-dim); }

  /* CSV */
  .csv-container { position: relative; }
  .csv-pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; line-height: 1.6; white-space: pre; max-height: 500px; }
  .csv-btns { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; }
  .csv-btn { background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 0.78rem; font-weight: 500; }
  .csv-btn:hover { opacity: 0.9; }
</style>
</head>
<body>
<div class="header-row">
  <h1>${escapeHtml(title)}</h1>
  <button class="theme-toggle" id="theme-toggle" title="Toggle dark mode">&#9790;</button>
</div>
${options.clientName ? `<div class="subtitle">Client: ${escapeHtml(options.clientName)}</div>` : ''}
<div class="subtitle">Period: ${escapeHtml(options.dateRange)}</div>
<div class="meta">Generated ${escapeHtml(generatedAt)}</div>

${isText ? `<pre class="csv-pre" style="margin-top:1.5rem">${escapeHtml(buildTextReport(summary))}</pre>` : `
${showCards ? `<div class="cards">
  <div class="card"><div class="card-label">Runtime</div><div class="card-value mono accent">${formatMins(totalRuntimeMin)}</div></div>
  <div class="card"><div class="card-label">Human Equiv</div><div class="card-value mono blue">${summary.total_human_equiv_hours.toFixed(2)} hrs</div></div>
  <div class="card"><div class="card-label">Cost</div><div class="card-value mono orange">$${summary.total_cost_usd.toFixed(2)}</div></div>
  <div class="card"><div class="card-label">Savings</div><div class="card-value mono green">$${summary.total_savings_usd.toFixed(0)}</div></div>
  <div class="card"><div class="card-label">Time Saved</div><div class="card-value mono green">${summary.total_time_saved_hours.toFixed(1)} hrs</div></div>
  <div class="card"><div class="card-label">Entries</div><div class="card-value mono">${summary.total_entries}</div></div>
  <div class="card"><div class="card-label">Tokens</div><div class="card-value mono">${summary.total_tokens.toLocaleString()} (${summary.total_tokens_in.toLocaleString()} in / ${summary.total_tokens_out.toLocaleString()} out)</div></div>
</div>` : ''}

${isShort ? '' : `
${showTabs ? `<div class="tabs">
  ${showCalendar ? `<div class="tab${showCalendar && !showTable ? ' active' : (showCalendar ? ' active' : '')}" data-tab="calendar">Calendar</div>` : ''}
  ${showTable ? `<div class="tab${!showCalendar ? ' active' : ''}" data-tab="table">Table</div>` : ''}
  ${showTimeline ? `<div class="tab" data-tab="timeline">Timeline</div>` : ''}
  ${showCSV ? `<div class="tab" data-tab="csv">CSV</div>` : ''}
</div>` : ''}

${showCalendar ? `<div id="tab-calendar" class="tab-content${showCalendar ? ' active' : ''}">
  <div class="calendar-grid">
    <div class="cal-header">Sun</div><div class="cal-header">Mon</div><div class="cal-header">Tue</div>
    <div class="cal-header">Wed</div><div class="cal-header">Thu</div><div class="cal-header">Fri</div><div class="cal-header">Sat</div>
    ${calendarDays}
  </div>
  <div class="cal-detail" id="cal-detail">
    <h3 id="cal-detail-title"></h3>
    <table class="data-table" id="cal-detail-table">
      <thead><tr><th>Time</th><th>Task</th><th>Category</th><th>Runtime</th><th>Status</th></tr></thead>
      <tbody id="cal-detail-body"></tbody>
    </table>
  </div>
</div>` : ''}

${showTable ? `<div id="tab-table" class="tab-content${!showCalendar ? ' active' : ''}">
  <table class="data-table" id="entries-table">
    <thead>
      <tr>
        <th data-col="0">Date</th><th data-col="1">Time</th><th data-col="2">Agent</th><th data-col="3">Client</th>
        <th data-col="4">Project</th><th data-col="5">Task</th><th data-col="6">Category</th>
        <th data-col="7">Runtime</th><th data-col="8">Tokens In</th><th data-col="9">Tokens Out</th><th data-col="10">Cost</th>
        <th data-col="11">Human Equiv</th><th data-col="12">Time Saved</th><th data-col="13">Status</th><th data-col="14">Approved</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map(e => `<tr>
        <td class="mono">${e.date}</td><td class="mono">${formatTime(e.start_time)}</td><td>${escapeHtml(e.agent)}</td><td>${escapeHtml(e.client)}</td>
        <td>${escapeHtml(e.project)}</td><td title="${escapeHtml(e.task)}">${escapeHtml(e.task)}</td><td>${e.category}</td>
        <td class="mono">${formatMins(e.duration_minutes)}</td><td class="mono">${e.tokens_in.toLocaleString()}</td><td class="mono">${e.tokens_out.toLocaleString()}</td>
        <td class="mono">$${e.cost_usd.toFixed(4)}</td><td class="mono">${e.human_equiv_hours.toFixed(2)}h</td><td class="mono">${e.time_saved_hours.toFixed(2)}h</td>
        <td class="status-${e.status}">${e.status}</td><td>${e.approved ? 'Yes' : '-'}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>
</div>` : ''}

${showTimeline ? `<div id="tab-timeline" class="tab-content">
  ${timelineHTML}
</div>` : ''}

${showCSV ? `<div id="tab-csv" class="tab-content">
  <div class="csv-container">
    <div class="csv-btns">
      <button class="csv-btn" onclick="copyCSV()">Copy</button>
      <button class="csv-btn" onclick="downloadCSV()">Download</button>
    </div>
    <pre class="csv-pre" id="csv-data">${escapeHtml([csvHeader, ...csvRows].join('\n'))}</pre>
  </div>
</div>` : ''}
`}
`}

<script>
// Theme toggle
(function() {
  const toggle = document.getElementById('theme-toggle');
  const html = document.documentElement;
  const saved = localStorage.getItem('clawck-theme');
  if (saved === 'dark') { html.dataset.theme = 'dark'; toggle.textContent = '\\u2600'; }
  toggle.addEventListener('click', () => {
    const isDark = html.dataset.theme === 'dark';
    if (isDark) { delete html.dataset.theme; localStorage.setItem('clawck-theme', 'light'); toggle.textContent = '\\u263E'; }
    else { html.dataset.theme = 'dark'; localStorage.setItem('clawck-theme', 'dark'); toggle.textContent = '\\u2600'; }
  });
})();

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const el = document.getElementById('tab-' + tab.dataset.tab);
    if (el) el.classList.add('active');
  });
});

// Table sorting
document.querySelectorAll('#entries-table th').forEach(th => {
  let asc = true;
  th.addEventListener('click', () => {
    const col = parseInt(th.dataset.col);
    const tbody = document.querySelector('#entries-table tbody');
    if (!tbody) return;
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

// Calendar click — show detail panel
(function() {
  const entries = ${entriesJSON};
  document.querySelectorAll('.cal-day.has-entries').forEach(day => {
    day.addEventListener('click', () => {
      const date = day.dataset.date;
      if (!date) return;
      document.querySelectorAll('.cal-day.selected').forEach(d => d.classList.remove('selected'));
      day.classList.add('selected');
      const detail = document.getElementById('cal-detail');
      const title = document.getElementById('cal-detail-title');
      const tbody = document.getElementById('cal-detail-body');
      if (!detail || !title || !tbody) return;
      const filtered = entries.filter(e => e.date === date);
      title.textContent = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      tbody.innerHTML = filtered.map(e =>
        '<tr><td class="mono">' + e.time + '</td><td>' + e.task + '</td><td>' + e.category + '</td><td class="mono">' + e.duration + '</td><td class="status-' + e.status + '">' + e.status + '</td></tr>'
      ).join('');
      detail.classList.add('active');
    });
  });
})();

// Copy CSV
function copyCSV() {
  const el = document.getElementById('csv-data');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}

// Download CSV
function downloadCSV() {
  const el = document.getElementById('csv-data');
  if (!el) return;
  const blob = new Blob([el.textContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clawck-report.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>
</body>
</html>`;
}

function buildTextReport(summary: TimesheetSummary): string {
  const totalRuntimeMin = summary.entries.reduce((s, e) => s + e.duration_minutes, 0);
  const lines = [
    `Clawck Timesheet Report`,
    `${'─'.repeat(50)}`,
    `Runtime:           ${formatMins(totalRuntimeMin)}`,
    `Human equiv:       ${summary.total_human_equiv_hours.toFixed(2)} hrs`,
    `Agent cost:        $${summary.total_cost_usd.toFixed(2)}`,
    `Est. savings:      $${summary.total_savings_usd.toFixed(0)}`,
    `Time saved:        ${summary.total_time_saved_hours.toFixed(1)} hrs`,
    `Total entries:     ${summary.total_entries}`,
    `Total tokens:      ${summary.total_tokens.toLocaleString()} (${summary.total_tokens_in.toLocaleString()} in / ${summary.total_tokens_out.toLocaleString()} out)`,
  ];
  return lines.join('\n');
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

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '--:--';
  }
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
      const bgStyle = hasEntries ? `background: rgba(54,162,235,${0.08 + intensity * 0.3})` : '';
      days.push(`<div class="cal-day${hasEntries ? ' has-entries' : ''}" data-date="${dateStr}" style="${bgStyle}">
        <div class="day-num">${current.getDate()}</div>
        ${hasEntries ? `<div class="day-info">${data!.count} entries<br>${data!.hours.toFixed(1)}h</div>` : ''}
      </div>`);
    }
    current.setDate(current.getDate() + 1);
    if (current > end && current.getDay() === 0) break;
  }
  return days.join('\n');
}

function buildTimeline(rawEntries: ClawckEntry[]): string {
  if (rawEntries.length === 0) return '<p style="color:var(--text-dim)">No entries to display.</p>';

  // Group by date
  const byDate = new Map<string, ClawckEntry[]>();
  for (const e of rawEntries) {
    const date = e.start.split('T')[0];
    const arr = byDate.get(date) || [];
    arr.push(e);
    byDate.set(date, arr);
  }

  const sortedDates = [...byDate.keys()].sort().reverse();
  const sections: string[] = [];

  for (const date of sortedDates) {
    const dateEntries = byDate.get(date)!;
    // Sort by start time
    dateEntries.sort((a, b) => b.start.localeCompare(a.start));

    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const cards = dateEntries.map(e => {
      const startTime = formatTime(e.start);
      const endTime = e.end ? formatTime(e.end) : 'now';
      const durMs = e.agent_runtime_ms ?? e.wall_clock_ms ?? (e.end ? new Date(e.end).getTime() - new Date(e.start).getTime() : Date.now() - new Date(e.start).getTime());
      const durMin = durMs / 60000;
      const pillCls = `pill-${e.category}`;
      return `<div class="timeline-card" style="border-left-color:var(--${getCategoryColor(e.category)})">
  <div class="tl-time">${startTime} - ${endTime}</div>
  <div class="tl-body">
    <div class="tl-task"><span class="tl-status ${e.status}"></span>${escapeHtml(e.task)}</div>
    <div class="tl-meta">
      <span class="tl-pill ${pillCls}">${e.category}</span>
      ${e.project !== 'default' ? `<span>${escapeHtml(e.project)}</span>` : ''}
      ${e.client !== 'default' ? `<span>${escapeHtml(e.client)}</span>` : ''}
    </div>
  </div>
  <div class="tl-duration">${formatMins(durMin)}</div>
</div>`;
    }).join('\n');

    sections.push(`<div class="timeline-date">${dateLabel}</div>\n${cards}`);
  }

  return `<div class="timeline">${sections.join('\n')}</div>`;
}

function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    research: 'blue', content: 'purple', code: 'green', data_entry: 'cyan',
    design: 'pink', communication: 'orange', analysis: 'purple',
    testing: 'orange', planning: 'green', other: 'text-dim',
  };
  return map[category] || 'accent';
}
