/**
 * ⏱️🦀 Clawck — Social Share Card Generator
 * Generates embeddable HTML cards for sharing on social media.
 */

import { Digest, TimesheetSummary } from '../core/types';

export interface ShareCardOptions {
  title?: string;
  subtitle?: string;
  theme?: 'light' | 'dark' | 'gradient';
  branding?: boolean;
}

export interface ShareCard {
  html: string;
  width: number;
  height: number;
  title: string;
  description: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate a social share card from a digest
 */
export function generateDigestCard(digest: Digest, options: ShareCardOptions = {}): ShareCard {
  const title = options.title || (digest.period === 'day' ? 'Daily Summary' : 'Weekly Summary');
  const theme = options.theme || 'gradient';
  const showBranding = options.branding !== false;

  const dateLabel = digest.period === 'day'
    ? digest.period_start.split('T')[0]
    : `${digest.period_start.split('T')[0]} — ${digest.period_end.split('T')[0]}`;

  const stats = digest.summary;
  const topHighlight = digest.highlights[0];

  const description = `${stats.total_entries} tasks | ${stats.total_agent_hours.toFixed(1)}h agent time | $${stats.total_savings_usd.toFixed(0)} saved`;

  const styles = getCardStyles(theme);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="twitter:card" content="summary_large_image">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; ${styles.body} }
    .card {
      width: 1200px;
      height: 630px;
      padding: 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      ${styles.card}
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 48px; font-weight: 700; ${styles.title} }
    .subtitle { font-size: 24px; margin-top: 12px; ${styles.subtitle} }
    .logo { font-size: 28px; font-weight: 700; ${styles.logo} }
    .stats { display: flex; gap: 60px; margin-top: 40px; }
    .stat { flex: 1; }
    .stat-value { font-size: 72px; font-weight: 700; ${styles.value} }
    .stat-label { font-size: 20px; margin-top: 8px; ${styles.label} }
    .highlight {
      margin-top: 40px;
      padding: 24px 32px;
      border-radius: 16px;
      ${styles.highlight}
    }
    .highlight-label { font-size: 18px; ${styles.highlightLabel} }
    .highlight-value { font-size: 28px; font-weight: 600; margin-top: 8px; ${styles.highlightValue} }
    .footer { display: flex; justify-content: space-between; align-items: center; }
    .date { font-size: 20px; ${styles.date} }
    .branding { font-size: 20px; ${styles.branding} }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <div class="header">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="subtitle">${options.subtitle || 'AI Agent Productivity Report'}</div>
        </div>
        ${showBranding ? '<div class="logo">⏱️🦀 Clawck</div>' : ''}
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${stats.total_entries}</div>
          <div class="stat-label">Tasks Completed</div>
        </div>
        <div class="stat">
          <div class="stat-value">${stats.total_agent_hours.toFixed(1)}h</div>
          <div class="stat-label">Agent Time</div>
        </div>
        <div class="stat">
          <div class="stat-value">$${stats.total_savings_usd.toFixed(0)}</div>
          <div class="stat-label">Est. Savings</div>
        </div>
      </div>
      ${topHighlight ? `
      <div class="highlight">
        <div class="highlight-label">${escapeHtml(topHighlight.label)}</div>
        <div class="highlight-value">${escapeHtml(topHighlight.value)}${topHighlight.metric ? ` (${topHighlight.metric}${topHighlight.type.includes('task') ? 'm' : 'h'})` : ''}</div>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <div class="date">${dateLabel}</div>
      ${showBranding ? '<div class="branding">clawck.dev</div>' : ''}
    </div>
  </div>
</body>
</html>`;

  return {
    html,
    width: 1200,
    height: 630,
    title,
    description,
  };
}

/**
 * Generate a social share card from timesheet summary
 */
export function generateTimesheetCard(summary: TimesheetSummary, options: ShareCardOptions = {}): ShareCard {
  const title = options.title || 'Timesheet Summary';
  const theme = options.theme || 'gradient';
  const showBranding = options.branding !== false;

  const dateLabel = `${summary.period_start.split('T')[0]} — ${summary.period_end.split('T')[0]}`;
  const description = `${summary.total_entries} entries | ${summary.total_agent_hours.toFixed(1)}h | $${summary.total_savings_usd.toFixed(0)} saved`;

  const styles = getCardStyles(theme);

  const topProject = summary.by_project[0];
  const topAgent = summary.by_agent[0];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="twitter:card" content="summary_large_image">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; ${styles.body} }
    .card {
      width: 1200px;
      height: 630px;
      padding: 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      ${styles.card}
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 48px; font-weight: 700; ${styles.title} }
    .subtitle { font-size: 24px; margin-top: 12px; ${styles.subtitle} }
    .logo { font-size: 28px; font-weight: 700; ${styles.logo} }
    .stats { display: flex; gap: 40px; margin-top: 40px; }
    .stat { flex: 1; }
    .stat-value { font-size: 64px; font-weight: 700; ${styles.value} }
    .stat-label { font-size: 18px; margin-top: 8px; ${styles.label} }
    .highlights { display: flex; gap: 24px; margin-top: 40px; }
    .highlight {
      flex: 1;
      padding: 24px;
      border-radius: 16px;
      ${styles.highlight}
    }
    .highlight-label { font-size: 16px; ${styles.highlightLabel} }
    .highlight-value { font-size: 24px; font-weight: 600; margin-top: 8px; ${styles.highlightValue} }
    .footer { display: flex; justify-content: space-between; align-items: center; }
    .date { font-size: 20px; ${styles.date} }
    .branding { font-size: 20px; ${styles.branding} }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <div class="header">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="subtitle">${options.subtitle || 'AI Agent Time Tracking'}</div>
        </div>
        ${showBranding ? '<div class="logo">⏱️🦀 Clawck</div>' : ''}
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${summary.total_entries}</div>
          <div class="stat-label">Total Entries</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.total_agent_hours.toFixed(1)}h</div>
          <div class="stat-label">Agent Time</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.total_human_equiv_hours.toFixed(0)}h</div>
          <div class="stat-label">Human Equivalent</div>
        </div>
        <div class="stat">
          <div class="stat-value">$${summary.total_savings_usd.toFixed(0)}</div>
          <div class="stat-label">Est. Savings</div>
        </div>
      </div>
      <div class="highlights">
        ${topProject ? `
        <div class="highlight">
          <div class="highlight-label">Top Project</div>
          <div class="highlight-value">${escapeHtml(topProject.project)}</div>
        </div>
        ` : ''}
        ${topAgent ? `
        <div class="highlight">
          <div class="highlight-label">Top Agent</div>
          <div class="highlight-value">${escapeHtml(topAgent.agent)}</div>
        </div>
        ` : ''}
      </div>
    </div>
    <div class="footer">
      <div class="date">${dateLabel}</div>
      ${showBranding ? '<div class="branding">clawck.dev</div>' : ''}
    </div>
  </div>
