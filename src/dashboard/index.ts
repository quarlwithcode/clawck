/**
 * ⏱️🦀 Clawck — Dashboard
 * Self-contained HTML dashboard served by the Clawck server.
 */

export function getDashboardHTML(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clawck — AI Agent Time Tracker</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-primary: #0a0b0f;
    --bg-secondary: #12141c;
    --bg-card: #181a24;
    --bg-hover: #1e2030;
    --border: #2a2d3e;
    --text-primary: #e8eaf0;
    --text-secondary: #8b8fa3;
    --text-muted: #5c5f73;
    --accent: #ff6b35;
    --accent-glow: rgba(255, 107, 53, 0.15);
    --green: #34d399;
    --green-dim: rgba(52, 211, 153, 0.15);
    --blue: #60a5fa;
    --blue-dim: rgba(96, 165, 250, 0.15);
    --red: #f87171;
    --red-dim: rgba(248, 113, 113, 0.15);
    --yellow: #fbbf24;
    --yellow-dim: rgba(251, 191, 36, 0.15);
    --purple: #a78bfa;
    --radius: 8px;
    --radius-lg: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'DM Sans', -apple-system, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.5;
  }

  /* ─── Header ──────────────────────────────────────── */
  .header {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    padding: 16px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo-icon { font-size: 24px; }
  .logo-sub {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
    font-family: 'DM Sans', sans-serif;
    margin-left: 4px;
  }
  .header-right { display: flex; align-items: center; gap: 16px; }
  .period-select {
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 8px 14px;
    border-radius: var(--radius);
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    cursor: pointer;
  }
  .refresh-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 8px 18px;
    border-radius: var(--radius);
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .refresh-btn:hover { opacity: 0.85; }

  /* ─── Layout ──────────────────────────────────────── */
  .main { padding: 28px 32px; max-width: 1400px; margin: 0 auto; }

  /* ─── Stat Cards ──────────────────────────────────── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px 22px;
  }
  .stat-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .stat-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
  }
  .stat-sub {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
  }
  .stat-accent { color: var(--accent); }
  .stat-green { color: var(--green); }
  .stat-blue { color: var(--blue); }

  /* ─── Savings Banner ──────────────────────────────── */
  .savings-banner {
    background: linear-gradient(135deg, rgba(52, 211, 153, 0.08) 0%, rgba(96, 165, 250, 0.06) 100%);
    border: 1px solid rgba(52, 211, 153, 0.2);
    border-radius: var(--radius-lg);
    padding: 24px 28px;
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .savings-left h3 {
    font-size: 14px;
    color: var(--green);
    font-weight: 600;
    margin-bottom: 4px;
  }
  .savings-left .savings-amount {
    font-family: 'JetBrains Mono', monospace;
    font-size: 36px;
    font-weight: 700;
    color: var(--green);
  }
  .savings-left .savings-detail {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 4px;
  }
  .savings-right {
    text-align: right;
  }
  .savings-right .equiv-hours {
    font-family: 'JetBrains Mono', monospace;
    font-size: 24px;
    font-weight: 700;
    color: var(--blue);
  }
  .savings-right .equiv-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* ─── Sections ────────────────────────────────────── */
  .section { margin-bottom: 32px; }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  /* ─── Tabs ────────────────────────────────────────── */
  .tabs {
    display: flex;
    gap: 2px;
    background: var(--bg-secondary);
    border-radius: var(--radius);
    padding: 3px;
    margin-bottom: 20px;
    border: 1px solid var(--border);
    width: fit-content;
  }
  .tab {
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: var(--text-secondary);
    background: none;
    border: none;
    transition: all 0.2s;
    font-family: 'DM Sans', sans-serif;
  }
  .tab:hover { color: var(--text-primary); }
  .tab.active {
    background: var(--bg-card);
    color: var(--accent);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  /* ─── Table ───────────────────────────────────────── */
  .table-wrap {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 14px 16px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg-hover); }
  .cell-mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }
  .cell-task {
    color: var(--text-primary);
    font-weight: 500;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ─── Badges ──────────────────────────────────────── */
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge-running { background: var(--accent-glow); color: var(--accent); }
  .badge-completed { background: var(--green-dim); color: var(--green); }
  .badge-failed { background: var(--red-dim); color: var(--red); }
  .badge-paused { background: var(--yellow-dim); color: var(--yellow); }
  .badge-cat {
    background: var(--blue-dim);
    color: var(--blue);
    font-size: 10px;
    padding: 2px 8px;
  }

  /* ─── Breakdown Bars ─────────────────────────────── */
  .breakdown-list { display: flex; flex-direction: column; gap: 10px; }
  .breakdown-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .breakdown-label {
    font-size: 13px;
    font-weight: 500;
    width: 140px;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .breakdown-bar-wrap {
    flex: 1;
    height: 24px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }
  .breakdown-bar {
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
    transition: width 0.6s ease;
    min-width: 2px;
  }
  .breakdown-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-secondary);
    width: 80px;
    text-align: right;
    flex-shrink: 0;
  }

  /* ─── Empty State ────────────────────────────────── */
  .empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-muted);
  }
  .empty-icon { font-size: 48px; margin-bottom: 16px; }
  .empty-title { font-size: 18px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
  .empty-sub { font-size: 14px; }
  .empty code {
    background: var(--bg-secondary);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }

  /* ─── Two Column ─────────────────────────────────── */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  @media (max-width: 900px) {
    .two-col { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .savings-banner { flex-direction: column; text-align: left; }
    .savings-right { text-align: left; }
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px;
    color: var(--text-muted);
    font-size: 14px;
  }
  .pulse { animation: pulse 1.5s infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <span class="logo-icon">🦀</span>
      <span>Clawck</span>
      <span class="logo-sub">Agent Time Tracker</span>
    </div>
    <div class="header-right">
      <select class="period-select" id="periodSelect">
        <option value="1">Today</option>
        <option value="7" selected>Last 7 days</option>
        <option value="14">Last 14 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
      <button class="refresh-btn" onclick="loadData()">Refresh</button>
    </div>
  </div>

  <div class="main" id="app">
    <div class="loading"><span class="pulse">⏱️ Loading Clawck data...</span></div>
  </div>

<script>
const API = 'http://localhost:${port}/api';
let data = null;

async function loadData() {
  const days = parseInt(document.getElementById('periodSelect').value);
  const to = new Date().toISOString();
  const from = new Date(Date.now() - days * 86400000).toISOString();

  try {
    const [tsRes, runRes, statsRes] = await Promise.all([
      fetch(API + '/timesheet?from=' + from + '&to=' + to).then(r => r.json()),
      fetch(API + '/running').then(r => r.json()),
      fetch(API + '/stats').then(r => r.json()),
    ]);
    data = { timesheet: tsRes, running: runRes, stats: statsRes };
    render();
  } catch (e) {
    document.getElementById('app').innerHTML = \`
      <div class="empty">
        <div class="empty-icon">🦀</div>
        <div class="empty-title">Clawck is running but no data yet</div>
        <div class="empty-sub">Start tracking: <code>clawck_start_task</code> via MCP or <code>POST /api/start</code></div>
      </div>\`;
  }
}

function render() {
  if (!data) return;
  const ts = data.timesheet;
  const running = data.running;
  const stats = data.stats;

  const app = document.getElementById('app');
  app.innerHTML = '';

  // ─── Stats Cards ────────────────────────────────
  const statsHTML = \`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Agent Hours</div>
        <div class="stat-value stat-accent">\${ts.total_agent_hours.toFixed(1)}</div>
        <div class="stat-sub">\${ts.total_entries} entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Human Equiv Hours</div>
        <div class="stat-value stat-blue">\${ts.total_human_equiv_hours.toFixed(1)}</div>
        <div class="stat-sub">\${(ts.total_human_equiv_hours / (ts.total_agent_hours || 1)).toFixed(1)}x multiplier avg</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Agent Cost</div>
        <div class="stat-value">$\${ts.total_cost_usd.toFixed(2)}</div>
        <div class="stat-sub">\${ts.total_tokens.toLocaleString()} tokens</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Now</div>
        <div class="stat-value" style="color: \${running.length > 0 ? 'var(--accent)' : 'var(--text-muted)'}">\${running.length}</div>
        <div class="stat-sub">\${stats.agents} agents total</div>
      </div>
    </div>\`;

  // ─── Savings Banner ─────────────────────────────
  const savingsHTML = ts.total_savings_usd > 0 ? \`
    <div class="savings-banner">
      <div class="savings-left">
        <h3>💚 Estimated Value Delivered</h3>
        <div class="savings-amount">$\${ts.total_savings_usd.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
        <div class="savings-detail">Based on human-equivalent hours × avg hourly rates</div>
      </div>
      <div class="savings-right">
        <div class="equiv-hours">\${ts.total_human_equiv_hours.toFixed(1)} hrs</div>
        <div class="equiv-label">of human work completed by agents</div>
      </div>
    </div>\` : '';

  // ─── Tabs ───────────────────────────────────────
  const tabsHTML = \`
    <div class="tabs">
      <button class="tab active" onclick="showTab('entries', this)">Time Entries</button>
      <button class="tab" onclick="showTab('projects', this)">By Project</button>
      <button class="tab" onclick="showTab('agents', this)">By Agent</button>
      <button class="tab" onclick="showTab('categories', this)">By Category</button>
    </div>\`;

  // ─── Entries Table ──────────────────────────────
  const entriesRows = ts.entries.slice(0, 100).map(e => \`
    <tr>
      <td class="cell-mono">\${e.date}</td>
      <td class="cell-task">\${esc(e.task)}</td>
      <td>\${esc(e.project)}</td>
      <td>\${esc(e.client)}</td>
      <td>\${esc(e.agent)}</td>
      <td><span class="badge badge-cat">\${e.category}</span></td>
      <td class="cell-mono">\${formatDuration(e.duration_minutes)}</td>
      <td class="cell-mono">\${e.human_equiv_hours.toFixed(1)}h</td>
      <td class="cell-mono">$\${e.cost_usd.toFixed(4)}</td>
      <td><span class="badge badge-\${e.status}">\${e.status}</span></td>
    </tr>\`).join('');

  const entriesHTML = ts.entries.length > 0 ? \`
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Task</th><th>Project</th><th>Client</th><th>Agent</th><th>Category</th><th>Duration</th><th>Human Equiv</th><th>Cost</th><th>Status</th>
          </tr>
        </thead>
        <tbody>\${entriesRows}</tbody>
      </table>
    </div>\` : \`
    <div class="empty">
      <div class="empty-icon">📋</div>
      <div class="empty-title">No entries yet</div>
      <div class="empty-sub">Agents will appear here once they start clocking in</div>
    </div>\`;

  // ─── By Project ─────────────────────────────────
  const maxProjHours = Math.max(...ts.by_project.map(p => p.agent_hours), 0.1);
  const projectsHTML = \`
    <div class="table-wrap" style="padding: 20px;">
      <div class="breakdown-list">
        \${ts.by_project.map(p => \`
          <div class="breakdown-row">
            <div class="breakdown-label">\${esc(p.project)}</div>
            <div class="breakdown-bar-wrap">
              <div class="breakdown-bar" style="width: \${(p.agent_hours / maxProjHours * 100).toFixed(1)}%"></div>
            </div>
            <div class="breakdown-value">\${p.agent_hours.toFixed(1)}h → \${p.human_equiv_hours.toFixed(1)}h</div>
          </div>
        \`).join('') || '<div class="empty-sub">No project data</div>'}
      </div>
    </div>\`;

  // ─── By Agent ───────────────────────────────────
  const maxAgentHours = Math.max(...ts.by_agent.map(a => a.agent_hours), 0.1);
  const agentsHTML = \`
    <div class="table-wrap" style="padding: 20px;">
      <div class="breakdown-list">
        \${ts.by_agent.map(a => \`
          <div class="breakdown-row">
            <div class="breakdown-label">\${esc(a.agent)}</div>
            <div class="breakdown-bar-wrap">
              <div class="breakdown-bar" style="width: \${(a.agent_hours / maxAgentHours * 100).toFixed(1)}%; background: var(--blue)"></div>
            </div>
            <div class="breakdown-value">\${a.agent_hours.toFixed(1)}h · \${a.success_rate}%</div>
          </div>
        \`).join('') || '<div class="empty-sub">No agent data</div>'}
      </div>
    </div>\`;

  // ─── By Category ────────────────────────────────
  const maxCatHours = Math.max(...ts.by_category.map(c => c.agent_hours), 0.1);
  const catColors = { research: '--purple', content: '--green', code: '--blue', data_entry: '--yellow', design: '--accent', communication: '--text-primary', analysis: '--purple', testing: '--red', planning: '--blue', other: '--text-muted' };
  const catsHTML = \`
    <div class="table-wrap" style="padding: 20px;">
      <div class="breakdown-list">
        \${ts.by_category.map(c => \`
          <div class="breakdown-row">
            <div class="breakdown-label">\${c.category}</div>
            <div class="breakdown-bar-wrap">
              <div class="breakdown-bar" style="width: \${(c.agent_hours / maxCatHours * 100).toFixed(1)}%; background: var(\${catColors[c.category] || '--accent'})"></div>
            </div>
            <div class="breakdown-value">\${c.agent_hours.toFixed(1)}h · $\${c.savings_usd.toFixed(0)} saved</div>
          </div>
        \`).join('') || '<div class="empty-sub">No category data</div>'}
      </div>
    </div>\`;

  // ─── Running Now ────────────────────────────────
  const runningHTML = running.length > 0 ? \`
    <div class="section">
      <div class="section-header">
        <div class="section-title">⏱️ Running Now</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Agent</th><th>Task</th><th>Project</th><th>Client</th><th>Running For</th></tr></thead>
          <tbody>
            \${running.map(e => {
              const mins = Math.round((Date.now() - new Date(e.start).getTime()) / 60000);
              return \`<tr>
                <td>\${esc(e.agent)}</td>
                <td class="cell-task">\${esc(e.task)}</td>
                <td>\${esc(e.project)}</td>
                <td>\${esc(e.client)}</td>
                <td class="cell-mono" style="color:var(--accent)">\${formatDuration(mins)}</td>
              </tr>\`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>\` : '';

  // ─── Assemble ───────────────────────────────────
  app.innerHTML = statsHTML + savingsHTML + runningHTML + \`
    <div class="section">
      \${tabsHTML}
      <div id="tab-entries">\${entriesHTML}</div>
      <div id="tab-projects" style="display:none">\${projectsHTML}</div>
      <div id="tab-agents" style="display:none">\${agentsHTML}</div>
      <div id="tab-categories" style="display:none">\${catsHTML}</div>
    </div>\`;
}

function showTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  ['entries','projects','agents','categories'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === name ? 'block' : 'none';
  });
}

function formatDuration(mins) {
  if (mins < 1) return '<1m';
  if (mins < 60) return Math.round(mins) + 'm';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h + 'h ' + (m > 0 ? m + 'm' : '');
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById('periodSelect').addEventListener('change', loadData);
loadData();
setInterval(loadData, 30000); // Auto-refresh every 30s
</script>
</body>
</html>`;
}
