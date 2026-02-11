// Advanced Report Generator - Enhanced with stunning visuals
import fs from 'fs-extra';
import handlebars from 'handlebars';
import * as path from 'path';
import { ReportData, TestResult } from './parser.js';
import { Statistics, calculateStatistics, formatDuration, getStatusColor } from './statistics.js';

export interface AdvancedReportOptions {
  title?: string;
  theme?: 'dark' | 'light' | 'neon' | 'professional';
  outputPath: string;
  slackWebhook?: string;
  teamsWebhook?: string;
  emailTo?: string[];
}

export interface EnhancedMetrics extends Statistics {
  executionStartTime?: string;
  executionEndTime?: string;
  successTrendPercent?: number;
  performanceScore?: number;
  reliabilityScore?: number;
  efficiency?: number;
  testTimelineData?: any[];
  performanceTiers?: any;
}

export async function generateAdvancedReport(data: ReportData, options: AdvancedReportOptions): Promise<string> {
  if (!data || !data.tests || data.tests.length === 0) {
    throw new Error('Invalid or empty ReportData provided to generateAdvancedReport.');
  }

  const stats = calculateStatistics(data);
  const enhancedStats = enhanceStatistics(stats, data);
  
  registerHandlebarsHelpers();

  const theme = options.theme || 'professional';
  const title = options.title || 'Test Execution Report';
  
  // Generate test timeline
  const testTimeline = generateTestTimeline(data);
  
  // Generate performance data
  const performanceData = generatePerformanceAnalysis(data);

  const templateData = {
    title,
    theme,
    stats: enhancedStats,
    data,
    timestamp: new Date().toLocaleString(),
    executionDate: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    executionTime: new Date().toLocaleTimeString('en-US'),
    summary: {
      total: data.totalTests,
      passed: data.passed,
      failed: data.failed,
      skipped: data.skipped,
      flaky: data.flaky,
      duration: formatDuration(data.totalDuration)
    },
    metrics: {
      passRate: enhancedStats.passRate,
      failRate: enhancedStats.failRate,
      skipRate: enhancedStats.skipRate,
      flakyRate: data.totalTests > 0 ? Math.round((data.flaky / data.totalTests) * 100) : 0,
      averageDuration: formatDuration(enhancedStats.averageDuration),
      maxDuration: formatDuration(enhancedStats.maxDuration),
      minDuration: formatDuration(enhancedStats.minDuration),
      performanceScore: enhancedStats.performanceScore,
      reliabilityScore: enhancedStats.reliabilityScore,
      efficiency: enhancedStats.efficiency
    },
    charts: {
      statusData: JSON.stringify(generateStatusChart(data)),
      durationData: JSON.stringify(generateDurationChart(enhancedStats)),
      retriesData: JSON.stringify(generateRetriesChart(enhancedStats)),
      trendData: JSON.stringify(generateTrendData(enhancedStats)),
      timelineData: JSON.stringify(testTimeline.slice(0, 20)),
      performanceTiers: JSON.stringify(performanceData.tiers)
    },
    failedTests: stats.failedTests.slice(0, 25).map(t => ({
      ...t,
      durationDisplay: formatDuration(t.duration)
    })),
    flakyTests: stats.flakyTests.slice(0, 20).map(t => ({
      ...t,
      durationDisplay: formatDuration(t.duration)
    })),
    slowestTests: stats.slowestTests.slice(0, 20).map(t => {
      const maxDuration = enhancedStats.maxDuration || 1;
      return {
        ...t,
        durationDisplay: formatDuration(t.duration),
        percentage: Math.round((t.duration / maxDuration) * 100)
      };
    }),
    fastestTests: [...data.tests]
      .filter(t => t.status === 'passed')
      .sort((a, b) => a.duration - b.duration)
      .slice(0, 10)
      .map(t => ({
        ...t,
        durationDisplay: formatDuration(t.duration)
      }))
  };

  const css = getAdvancedStyles(theme);
  const html = getAdvancedHtmlTemplate(css, theme);
  
  const template = handlebars.compile(html);
  const report = template(templateData);

  await fs.ensureDir(path.dirname(options.outputPath));
  await fs.writeFile(options.outputPath, report, 'utf-8');

  // Send to integrations if configured
  if (options.slackWebhook) {
    await sendToSlack(options.slackWebhook, enhancedStats);
  }
  if (options.teamsWebhook) {
    await sendToTeams(options.teamsWebhook, enhancedStats);
  }

  return options.outputPath;
}