</body>
</html>`;

  return {
    html,
    width: 1200,
    height: 630,
    title,
    description,
  };
}

function getCardStyles(theme: 'light' | 'dark' | 'gradient'): Record<string, string> {
  if (theme === 'dark') {
    return {
      body: 'background: #0a0a0a;',
      card: 'background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);',
      title: 'color: #ffffff;',
      subtitle: 'color: #a0aec0;',
      logo: 'color: #ffd93d;',
      value: 'color: #ffffff;',
      label: 'color: #a0aec0;',
      highlight: 'background: rgba(255,255,255,0.1);',
      highlightLabel: 'color: #a0aec0;',
      highlightValue: 'color: #ffffff;',
      date: 'color: #718096;',
      branding: 'color: #718096;',
    };
  }
  if (theme === 'gradient') {
    return {
      body: 'background: #0a0a0a;',
      card: 'background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);',
      title: 'color: #ffffff;',
      subtitle: 'color: rgba(255,255,255,0.8);',
      logo: 'color: #ffffff;',
      value: 'color: #ffffff;',
      label: 'color: rgba(255,255,255,0.7);',
      highlight: 'background: rgba(255,255,255,0.15);',
      highlightLabel: 'color: rgba(255,255,255,0.7);',
      highlightValue: 'color: #ffffff;',
      date: 'color: rgba(255,255,255,0.6);',
      branding: 'color: rgba(255,255,255,0.6);',
    };
  }
  // light theme
  return {
    body: 'background: #f7f7f7;',
    card: 'background: #ffffff; border: 1px solid #e2e8f0;',
    title: 'color: #1a202c;',
    subtitle: 'color: #718096;',
    logo: 'color: #e53e3e;',
    value: 'color: #1a202c;',
    label: 'color: #718096;',
    highlight: 'background: #f7fafc;',
    highlightLabel: 'color: #718096;',
    highlightValue: 'color: #1a202c;',
    date: 'color: #a0aec0;',
    branding: 'color: #a0aec0;',
  };
}
