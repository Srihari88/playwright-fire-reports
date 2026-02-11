// HTML Report Generator
import fs from 'fs-extra';
import handlebars from 'handlebars';
import * as path from 'path';
import { ReportData } from './parser.js';
import { Statistics, calculateStatistics, formatDuration, getStatusColor, getStatusIcon } from './statistics.js';

export interface ReportOptions {
  title?: string;
  theme?: 'light' | 'dark';
  outputPath: string;
}

export async function generateReport(data: ReportData, options: ReportOptions): Promise<string> {
  if (!data || !data.tests || data.tests.length === 0) {
    throw new Error('Invalid or empty ReportData provided to generateReport.');
  }

  const stats = calculateStatistics(data);
  
  // Register Handlebars helpers
  handlebars.registerHelper('formatDuration', formatDuration);
  handlebars.registerHelper('statusIcon', getStatusIcon);
  handlebars.registerHelper('statusColor', getStatusColor);
  handlebars.registerHelper('eq', (a: any, b: any) => a === b);
  handlebars.registerHelper('gt', (a: number, b: number) => a > b);
  handlebars.registerHelper('times', function(n: number, block: any) {
    let accum = '';
    for (let i = 0; i < n; i++) {
      accum += block.fn(i);
    }
    return accum;
  });

  const theme = options.theme || 'light';
  const title = options.title || 'Playwright Test Report';
  
  const templateData = {
    title,
    theme,
    stats,
    data,
    passRate: stats.passRate,
    failRate: stats.failRate,
    skipRate: stats.skipRate,
    timestamp: new Date().toLocaleString(),
    summary: {
      total: data.totalTests,
      passed: data.passed,
      failed: data.failed,
      skipped: data.skipped,
      flaky: data.flaky
    },
    charts: {
      statusDistribution: JSON.stringify([
        { name: 'Passed', value: data.passed, color: '#10b981' },
        { name: 'Failed', value: data.failed, color: '#ef4444' },
        { name: 'Skipped', value: data.skipped, color: '#f59e0b' }
      ]),
      durationRanges: JSON.stringify([
        { name: 'Fast (<1s)', value: stats.durationRanges.fast },
        { name: 'Medium (1-5s)', value: stats.durationRanges.medium },
        { name: 'Slow (5-15s)', value: stats.durationRanges.slow },
        { name: 'Very Slow (>15s)', value: stats.durationRanges.verySlow }
      ]),
      retriesData: JSON.stringify(
        Object.entries(stats.retriesDistribution)
          .map(([retries, count]) => ({ retries: parseInt(retries), count }))
          .sort((a, b) => a.retries - b.retries)
      )
    },
    failedTests: stats.failedTests.slice(0, 20),
    flakyTests: stats.flakyTests.slice(0, 15),
    slowestTests: stats.slowestTests.slice(0, 15)
  };

  const css = getStyles(theme);
  const html = getHtmlTemplate(css, theme);
  
  const template = handlebars.compile(html);
  const report = template(templateData);

  await fs.ensureDir(path.dirname(options.outputPath));
  await fs.writeFile(options.outputPath, report, 'utf-8');

  return options.outputPath;
}