function registerHandlebarsHelpers() {
  handlebars.registerHelper('formatDuration', formatDuration);
  handlebars.registerHelper('eq', (a: any, b: any) => a === b);
  handlebars.registerHelper('gt', (a: number, b: number) => a > b);
  handlebars.registerHelper('gte', (a: number, b: number) => a >= b);
  handlebars.registerHelper('lt', (a: number, b: number) => a < b);
  handlebars.registerHelper('lte', (a: number, b: number) => a <= b);
  handlebars.registerHelper('percentage', (num: number) => `${num}%`);
  handlebars.registerHelper('json', (obj: any) => JSON.stringify(obj));
  handlebars.registerHelper('each_upto', function(ary: any[], max: number, options: any) {
    if(!ary || ary.length === 0) return '';
    let result = '';
    for(let i = 0; i < Math.min(ary.length, max); i++) {
      result += options.fn(ary[i]);
    }
    return result;
  });
}

function enhanceStatistics(stats: Statistics, data: ReportData): EnhancedMetrics {
  const totalTests = data.totalTests;
  const passRate = stats.passRate;
  const flakyCount = data.flaky;
  
  // Performance score (0-100)
  const performanceScore = Math.max(0, Math.min(100, 
    passRate * 0.6 + 
    (100 - (flakyCount / Math.max(1, totalTests) * 100)) * 0.3 +
    (stats.averageDuration < 5000 ? 10 : Math.max(0, 10 - (stats.averageDuration / 1000)))
  ));

  // Reliability score
  const reliabilityScore = Math.max(0, Math.min(100,
    passRate * 0.7 + (100 - (flakyCount / Math.max(1, totalTests) * 100)) * 0.3
  ));

  // Efficiency score (how fast tests run)
  const efficiency = Math.max(0, Math.min(100,
    stats.durationRanges.fast / Math.max(1, totalTests) * 100 +
    stats.durationRanges.medium / Math.max(1, totalTests) * 50
  ));

  return {
    ...stats,
    performanceScore: Math.round(performanceScore),
    reliabilityScore: Math.round(reliabilityScore),
    efficiency: Math.round(efficiency)
  };
}

function generateStatusChart(data: ReportData) {
  return [
    { name: 'Passed', value: data.passed, percentage: data.totalTests > 0 ? ((data.passed / data.totalTests) * 100).toFixed(1) : 0, color: '#10b981' },
    { name: 'Failed', value: data.failed, percentage: data.totalTests > 0 ? ((data.failed / data.totalTests) * 100).toFixed(1) : 0, color: '#ef4444' },
    { name: 'Skipped', value: data.skipped, percentage: data.totalTests > 0 ? ((data.skipped / data.totalTests) * 100).toFixed(1) : 0, color: '#f59e0b' },
    { name: 'Flaky', value: data.flaky, percentage: data.totalTests > 0 ? ((data.flaky / data.totalTests) * 100).toFixed(1) : 0, color: '#8b5cf6' }
  ];
}

function generateDurationChart(stats: Statistics) {
  const total = stats.durationRanges.fast + stats.durationRanges.medium + stats.durationRanges.slow + stats.durationRanges.verySlow;
  return [
    { name: 'Fast (<1s)', value: stats.durationRanges.fast, percent: total > 0 ? ((stats.durationRanges.fast / total) * 100).toFixed(1) : 0, color: '#06b6d4' },
    { name: 'Medium (1-5s)', value: stats.durationRanges.medium, percent: total > 0 ? ((stats.durationRanges.medium / total) * 100).toFixed(1) : 0, color: '#3b82f6' },
    { name: 'Slow (5-15s)', value: stats.durationRanges.slow, percent: total > 0 ? ((stats.durationRanges.slow / total) * 100).toFixed(1) : 0, color: '#f59e0b' },
    { name: 'Very Slow (>15s)', value: stats.durationRanges.verySlow, percent: total > 0 ? ((stats.durationRanges.verySlow / total) * 100).toFixed(1) : 0, color: '#ef4444' }
  ];
}

function generateRetriesChart(stats: Statistics) {
  return Object.entries(stats.retriesDistribution)
    .map(([retries, count]) => ({ retries: parseInt(retries), count }))
    .sort((a, b) => a.retries - b.retries)
    .slice(0, 5);
}

function generateTrendData(stats: Statistics) {
  return [
    { label: 'Pass Rate', value: stats.passRate, color: '#10b981' },
    { label: 'Fail Rate', value: stats.failRate, color: '#ef4444' },
    { label: 'Skip Rate', value: stats.skipRate, color: '#f59e0b' }
  ];
}

function generateTestTimeline(data: ReportData) {
  return data.tests
    .sort((a, b) => b.duration - a.duration)
    .map((test, index) => ({
      ...test,
      index,
      durationMs: test.duration,
      durationDisplay: formatDuration(test.duration),
      percentage: (test.duration / Math.max(...data.tests.map(t => t.duration), 1)) * 100
    }));
}

function generatePerformanceAnalysis(data: ReportData) {
  const sorted = [...data.tests].sort((a, b) => b.duration - a.duration);
  const quartile25 = sorted[Math.floor(sorted.length * 0.25)]?.duration || 0;
  const quartile50 = sorted[Math.floor(sorted.length * 0.50)]?.duration || 0;
  const quartile75 = sorted[Math.floor(sorted.length * 0.75)]?.duration || 0;

  return {
    tiers: [
      { tier: 'Ultra Fast', max: quartile25, count: data.tests.filter(t => t.duration <= quartile25).length, color: '#06b6d4' },
      { tier: 'Fast', max: quartile50, count: data.tests.filter(t => t.duration > quartile25 && t.duration <= quartile50).length, color: '#10b981' },
      { tier: 'Normal', max: quartile75, count: data.tests.filter(t => t.duration > quartile50 && t.duration <= quartile75).length, color: '#f59e0b' },
      { tier: 'Slow', max: Infinity, count: data.tests.filter(t => t.duration > quartile75).length, color: '#ef4444' }
    ]
  };
}