function getStyles(theme: string): string {
  const isDark = theme === 'dark';
  const bgColor = isDark ? '#1f2937' : '#ffffff';
  const textColor = isDark ? '#f3f4f6' : '#111827';
  const borderColor = isDark ? '#374151' : '#e5e7eb';
  const cardBg = isDark ? '#111827' : '#f9fafb';

  return `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: ${bgColor};
  color: ${textColor};
  line-height: 1.6;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 40px 20px;
  border-radius: 12px;
  margin-bottom: 30px;
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.2);
}

header h1 {
  font-size: 2.5em;
  margin-bottom: 10px;
  font-weight: 700;
}

header p {
  font-size: 1.1em;
  opacity: 0.9;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.summary-card {
  background: ${cardBg};
  border: 1px solid ${borderColor};
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.summary-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.summary-card .number {
  font-size: 2.5em;
  font-weight: 700;
  margin: 10px 0;
}

.summary-card .label {
  font-size: 0.9em;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.summary-card.passed .number { color: #10b981; }
.summary-card.failed .number { color: #ef4444; }
.summary-card.skipped .number { color: #f59e0b; }
.summary-card.flaky .number { color: #8b5cf6; }

.charts-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.chart-card {
  background: ${cardBg};
  border: 1px solid ${borderColor};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.chart-card h3 {
  margin-bottom: 15px;
  font-size: 1.2em;
  font-weight: 600;
}

.chart-container {
  position: relative;
  height: 300px;
}

canvas {
  max-height: 300px;
}

.progress-bar {
  width: 100%;
  height: 30px;
  background: ${borderColor};
  border-radius: 15px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.85em;
}

.section {
  background: ${cardBg};
  border: 1px solid ${borderColor};
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.section h2 {
  font-size: 1.5em;
  margin-bottom: 20px;
  font-weight: 600;
  border-bottom: 2px solid #667eea;
  padding-bottom: 10px;
}

.tests-table {
  width: 100%;
  border-collapse: collapse;
}

.tests-table thead {
  background: ${isDark ? '#1f2937' : '#f3f4f6'};
}

.tests-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid ${borderColor};
}

.tests-table td {
  padding: 12px;
  border-bottom: 1px solid ${borderColor};
}

.tests-table tbody tr:hover {
  background: ${isDark ? '#1f2937' : '#f9fafb'};
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85em;
  font-weight: 500;
}

.status-badge.passed { background: #d1fae5; color: #065f46; }
.status-badge.failed { background: #fee2e2; color: #7f1d1d; }
.status-badge.skipped { background: #fef3c7; color: #78350f; }

.test-name {
  font-weight: 500;
  word-break: break-word;
}

.error-message {
  background: #fee2e2;
  color: #991b1b;
  padding: 10px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
  margin-top: 5px;
  border-left: 4px solid #dc2626;
}

.empty-state {
  text-align: center;
  padding: 40px;
  opacity: 0.6;
}

footer {
  text-align: center;
  padding: 20px;
  opacity: 0.7;
  font-size: 0.9em;
  margin-top: 40px;
  border-top: 1px solid ${borderColor};
}

@media (max-width: 768px) {
  .charts-section {
    grid-template-columns: 1fr;
  }
  
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  header h1 {
    font-size: 1.8em;
  }
  
  .tests-table {
    font-size: 0.9em;
  }
}
  `;
}

function getHtmlTemplate(css: string, theme: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
  <style>
    ${css}
  </style>
</head>
<body class="theme-${theme}">
  <div class="container">
    <header>
      <h1>{{title}}</h1>
      <p>Generated on {{timestamp}}</p>
    </header>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card passed">
        <div class="label">Passed</div>
        <div class="number">{{summary.passed}}</div>
        <div class="label">{{passRate}}%</div>
      </div>
      <div class="summary-card failed">
        <div class="label">Failed</div>
        <div class="number">{{summary.failed}}</div>
        <div class="label">{{failRate}}%</div>
      </div>
      <div class="summary-card skipped">
        <div class="label">Skipped</div>
        <div class="number">{{summary.skipped}}</div>
        <div class="label">{{skipRate}}%</div>
      </div>
      <div class="summary-card flaky">
        <div class="label">Flaky Tests</div>
        <div class="number">{{summary.flaky}}</div>
        <div class="label">Retried</div>
      </div>
    </div>

    <!-- Progress Bars -->
    <div class="section">
      <h3 style="margin-top: 0; margin-bottom: 15px;">Overall Status</h3>
      
      <div style="margin-bottom: 20px;">
        <strong>Pass Rate: {{passRate}}%</strong>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {{passRate}}%; background: #10b981;">
            {{passRate}}%
          </div>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <strong>Failure Rate: {{failRate}}%</strong>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {{failRate}}%; background: #ef4444;">
            {{failRate}}%
          </div>
        </div>
      </div>

      <div>
        <strong>Skip Rate: {{skipRate}}%</strong>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {{skipRate}}%; background: #f59e0b;">
            {{skipRate}}%
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-section">
      <div class="chart-card">
        <h3>Test Status Distribution</h3>
        <div class="chart-container">
          <canvas id="statusChart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <h3>Test Duration Distribution</h3>
        <div class="chart-container">
          <canvas id="durationChart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <h3>Retries Distribution</h3>
        <div class="chart-container">
          <canvas id="retriesChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Statistics Section -->
    <div class="section">
      <h2>📊 Test Statistics</h2>
      <table class="tests-table">
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Total Tests</td>
          <td><strong>{{summary.total}}</strong></td>
        </tr>
        <tr>
          <td>Average Duration</td>
          <td>{{formatDuration stats.averageDuration}}</td>
        </tr>
        <tr>
          <td>Max Duration</td>
          <td>{{formatDuration stats.maxDuration}}</td>
        </tr>
        <tr>
          <td>Min Duration</td>
          <td>{{formatDuration stats.minDuration}}</td>
        </tr>
        <tr>
          <td>Total Duration</td>
          <td>{{formatDuration data.totalDuration}}</td>
        </tr>
      </table>
    </div>

    {{#if stats.failedTests.length}}
    <!-- Failed Tests -->
    <div class="section">
      <h2>❌ Failed Tests ({{stats.failedTests.length}})</h2>
      <table class="tests-table">
        <thead>
          <tr>
            <th>Test Name</th>
            <th>Duration</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {{#each stats.failedTests}}
          <tr>
            <td class="test-name">{{this.title}}</td>
            <td>{{formatDuration this.duration}}</td>
            <td>
              {{#if this.error}}
              <div class="error-message">{{this.error}}</div>
              {{/if}}
            </td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
    {{/if}}

    {{#if stats.flakyTests.length}}
    <!-- Flaky Tests -->
    <div class="section">
      <h2>🔄 Flaky Tests ({{stats.flakyTests.length}})</h2>
      <table class="tests-table">
        <thead>
          <tr>
            <th>Test Name</th>
            <th>Retries</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {{#each stats.flakyTests}}
          <tr>
            <td class="test-name">{{this.title}}</td>
            <td><span class="status-badge failed">{{this.retries}} retries</span></td>
            <td>{{formatDuration this.duration}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
    {{/if}}

    <!-- Slowest Tests -->
    <div class="section">
      <h2>🐢 Slowest Tests</h2>
      <table class="tests-table">
        <thead>
          <tr>
            <th>Test Name</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {{#each stats.slowestTests}}
          <tr>
            <td class="test-name">{{this.title}}</td>
            <td><strong>{{formatDuration this.duration}}</strong></td>
            <td><span class="status-badge {{this.status}}">{{statusIcon this.status}} {{this.status}}</span></td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>

    <footer>
      <p>Generated by Playwright Custom Reporter | {{timestamp}}</p>
    </footer>
  </div>

  <script>
    // Chart.js configurations
    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '${theme === 'dark' ? '#f3f4f6' : '#111827'}',
            font: { size: 12 }
          }
        }
      }
    };

    // Status Distribution Chart
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx) {
      new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: ['Passed', 'Failed', 'Skipped'],
          datasets: [{
            data: [{{summary.passed}}, {{summary.failed}}, {{summary.skipped}}],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
            borderColor: '${theme === 'dark' ? '#111827' : '#ffffff'}',
            borderWidth: 2
          }]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            tooltip: {
              callbacks: {
                label: function(context) {
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = ((context.parsed / total) * 100).toFixed(1);
                  return context.label + ': ' + context.parsed + ' (' + percentage + '%)';
                }
              }
            }
          }
        }
      });
    }

    // Duration Distribution Chart
    const durationCtx = document.getElementById('durationChart');
    if (durationCtx) {
      new Chart(durationCtx, {
        type: 'bar',
        data: {
          labels: ['Fast (<1s)', 'Medium (1-5s)', 'Slow (5-15s)', 'Very Slow (>15s)'],
          datasets: [{
            label: 'Number of Tests',
            data: [
              {{stats.durationRanges.fast}},
              {{stats.durationRanges.medium}},
              {{stats.durationRanges.slow}},
              {{stats.durationRanges.verySlow}}
            ],
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
            borderRadius: 4
          }]
        },
        options: {
          ...chartDefaults,
          indexAxis: 'y',
          scales: {
            x: { ticks: { color: '${theme === 'dark' ? '#f3f4f6' : '#111827'}' } },
            y: { ticks: { color: '${theme === 'dark' ? '#f3f4f6' : '#111827'}' } }
          }
        }
      });
    }

    // Retries Distribution Chart
    const retriesCtx = document.getElementById('retriesChart');
    if (retriesCtx) {
      const retriesData = {{{charts.retriesData}}};
      new Chart(retriesCtx, {
        type: 'line',
        data: {
          labels: retriesData.map(d => 'Retries: ' + d.retries),
          datasets: [{
            label: 'Test Count',
            data: retriesData.map(d => d.count),
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: '#667eea'
          }]
        },
        options: {
          ...chartDefaults,
          scales: {
            x: { ticks: { color: '${theme === 'dark' ? '#f3f4f6' : '#111827'}' } },
            y: { ticks: { color: '${theme === 'dark' ? '#f3f4f6' : '#111827'}' } }
          }
        }
      });
    }
  </script>
</body>
</html>
  `;
}