async function sendToSlack(webhook: string, stats: EnhancedMetrics) {
  try {
    const payload = {
      text: '📊 Test Execution Report',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Test Results Summary*\n✅ Passed: ${stats.passRate}%\n❌ Failed: ${stats.failRate}%\n⏭️  Skipped: ${stats.skipRate}%\n🔄 Performance Score: ${stats.performanceScore}/100`
          }
        }
      ]
    };
    await fetch(webhook, { method: 'POST', body: JSON.stringify(payload) });
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
  }
}

async function sendToTeams(webhook: string, stats: EnhancedMetrics) {
  try {
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: 'Test Execution Report',
      themeColor: stats.failRate > 0 ? 'FF0000' : '00FF00',
      sections: [
        {
          activityTitle: 'Test Results',
          facts: [
            { name: 'Passed', value: `${stats.passRate}%` },
            { name: 'Failed', value: `${stats.failRate}%` },
            { name: 'Performance Score', value: `${stats.performanceScore}/100` }
          ]
        }
      ]
    };
    await fetch(webhook, { method: 'POST', body: JSON.stringify(payload) });
  } catch (error) {
    console.error('Failed to send Teams notification:', error);
  }
}

function getAdvancedStyles(theme: string): string {
  let colors: any = {};
  
  switch(theme) {
    case 'neon':
      colors = {
        bg: '#0a0e27',
        text: '#e0e7ff',
        accent: '#00ff88',
        secondary: '#00d4ff',
        card: '#1a1f3a',
        border: '#00ff88'
      };
      break;
    case 'professional':
      colors = {
        bg: '#f8fafc',
        text: '#1e293b',
        accent: '#2563eb',
        secondary: '#7c3aed',
        card: '#ffffff',
        border: '#e2e8f0'
      };
      break;
    case 'light':
      colors = {
        bg: '#ffffff',
        text: '#0f172a',
        accent: '#3b82f6',
        secondary: '#8b5cf6',
        card: '#f9fafb',
        border: '#e5e7eb'
      };
      break;
    case 'dark':
    default:
      colors = {
        bg: '#0f172a',
        text: '#e2e8f0',
        accent: '#60a5fa',
        secondary: '#a78bfa',
        card: '#1e293b',
        border: '#334155'
      };
  }

  return `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, ${colors.bg} 0%, ${colors.bg} 100%);
  color: ${colors.text};
  line-height: 1.6;
  min-height: 100vh;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

header {
  background: linear-gradient(135deg, ${colors.accent} 0%, ${colors.secondary} 100%);
  color: white;
  padding: 50px 40px;
  border-radius: 16px;
  margin-bottom: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
  overflow: hidden;
}

header::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -10%;
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

header h1 {
  font-size: 3em;
  margin-bottom: 10px;
  font-weight: 800;
  letter-spacing: -1px;
  position: relative;
  z-index: 1;
}

header p {
  font-size: 1.1em;
  opacity: 0.95;
  position: relative;
  z-index: 1;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.metric-card {
  background: ${colors.card};
  border: 2px solid ${colors.border};
  border-radius: 12px;
  padding: 30px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.metric-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
  border-color: ${colors.accent};
}

.metric-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 3px;
  background: ${colors.accent};
  transition: left 0.3s ease;
}

.metric-card:hover::before {
  left: 0;
}

.metric-number {
  font-size: 3em;
  font-weight: 800;
  margin: 15px 0;
  background: linear-gradient(135deg, ${colors.accent}, ${colors.secondary});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.metric-label {
  font-size: 0.95em;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.metric-sub {
  font-size: 0.85em;
  margin-top: 10px;
  opacity: 0.6;
}

.score-indicator {
  display: inline-block;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: conic-gradient(${colors.accent} 0deg, ${colors.accent} var(--score), ${colors.border} var(--score), ${colors.border} 360deg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.5em;
  color: ${colors.text};
  margin: 15px auto;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 25px;
  margin-bottom: 40px;
}

.chart-card {
  background: ${colors.card};
  border: 2px solid ${colors.border};
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.chart-card h3 {
  margin-bottom: 20px;
  font-size: 1.3em;
  color: ${colors.accent};
  font-weight: 700;
}

.chart-container {
  position: relative;
  height: 300px;
  margin-bottom: 10px;
}

canvas {
  max-height: 300px !important;
}

.section {
  background: ${colors.card};
  border: 2px solid ${colors.border};
  border-radius: 12px;
  padding: 30px;
  margin-bottom: 25px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.section h2 {
  font-size: 1.8em;
  margin-bottom: 25px;
  font-weight: 700;
  color: ${colors.accent};
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 15px;
  border-bottom: 3px solid ${colors.border};
}

.table-responsive {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95em;
}

.data-table thead {
  background: linear-gradient(90deg, ${colors.accent}20, ${colors.secondary}20);
  border-bottom: 3px solid ${colors.accent};
}

.data-table th {
  padding: 15px;
  text-align: left;
  font-weight: 700;
  color: ${colors.accent};
  text-transform: uppercase;
  font-size: 0.85em;
  letter-spacing: 1px;
}

.data-table td {
  padding: 12px 15px;
  border-bottom: 1px solid ${colors.border};
}

.data-table tbody tr:hover {
  background: linear-gradient(90deg, ${colors.accent}10, ${colors.secondary}10);
}

.data-table tbody tr:nth-child(even) {
  background: ${colors.bg}20;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.85em;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.status-passed { background: #10b98120; color: #10b981; border: 1px solid #10b981; }
.status-failed { background: #ef444420; color: #ef4444; border: 1px solid #ef4444; }
.status-skipped { background: #f59e0b20; color: #f59e0b; border: 1px solid #f59e0b; }
.status-flaky { background: #8b5cf620; color: #8b5cf6; border: 1px solid #8b5cf6; }

.duration-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.duration-fill {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, ${colors.accent}, ${colors.secondary});
  flex: 1;
  position: relative;
  overflow: hidden;
}

.duration-text {
  font-weight: 600;
  min-width: 80px;
  text-align: right;
}

.error-box {
  background: #ef444420;
  border-left: 4px solid #ef4444;
  padding: 15px;
  border-radius: 4px;
  margin-top: 10px;
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
  color: #ef4444;
  overflow-x: auto;
}

.comparison-bar {
  width: 100%;
  height: 25px;
  background: ${colors.border};
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  margin: 10px 0;
}

.comparison-segment {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.75em;
  transition: flex 0.3s ease;
}

.footer {
  text-align: center;
  padding: 40px 20px;
  opacity: 0.7;
  font-size: 0.9em;
  border-top: 2px solid ${colors.border};
  margin-top: 60px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.stat-item {
  background: ${colors.bg};
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid ${colors.accent};
}

.stat-label {
  font-size: 0.85em;
  opacity: 0.7;
  text-transform: uppercase;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 1.5em;
  font-weight: 700;
  color: ${colors.accent};
}

@media (max-width: 768px) {
  header h1 { font-size: 2em; }
  .charts-grid { grid-template-columns: 1fr; }
  .metrics-grid { grid-template-columns: 1fr; }
  .data-table { font-size: 0.85em; }
  .data-table th, .data-table td { padding: 10px; }
}
  `;
}

function getAdvancedHtmlTemplate(css: string, theme: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}} - Test Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
  <style>
    ${css}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 {{title}}</h1>
      <p>Generated on {{executionDate}} at {{executionTime}}</p>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Pass Rate</div>
        <div class="metric-number">{{metrics.passRate}}%</div>
        <div class="metric-sub">{{summary.passed}}/{{summary.total}} passed</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Performance Score</div>
        <div style="--score: {{metrics.performanceScore}}%;" class="score-indicator">{{metrics.performanceScore}}</div>
        <div class="metric-sub">Overall performance</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Reliability Score</div>
        <div style="--score: {{metrics.reliabilityScore}}%;" class="score-indicator">{{metrics.reliabilityScore}}</div>
        <div class="metric-sub">Test stability</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Execution Time</div>
        <div class="metric-number" style="font-size: 2em;">{{summary.duration}}</div>
        <div class="metric-sub">Total duration</div>
      </div>
    </div>

    <div class="section">
      <h2>📈 Test Summary Statistics</h2>
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-label">Total Tests</div>
          <div class="stat-value">{{summary.total}}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">✓ Passed</div>
          <div class="stat-value">{{summary.passed}}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">✕ Failed</div>
          <div class="stat-value">{{summary.failed}}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">⊘ Skipped</div>
          <div class="stat-value">{{summary.skipped}}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">🔄 Flaky</div>
          <div class="stat-value">{{summary.flaky}}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">⏱ Avg Duration</div>
          <div class="stat-value">{{metrics.averageDuration}}</div>
        </div>
      </div>

      <div class="comparison-bar">
        <div class="comparison-segment" style="flex: {{metrics.passRate}}%; background: #10b981;">{{metrics.passRate}}%</div>
        <div class="comparison-segment" style="flex: {{metrics.failRate}}%; background: #ef4444;">{{metrics.failRate}}%</div>
        <div class="comparison-segment" style="flex: {{metrics.skipRate}}%; background: #f59e0b;">{{metrics.skipRate}}%</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <h3>🎯 Test Status Distribution</h3>
        <div class="chart-container">
          <canvas id="statusChart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <h3>⚡ Performance by Duration</h3>
        <div class="chart-container">
          <canvas id="durationChart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <h3>🔄 Retry Distribution</h3>
        <div class="chart-container">
          <canvas id="retriesChart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <h3>📊 Performance Tiers</h3>
        <div class="chart-container">
          <canvas id="tiersChart"></canvas>
        </div>
      </div>
    </div>

    {{#if slowestTests.length}}
    <div class="section">
      <h2>🐢 Slowest Tests (Top 20)</h2>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Performance</th>
            </tr>
          </thead>
          <tbody>
            {{#each_upto slowestTests 20}}
            <tr>
              <td><strong>{{this.title}}</strong></td>
              <td>{{this.durationDisplay}}</td>
              <td><span class="status-badge status-{{this.status}}">{{this.status}}</span></td>
              <td>
                <div class="duration-bar">
                  <div class="duration-fill" style="width: {{this.percentage}}%"></div>
                </div>
              </td>
            </tr>
            {{/each_upto}}
          </tbody>
        </table>
      </div>
    </div>
    {{/if}}

    {{#if fastestTests.length}}
    <div class="section">
      <h2>⚡ Fastest Tests (Top 10)</h2>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {{#each_upto fastestTests 10}}
            <tr>
              <td><strong>{{this.title}}</strong></td>
              <td><span class="status-badge" style="background: #06b6d420; color: #06b6d4; border: 1px solid #06b6d4;">⚡ {{this.durationDisplay}}</span></td>
              <td><span class="status-badge status-{{this.status}}">{{this.status}}</span></td>
            </tr>
            {{/each_upto}}
          </tbody>
        </table>
      </div>
    </div>
    {{/if}}

    {{#if failedTests.length}}
    <div class="section">
      <h2>❌ Failed Tests ({{failedTests.length}})</h2>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Duration</th>
              <th>Error Details</th>
            </tr>
          </thead>
          <tbody>
            {{#each_upto failedTests 25}}
            <tr>
              <td><strong>{{this.title}}</strong></td>
              <td>{{this.durationDisplay}}</td>
              <td>
                {{#if this.error}}
                <div class="error-box">{{this.error}}</div>
                {{/if}}
              </td>
            </tr>
            {{/each_upto}}
          </tbody>
        </table>
      </div>
    </div>
    {{/if}}

    {{#if flakyTests.length}}
    <div class="section">
      <h2>🔄 Flaky Tests ({{flakyTests.length}})</h2>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Retries</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {{#each_upto flakyTests 20}}
            <tr>
              <td><strong>{{this.title}}</strong></td>
              <td><span class="status-badge status-flaky">🔄 {{this.retries}} retries</span></td>
              <td>{{this.durationDisplay}}</td>
              <td><span class="status-badge status-{{this.status}}">{{this.status}}</span></td>
            </tr>
            {{/each_upto}}
          </tbody>
        </table>
      </div>
    </div>
    {{/if}}

    <footer class="footer">
      <p>🎭 Advanced Test Report Generator | Generated: {{timestamp}}</p>
      <p style="font-size: 0.8em; margin-top: 10px; opacity: 0.5;">Report includes comprehensive test analytics, performance metrics, and detailed insights</p>
    </footer>
  </div>

  <script>
    const chartConfig = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { size: 12, family: "'Segoe UI', Tahoma" }, padding: 15 } }
      }
    };

    // Status Chart
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx) {
      new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: ['Passed', 'Failed', 'Skipped', 'Flaky'],
          datasets: [{
            data: [{{summary.passed}}, {{summary.failed}}, {{summary.skipped}}, {{summary.flaky}}],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6'],
            borderColor: '#fff',
            borderWidth: 3
          }]
        },
        options: { ...chartConfig, plugins: { ...chartConfig.plugins, tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); const pct = ((ctx.parsed / total) * 100).toFixed(1); return ctx.label + ': ' + ctx.parsed + ' (' + pct + '%)'; } } } } }
      });
    }

    // Duration Chart
    const durationCtx = document.getElementById('durationChart');
    if (durationCtx) {
      new Chart(durationCtx, {
        type: 'bar',
        data: {
          labels: ['Fast (<1s)', 'Medium (1-5s)', 'Slow (5-15s)', 'Very Slow (>15s)'],
          datasets: [{
            label: 'Test Count',
            data: [{{stats.durationRanges.fast}}, {{stats.durationRanges.medium}}, {{stats.durationRanges.slow}}, {{stats.durationRanges.verySlow}}],
            backgroundColor: ['#06b6d4', '#3b82f6', '#f59e0b', '#ef4444'],
            borderRadius: 8,
            borderSkipped: false
          }]
        },
        options: { ...chartConfig, indexAxis: 'y' }
      });
    }

    // Retries Chart
    const retriesCtx = document.getElementById('retriesChart');
    if (retriesCtx) {
      const retriesData = {{{charts.retriesData}}};
      new Chart(retriesCtx, {
        type: 'line',
        data: {
          labels: retriesData.map(d => d.retries + ' retries'),
          datasets: [{
            label: 'Test Count',
            data: retriesData.map(d => d.count),
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96, 165, 250, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 6,
            pointBackgroundColor: '#60a5fa',
            pointBorderColor: '#fff',
            pointBorderWidth: 2
          }]
        },
        options: chartConfig
      });
    }

    // Tiers Chart
    const tiersCtx = document.getElementById('tiersChart');
    if (tiersCtx) {
      const tiersData = {{{charts.performanceTiers}}};
      new Chart(tiersCtx, {
        type: 'bar',
        data: {
          labels: tiersData.map(t => t.tier),
          datasets: [{
            label: 'Tests in Tier',
            data: tiersData.map(t => t.count),
            backgroundColor: tiersData.map(t => t.color),
            borderRadius: 8,
            borderSkipped: false
          }]
        },
        options: { ...chartConfig, indexAxis: 'y' }
      });
    }
  </script>
</body>
</html>
  `;
}
