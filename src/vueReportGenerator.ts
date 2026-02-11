/**
 * Vue.js Report Generator – World-class Playwright test reports
 * Single-file HTML with Vue 3 + ApexCharts, Tailwind CSS
 */
import fs from 'fs-extra';
import * as path from 'path';
import { ReportData, TestResult } from './parser.js';
import { Statistics, calculateStatistics, formatDuration } from './statistics.js';

export type VueReportTheme = 'dark' | 'light' | 'professional' | 'neon' | 'ocean';

export interface VueReportOptions {
  title?: string;
  theme?: VueReportTheme;
  metadata?: {
    branch?: string;
    commit?: string;
    buildUrl?: string;
    environment?: string;
    pullRequest?: string;
  };
  history?: Array<{
    generatedAt: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    timedOut: number;
    durationMs: number;
    passRate: number;
  }>;
  outputPath: string;
}

interface VueReportPayload {
  title: string;
  theme: string;
  generatedAt: string;
  metadata: {
    branch?: string;
    commit?: string;
    buildUrl?: string;
    environment?: string;
    pullRequest?: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    duration: string;
    passRate: number;
    failRate: number;
    skipRate: number;
    timedOut: number;
  };
  insights: {
    qualityScore: number;
    stabilityScore: number;
    speedScore: number;
    retryHealth: number;
    retryRate: number;
    retryBurden: number;
    p50: string;
    p90: string;
    p95: string;
    effectivePassRate: number;
    riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  };
  charts: {
    status: { labels: string[]; series: number[]; colors: string[] };
    duration: { labels: string[]; series: number[]; colors: string[] };
    retries: { labels: string[]; series: number[] };
    tiers: { labels: string[]; series: number[]; colors: string[] };
    quality: { labels: string[]; series: number[] };
    fileRisk: { labels: string[]; series: number[]; colors: string[] };
    durationTop: { labels: string[]; series: number[] };
    browserMatrix: { labels: string[]; series: number[]; colors: string[] };
    suiteShare: { labels: string[]; series: number[]; colors: string[] };
    runTrends: {
      labels: string[];
      passRate: number[];
      failRate: number[];
      flakyRate: number[];
      durationSec: number[];
    };
  };
  failedTests: (TestResult & { durationDisplay: string; location?: string })[];
  flakyTests: (TestResult & { durationDisplay: string })[];
  slowestTests: (TestResult & { durationDisplay: string; percentage: number })[];
  allTests: (TestResult & { durationDisplay: string })[];
  fileInsights: Array<{
    file: string;
    total: number;
    failed: number;
    flaky: number;
    avgDuration: number;
    avgDurationDisplay: string;
    failRate: number;
    riskScore: number;
  }>;
  browserStats: Array<{
    browser: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    flaky: number;
    passRate: number;
    duration: number;
    durationDisplay: string;
  }>;
  suiteStats: Array<{
    suite: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    flaky: number;
    passRate: number;
    duration: number;
    durationDisplay: string;
  }>;
  history: Array<{
    generatedAt: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    timedOut: number;
    durationMs: number;
    passRate: number;
    durationDisplay: string;
    flakyRate: number;
  }>;
  comparison: {
    hasBaseline: boolean;
    latestLabel?: string;
    previousLabel?: string;
    passRateDelta: number;
    failedDelta: number;
    flakyRateDelta: number;
    durationDeltaSec: number;
  };
  hasFailures: boolean;
}

const THEME_PALETTES: Record<VueReportTheme, { bg: string; card: string; text: string; muted: string; border: string; accent: string }> = {
  dark:       { bg: '#0f172a', card: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', border: '#334155', accent: '#3b82f6' },
  light:      { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', muted: '#64748b', border: '#e2e8f0', accent: '#2563eb' },
  professional: { bg: '#f1f5f9', card: '#ffffff', text: '#0f172a', muted: '#475569', border: '#cbd5e1', accent: '#0ea5e9' },
  neon:        { bg: '#0a0e27', card: '#1a1f3a', text: '#e0e7ff', muted: '#00d4ff', border: '#00ff88', accent: '#00ff88' },
  ocean:       { bg: '#0c4a6e', card: '#0e7490', text: '#e0f2fe', muted: '#7dd3fc', border: '#06b6d4', accent: '#22d3ee' }
};

function enhanceStats(stats: Statistics, data: ReportData) {
  const t = data.totalTests;
  const performanceScore = Math.round(Math.max(0, Math.min(100,
    stats.passRate * 0.6 + (100 - (data.flaky / Math.max(1, t) * 100)) * 0.3
  )));
  const reliabilityScore = Math.round(Math.max(0, Math.min(100,
    stats.passRate * 0.7 + (100 - (data.flaky / Math.max(1, t) * 100)) * 0.3
  )));
  return { ...stats, performanceScore, reliabilityScore };
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function shortLabel(s: string, max = 26): string {
  if (!s) return 'Unknown';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export async function generateVueReport(data: ReportData, options: VueReportOptions): Promise<string> {
  const title = options.title || 'Playwright Test Report';
  const theme = (options.theme || 'dark') as VueReportTheme;

  const safeData: ReportData = {
    totalTests: data?.totalTests ?? 0,
    passed: data?.passed ?? 0,
    failed: data?.failed ?? 0,
    skipped: data?.skipped ?? 0,
    flaky: data?.flaky ?? 0,
    totalDuration: data?.totalDuration ?? 0,
    tests: data?.tests ?? [],
    suites: data?.suites ?? [],
    browsers: data?.browsers ?? [],
    browserStats: data?.browserStats ?? [],
    suiteStats: data?.suiteStats ?? []
  };
  data = safeData;

  const stats = calculateStatistics(data);
  const enhanced = enhanceStats(stats, data);
  const statusBuckets = new Map<string, number>();
  for (const t of data.tests) {
    const key = t.status || 'unknown';
    statusBuckets.set(key, (statusBuckets.get(key) || 0) + 1);
  }
  const statusOrder = ['passed', 'failed', 'skipped', 'flaky', 'timedOut'];
  const statusLabels: string[] = [];
  const statusSeries: number[] = [];
  const statusColors: string[] = [];
  const statusMeta: Record<string, { label: string; color: string }> = {
    passed: { label: 'Passed', color: '#10b981' },
    failed: { label: 'Failed', color: '#ef4444' },
    skipped: { label: 'Skipped', color: '#f59e0b' },
    flaky: { label: 'Flaky', color: '#8b5cf6' },
    timedOut: { label: 'Timed Out', color: '#06b6d4' }
  };

  for (const key of statusOrder) {
    const count = key === 'flaky'
      ? data.flaky
      : (statusBuckets.get(key) || 0);
    statusLabels.push(statusMeta[key].label);
    statusSeries.push(count);
    statusColors.push(statusMeta[key].color);
  }

  for (const [key, count] of statusBuckets.entries()) {
    if (!statusMeta[key]) {
      statusLabels.push(key);
      statusSeries.push(count);
      statusColors.push('#9ca3af');
    }
  }

  const failedTests = data.tests
    .filter(t => t.status === 'failed')
    .map(t => {
      const locParts = [t.file, t.line != null ? String(t.line) : null, t.column != null ? String(t.column) : null].filter(Boolean);
      return {
        ...t,
        durationDisplay: formatDuration(t.duration),
        location: locParts.length ? locParts.join(':') : undefined
      };
    });
  const flakyTests = data.tests.filter(t => t.retries > 0 && t.status === 'passed')
    .map(t => ({ ...t, durationDisplay: formatDuration(t.duration) }));
  const maxD = enhanced.maxDuration || 1;
  const slowestTests = [...data.tests]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 20)
    .map(t => ({ ...t, durationDisplay: formatDuration(t.duration), percentage: Math.round((t.duration / maxD) * 100) }));
  const allTests = data.tests.map(t => ({ ...t, durationDisplay: formatDuration(t.duration) }));

  const retriesEntries = Object.entries(enhanced.retriesDistribution)
    .map(([k, v]) => ({ retries: parseInt(k, 10), count: v }))
    .sort((a, b) => a.retries - b.retries)
    .slice(0, 8);

  const sorted = [...data.tests].sort((a, b) => b.duration - a.duration);
  const q25 = sorted[Math.floor(sorted.length * 0.25)]?.duration ?? 0;
  const q50 = sorted[Math.floor(sorted.length * 0.5)]?.duration ?? 0;
  const q75 = sorted[Math.floor(sorted.length * 0.75)]?.duration ?? 0;
  const tiers = [
    { tier: 'Ultra Fast', count: data.tests.filter(t => t.duration <= q25).length, color: '#06b6d4' },
    { tier: 'Fast', count: data.tests.filter(t => t.duration > q25 && t.duration <= q50).length, color: '#10b981' },
    { tier: 'Normal', count: data.tests.filter(t => t.duration > q50 && t.duration <= q75).length, color: '#f59e0b' },
    { tier: 'Slow', count: data.tests.filter(t => t.duration > q75).length, color: '#ef4444' }
  ];

  const durations = data.tests.map(t => t.duration);
  const p50 = percentile(durations, 50);
  const p90 = percentile(durations, 90);
  const p95 = percentile(durations, 95);
  const timedOut = statusBuckets.get('timedOut') || 0;
  const totalRetries = data.tests.reduce((acc, t) => acc + Math.max(0, t.retries || 0), 0);
  const retriedTests = data.tests.filter(t => (t.retries || 0) > 0).length;
  const retryRate = data.totalTests > 0 ? Math.round((retriedTests / data.totalTests) * 100) : 0;
  const retryHealth = clamp(100 - retryRate);
  const speedScore = clamp(100 - Math.round((p95 / 15000) * 100));
  const stabilityScore = clamp(Math.round(100 - (retryRate * 0.55 + enhanced.failRate * 0.75 + (timedOut / Math.max(1, data.totalTests)) * 100 * 0.4)));
  const effectivePassRate = data.totalTests > 0 ? Math.round(((Math.max(0, data.passed - data.flaky)) / data.totalTests) * 100) : 0;
  const qualityScore = clamp(Math.round(enhanced.passRate * 0.4 + stabilityScore * 0.3 + speedScore * 0.2 + retryHealth * 0.1));
  const riskLevel: VueReportPayload['insights']['riskLevel'] =
    qualityScore >= 85 ? 'Low' : qualityScore >= 70 ? 'Moderate' : qualityScore >= 50 ? 'High' : 'Critical';

  const fileMap = new Map<string, {
    file: string;
    total: number;
    failed: number;
    flaky: number;
    duration: number;
    retries: number;
  }>();
  for (const t of data.tests) {
    const key = t.file || 'unknown-file';
    const entry = fileMap.get(key) || { file: key, total: 0, failed: 0, flaky: 0, duration: 0, retries: 0 };
    entry.total += 1;
    if (t.status === 'failed' || t.status === 'timedOut') entry.failed += 1;
    if ((t.retries || 0) > 0) entry.flaky += 1;
    entry.duration += Math.max(0, t.duration || 0);
    entry.retries += Math.max(0, t.retries || 0);
    fileMap.set(key, entry);
  }

  const fileInsights = [...fileMap.values()].map(entry => {
    const avgDuration = entry.total > 0 ? Math.round(entry.duration / entry.total) : 0;
    const failRate = entry.total > 0 ? Math.round((entry.failed / entry.total) * 100) : 0;
    const retryFileRate = entry.total > 0 ? Math.round((entry.flaky / entry.total) * 100) : 0;
    const durationPressure = Math.round((avgDuration / Math.max(1, p95)) * 100);
    const riskScore = clamp(Math.round(failRate * 0.55 + retryFileRate * 0.2 + durationPressure * 0.25));
    return {
      file: entry.file,
      total: entry.total,
      failed: entry.failed,
      flaky: entry.flaky,
      avgDuration,
      avgDurationDisplay: formatDuration(avgDuration),
      failRate,
      riskScore
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  const durationTop = [...data.tests]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 12);

  const derivedBrowserStatsMap = new Map<string, {
    browser: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    flaky: number;
    passRate: number;
    duration: number;
  }>();
  for (const t of data.tests) {
    const browser = t.browser || 'unknown';
    const b = derivedBrowserStatsMap.get(browser) || {
      browser, total: 0, passed: 0, failed: 0, skipped: 0, timedOut: 0, flaky: 0, passRate: 0, duration: 0
    };
    b.total += 1;
    b.duration += t.duration;
    if (t.status === 'passed') b.passed += 1;
    if (t.status === 'failed') b.failed += 1;
    if (t.status === 'skipped') b.skipped += 1;
    if (t.status === 'timedOut') b.timedOut += 1;
    if (t.retries > 0 && t.status === 'passed') b.flaky += 1;
    derivedBrowserStatsMap.set(browser, b);
  }

  const browserStatsRaw = (data.browserStats && data.browserStats.length > 0)
    ? data.browserStats
    : [...derivedBrowserStatsMap.values()].map(b => ({
        ...b,
        passRate: b.total > 0 ? Math.round((b.passed / b.total) * 100) : 0
      }));

  const browserStats = browserStatsRaw
    .map(b => ({ ...b, durationDisplay: formatDuration(b.duration) }))
    .sort((a, b) => b.total - a.total);

  const derivedSuiteStatsMap = new Map<string, {
    suite: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    flaky: number;
    passRate: number;
    duration: number;
  }>();
  for (const t of data.tests) {
    const suite = t.suite || t.file || 'Unknown Suite';
    const s = derivedSuiteStatsMap.get(suite) || {
      suite, total: 0, passed: 0, failed: 0, skipped: 0, timedOut: 0, flaky: 0, passRate: 0, duration: 0
    };
    s.total += 1;
    s.duration += t.duration;
    if (t.status === 'passed') s.passed += 1;
    if (t.status === 'failed') s.failed += 1;
    if (t.status === 'skipped') s.skipped += 1;
    if (t.status === 'timedOut') s.timedOut += 1;
    if (t.retries > 0 && t.status === 'passed') s.flaky += 1;
    derivedSuiteStatsMap.set(suite, s);
  }

  const suiteStatsRaw = (data.suiteStats && data.suiteStats.length > 0)
    ? data.suiteStats
    : [...derivedSuiteStatsMap.values()].map(s => ({
        ...s,
        passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0
      }));

  const suiteStats = suiteStatsRaw
    .map(s => ({ ...s, durationDisplay: formatDuration(s.duration) }))
    .sort((a, b) => b.total - a.total);
  const history = (options.history || [])
    .map(h => ({
      ...h,
      durationDisplay: formatDuration(h.durationMs || 0),
      flakyRate: h.total > 0 ? Math.round((h.flaky / h.total) * 100) : 0
    }))
    .sort((a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime())
    .slice(-20);
  const runTrendLabels = history.map((h, i) => {
    const d = new Date(h.generatedAt);
    const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return history.length > 1 ? `#${i + 1} ${label}` : label;
  });
  const latestRun = history.length > 0 ? history[history.length - 1] : undefined;
  const previousRun = history.length > 1 ? history[history.length - 2] : undefined;
  const comparison = {
    hasBaseline: Boolean(latestRun && previousRun),
    latestLabel: latestRun?.generatedAt,
    previousLabel: previousRun?.generatedAt,
    passRateDelta: latestRun && previousRun ? latestRun.passRate - previousRun.passRate : 0,
    failedDelta: latestRun && previousRun ? latestRun.failed - previousRun.failed : 0,
    flakyRateDelta: latestRun && previousRun ? latestRun.flakyRate - previousRun.flakyRate : 0,
    durationDeltaSec: latestRun && previousRun ? Math.round((latestRun.durationMs - previousRun.durationMs) / 1000) : 0
  };

  const payload: VueReportPayload = {
    title,
    theme,
    generatedAt: new Date().toISOString(),
    metadata: {
      branch: options.metadata?.branch,
      commit: options.metadata?.commit,
      buildUrl: options.metadata?.buildUrl,
      environment: options.metadata?.environment,
      pullRequest: options.metadata?.pullRequest
    },
    summary: {
      total: data.totalTests,
      passed: data.passed,
      failed: data.failed,
      skipped: data.skipped,
      flaky: data.flaky,
      duration: formatDuration(data.totalDuration),
      passRate: enhanced.passRate,
      failRate: enhanced.failRate,
      skipRate: enhanced.skipRate,
      timedOut
    },
    insights: {
      qualityScore,
      stabilityScore,
      speedScore,
      retryHealth,
      retryRate,
      retryBurden: totalRetries,
      p50: formatDuration(p50),
      p90: formatDuration(p90),
      p95: formatDuration(p95),
      effectivePassRate,
      riskLevel
    },
    charts: {
      status: {
        labels: statusLabels,
        series: statusSeries,
        colors: statusColors
      },
      duration: {
        labels: ['Fast (<1s)', 'Medium (1-5s)', 'Slow (5-15s)', 'Very Slow (>15s)'],
        series: [enhanced.durationRanges.fast, enhanced.durationRanges.medium, enhanced.durationRanges.slow, enhanced.durationRanges.verySlow],
        colors: ['#06b6d4', '#3b82f6', '#f59e0b', '#ef4444']
      },
      retries: {
        labels: retriesEntries.map(e => `${e.retries} retries`),
        series: retriesEntries.map(e => e.count)
      },
      tiers: {
        labels: tiers.map(t => t.tier),
        series: tiers.map(t => t.count),
        colors: tiers.map(t => t.color)
      },
      quality: {
        labels: ['Pass Rate', 'Stability', 'Speed', 'Retry Health'],
        series: [enhanced.passRate, stabilityScore, speedScore, retryHealth]
      },
      fileRisk: {
        labels: fileInsights.slice(0, 8).map(f => shortLabel(f.file)),
        series: fileInsights.slice(0, 8).map(f => f.riskScore),
        colors: fileInsights.slice(0, 8).map(f => f.riskScore >= 75 ? '#ef4444' : f.riskScore >= 55 ? '#f59e0b' : '#10b981')
      },
      durationTop: {
        labels: durationTop.map(t => shortLabel(t.title, 34)),
        series: durationTop.map(t => Math.round(t.duration / 1000))
      },
      browserMatrix: {
        labels: browserStats.map(b => b.browser),
        series: browserStats.map(b => b.total),
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
          .slice(0, Math.max(1, browserStats.length))
      },
      suiteShare: {
        labels: suiteStats.slice(0, 8).map(s => shortLabel(s.suite, 22)),
        series: suiteStats.slice(0, 8).map(s => s.total),
        colors: ['#22c55e', '#0ea5e9', '#f97316', '#a855f7', '#eab308', '#ef4444', '#14b8a6', '#6366f1']
      },
      runTrends: {
        labels: runTrendLabels,
        passRate: history.map(h => h.passRate),
        failRate: history.map(h => h.total > 0 ? Math.round((h.failed / h.total) * 100) : 0),
        flakyRate: history.map(h => h.flakyRate),
        durationSec: history.map(h => Math.round((h.durationMs || 0) / 1000))
      }
    },
    failedTests,
    flakyTests,
    slowestTests,
    allTests,
    fileInsights: fileInsights.slice(0, 10),
    browserStats,
    suiteStats: suiteStats.slice(0, 20),
    history,
    comparison,
    hasFailures: data.failed > 0
  };

  const html = buildVueReportHtml(payload);
  await fs.ensureDir(path.dirname(options.outputPath));
  await fs.writeFile(options.outputPath, html, 'utf-8');
  return options.outputPath;
}

function buildVueReportHtml(payload: VueReportPayload): string {
  const themeKeys: VueReportTheme[] = ['dark', 'light', 'professional', 'neon', 'ocean'];
  const themeCss = themeKeys.map(t => {
    const p = THEME_PALETTES[t];
    return `html[data-report-theme="${t}"] { --report-bg: ${p.bg}; --report-card: ${p.card}; --report-text: ${p.text}; --report-muted: ${p.muted}; --report-border: ${p.border}; --report-accent: ${p.accent}; }`;
  }).join('\n    ');

  const reportJson = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(payload.title)} – Test Report</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      background:
        radial-gradient(1200px 500px at 10% -10%, color-mix(in srgb, var(--report-accent) 22%, transparent), transparent 70%),
        radial-gradient(900px 400px at 100% 0%, color-mix(in srgb, var(--report-accent) 14%, transparent), transparent 70%),
        var(--report-bg);
      color: var(--report-text);
      min-height: 100vh;
    }
    .report-root { background: var(--report-bg); color: var(--report-text); }
    .report-card {
      background: color-mix(in srgb, var(--report-card) 94%, transparent);
      border-color: color-mix(in srgb, var(--report-border) 86%, transparent);
      backdrop-filter: blur(4px);
    }
    .report-muted { color: var(--report-muted); }
    .report-border { border-color: var(--report-border); }
    .tab-active { border-bottom: 2px solid var(--report-accent); color: var(--report-accent); }
    .code-block { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
    [v-cloak] { display: none; }
    .test-row { cursor: pointer; }
    .test-row:hover { opacity: 0.9; }
    .step-item { padding: 6px 10px; border-left: 3px solid var(--report-accent); margin-bottom: 4px; font-size: 13px; }
    .detail-panel { position: fixed; top: 0; right: 0; width: 100%; max-width: 480px; height: 100%; z-index: 50; overflow-y: auto; box-shadow: -4px 0 20px rgba(0,0,0,0.2); }
    .hero-panel {
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--report-accent) 20%, transparent), transparent 45%),
        color-mix(in srgb, var(--report-card) 95%, transparent);
      border: 1px solid color-mix(in srgb, var(--report-accent) 24%, var(--report-border));
    }
    .metric-pill {
      border: 1px solid color-mix(in srgb, var(--report-accent) 35%, var(--report-border));
      background: color-mix(in srgb, var(--report-accent) 12%, transparent);
    }
    .score-orb {
      width: 104px;
      height: 104px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 28px;
      border: 2px solid color-mix(in srgb, var(--report-accent) 45%, var(--report-border));
      background:
        radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--report-accent) 28%, transparent), transparent 55%),
        color-mix(in srgb, var(--report-card) 93%, transparent);
      box-shadow: 0 0 26px color-mix(in srgb, var(--report-accent) 26%, transparent);
    }
    .fade-up { animation: fadeUp .5s ease both; }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    ${themeCss}
  </style>
</head>
<body class="min-h-screen antialiased">
  <div id="app" class="report-root" v-cloak>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header -->
    <header class="mb-8 flex flex-wrap items-start justify-between gap-4 fade-up">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">${escapeHtml(payload.title)}</h1>
        <p class="text-sm mt-1 report-muted">Generated {{ new Date(payload.generatedAt).toLocaleString() }}</p>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span v-if="payload.metadata.environment" class="metric-pill px-2 py-1 rounded-full">Env: {{ payload.metadata.environment }}</span>
          <span v-if="payload.metadata.branch" class="metric-pill px-2 py-1 rounded-full">Branch: {{ payload.metadata.branch }}</span>
          <span v-if="payload.metadata.commit" class="metric-pill px-2 py-1 rounded-full">Commit: {{ payload.metadata.commit.slice(0, 8) }}</span>
          <span v-if="payload.metadata.pullRequest" class="metric-pill px-2 py-1 rounded-full">PR: {{ payload.metadata.pullRequest }}</span>
          <a v-if="payload.metadata.buildUrl" :href="payload.metadata.buildUrl" target="_blank" rel="noopener noreferrer"
             class="metric-pill px-2 py-1 rounded-full underline decoration-dotted">Build Link</a>
        </div>
        <div class="mt-3 flex items-center gap-3 flex-wrap">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
            :class="payload.summary.failed > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'">
            {{ payload.summary.failed > 0 ? '❌ Failures' : '✅ All passed' }}
          </span>
          <span class="text-sm report-muted">{{ payload.summary.total }} tests · {{ payload.summary.duration }}</span>
        </div>
      </div>
      <div class="hero-panel rounded-2xl p-4 sm:p-5 w-full lg:w-auto min-w-[320px]">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-widest report-muted">Execution Health</p>
            <div class="mt-1 text-sm font-semibold">
              Risk: <span :class="payload.insights.riskLevel === 'Low' ? 'text-emerald-400' : payload.insights.riskLevel === 'Moderate' ? 'text-amber-400' : 'text-red-400'">{{ payload.insights.riskLevel }}</span>
            </div>
            <div class="mt-2 flex items-center gap-2 flex-wrap">
              <span class="metric-pill px-2.5 py-1 rounded-full text-xs">{{ payload.insights.p95 }} P95</span>
              <span class="metric-pill px-2.5 py-1 rounded-full text-xs">{{ payload.insights.retryRate }}% retry rate</span>
            </div>
          </div>
          <div class="score-orb">{{ payload.insights.qualityScore }}</div>
        </div>
        <div class="mt-4 flex items-center justify-between gap-2">
          <span class="text-xs report-muted">Theme</span>
          <select v-model="selectedTheme" class="px-3 py-1.5 rounded-lg border text-xs bg-[var(--report-card)] report-border report-muted focus:ring-2 focus:ring-[var(--report-accent)]">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="professional">Professional</option>
            <option value="neon">Neon</option>
            <option value="ocean">Ocean</option>
          </select>
        </div>
      </div>
    </header>

    <!-- Summary cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mb-8 fade-up">
      <div class="rounded-xl p-4 border shadow-sm report-card">
        <div class="text-2xl font-bold text-emerald-500">{{ payload.summary.passed }}</div>
        <div class="text-sm report-muted">Passed</div>
        <div class="text-xs mt-1 report-muted">{{ payload.summary.passRate }}%</div>
      </div>
      <div class="rounded-xl p-4 border shadow-sm report-card">
        <div class="text-2xl font-bold text-red-500">{{ payload.summary.failed }}</div>
        <div class="text-sm report-muted">Failed</div>
        <div class="text-xs mt-1 report-muted">{{ payload.summary.failRate }}%</div>
      </div>
      <div class="rounded-xl p-4 border shadow-sm report-card">
        <div class="text-2xl font-bold text-amber-500">{{ payload.summary.skipped }}</div>
        <div class="text-sm report-muted">Skipped</div>
        <div class="text-xs mt-1 report-muted">{{ payload.summary.skipRate }}%</div>
      </div>
      <div class="rounded-xl p-4 border shadow-sm report-card">
        <div class="text-2xl font-bold text-violet-500">{{ payload.summary.flaky }}</div>
        <div class="text-sm report-muted">Flaky</div>
      </div>
      <div class="rounded-xl p-4 border shadow-sm report-card">
        <div class="text-2xl font-bold text-cyan-500">{{ payload.summary.timedOut }}</div>
        <div class="text-sm report-muted">Timed out</div>
      </div>
      <div class="rounded-xl p-4 border shadow-sm report-card">
        <div class="text-2xl font-bold">{{ payload.insights.effectivePassRate }}%</div>
        <div class="text-sm report-muted">Stable pass</div>
      </div>
      <div class="rounded-xl p-4 border shadow-sm col-span-2 report-card">
        <div class="text-2xl font-bold">{{ payload.summary.duration }}</div>
        <div class="text-sm report-muted">Total duration</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-6 border-b mb-6 report-border">
      <button @click="switchTab('overview')" :class="['pb-3 px-1 font-medium text-sm', tab === 'overview' ? 'tab-active' : '']" class="report-muted">Overview</button>
      <button @click="switchTab('failures')" :class="['pb-3 px-1 font-medium text-sm', tab === 'failures' ? 'tab-active' : '']" class="report-muted">
        Failures <span v-if="payload.failedTests.length" class="ml-1 bg-red-500/20 text-red-400 px-1.5 rounded">{{ payload.failedTests.length }}</span>
      </button>
      <button @click="switchTab('all')" :class="['pb-3 px-1 font-medium text-sm', tab === 'all' ? 'tab-active' : '']" class="report-muted">All tests</button>
      <button @click="switchTab('performance')" :class="['pb-3 px-1 font-medium text-sm', tab === 'performance' ? 'tab-active' : '']" class="report-muted">Performance</button>
    </div>

    <!-- Tab: Overview -->
    <div v-show="tab === 'overview'" class="space-y-8">
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="rounded-xl border p-4 report-card">
          <div class="text-xs uppercase tracking-wide report-muted">Quality Score</div>
          <div class="text-3xl font-bold mt-2">{{ payload.insights.qualityScore }}</div>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <div class="text-xs uppercase tracking-wide report-muted">Stability</div>
          <div class="text-3xl font-bold mt-2">{{ payload.insights.stabilityScore }}</div>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <div class="text-xs uppercase tracking-wide report-muted">Speed Score</div>
          <div class="text-3xl font-bold mt-2">{{ payload.insights.speedScore }}</div>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <div class="text-xs uppercase tracking-wide report-muted">Retry Burden</div>
          <div class="text-3xl font-bold mt-2">{{ payload.insights.retryBurden }}</div>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <div class="text-xs uppercase tracking-wide report-muted">Latency (P50/P90/P95)</div>
          <div class="text-sm font-semibold mt-2">{{ payload.insights.p50 }} / {{ payload.insights.p90 }} / {{ payload.insights.p95 }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Duration distribution</h3>
          <div id="chart-duration" class="h-64 min-h-[256px]"></div>
          <p v-if="!hasChartData(payload.charts.duration.series)" class="text-sm report-muted py-4">No data to display</p>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Retries</h3>
          <div id="chart-retries" class="h-64 min-h-[256px]"></div>
          <p v-if="payload.charts.retries.series.length === 0" class="text-sm report-muted py-4">No retries data</p>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Performance tiers split</h3>
          <div id="chart-tiers" class="h-64 min-h-[256px]"></div>
          <p v-if="!hasChartData(payload.charts.tiers.series)" class="text-sm report-muted py-4">No data to display</p>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Quality radar</h3>
          <div id="chart-quality" class="h-64 min-h-[256px]"></div>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">File risk index</h3>
          <div id="chart-file-risk" class="h-64 min-h-[256px]"></div>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Top duration hotspots (seconds)</h3>
          <div id="chart-duration-top" class="h-64 min-h-[256px]"></div>
        </div>
      </div>
      <div class="rounded-xl border p-4 report-card">
        <h3 class="font-semibold mb-4">File-level reliability insights</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="report-border">
                <th class="text-left py-2 pr-3">File</th>
                <th class="text-left py-2 px-3">Total</th>
                <th class="text-left py-2 px-3">Failed</th>
                <th class="text-left py-2 px-3">Flaky</th>
                <th class="text-left py-2 px-3">Avg duration</th>
                <th class="text-left py-2 px-3">Fail rate</th>
                <th class="text-left py-2 pl-3">Risk</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, idx) in payload.fileInsights" :key="idx" class="border-t report-border">
                <td class="py-2 pr-3 font-mono text-xs">{{ f.file }}</td>
                <td class="py-2 px-3">{{ f.total }}</td>
                <td class="py-2 px-3">{{ f.failed }}</td>
                <td class="py-2 px-3">{{ f.flaky }}</td>
                <td class="py-2 px-3">{{ f.avgDurationDisplay }}</td>
                <td class="py-2 px-3">{{ f.failRate }}%</td>
                <td class="py-2 pl-3">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="f.riskScore >= 75 ? 'bg-red-500/20 text-red-400' : f.riskScore >= 55 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'">
                    {{ f.riskScore }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Browser execution share</h3>
          <div id="chart-browser-matrix" class="h-64 min-h-[256px]"></div>
          <p v-if="payload.browserStats.length === 0" class="text-sm report-muted py-4">No browser data detected</p>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Browser-wise statistics</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="report-border">
                  <th class="text-left py-2 pr-3">Browser</th>
                  <th class="text-left py-2 px-3">Total</th>
                  <th class="text-left py-2 px-3">Passed</th>
                  <th class="text-left py-2 px-3">Failed</th>
                  <th class="text-left py-2 px-3">Timed out</th>
                  <th class="text-left py-2 px-3">Pass rate</th>
                  <th class="text-left py-2 pl-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(b, idx) in payload.browserStats" :key="idx" class="border-t report-border">
                  <td class="py-2 pr-3 font-semibold capitalize">{{ b.browser }}</td>
                  <td class="py-2 px-3">{{ b.total }}</td>
                  <td class="py-2 px-3">{{ b.passed }}</td>
                  <td class="py-2 px-3">{{ b.failed }}</td>
                  <td class="py-2 px-3">{{ b.timedOut }}</td>
                  <td class="py-2 px-3">{{ b.passRate }}%</td>
                  <td class="py-2 pl-3">{{ b.durationDisplay }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Suite contribution share</h3>
          <div id="chart-suite-share" class="h-64 min-h-[256px]"></div>
          <p v-if="payload.suiteStats.length === 0" class="text-sm report-muted py-4">No suite data detected</p>
        </div>
        <div class="rounded-xl border p-4 report-card">
          <h3 class="font-semibold mb-4">Suite-wise statistics</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="report-border">
                  <th class="text-left py-2 pr-3">Suite</th>
                  <th class="text-left py-2 px-3">Total</th>
                  <th class="text-left py-2 px-3">Passed</th>
                  <th class="text-left py-2 px-3">Failed</th>
                  <th class="text-left py-2 px-3">Skipped</th>
                  <th class="text-left py-2 px-3">Timed out</th>
                  <th class="text-left py-2 px-3">Flaky</th>
                  <th class="text-left py-2 px-3">Pass rate</th>
                  <th class="text-left py-2 pl-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(s, idx) in payload.suiteStats" :key="idx" class="border-t report-border">
                  <td class="py-2 pr-3 font-mono text-xs">{{ s.suite }}</td>
                  <td class="py-2 px-3">{{ s.total }}</td>
                  <td class="py-2 px-3">{{ s.passed }}</td>
                  <td class="py-2 px-3">{{ s.failed }}</td>
                  <td class="py-2 px-3">{{ s.skipped }}</td>
                  <td class="py-2 px-3">{{ s.timedOut }}</td>
                  <td class="py-2 px-3">{{ s.flaky }}</td>
                  <td class="py-2 px-3">{{ s.passRate }}%</td>
                  <td class="py-2 pl-3">{{ s.durationDisplay }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="rounded-xl border p-4 report-card">
        <div class="flex items-center justify-between gap-2 mb-4">
          <h3 class="font-semibold">Run history trends</h3>
          <span class="text-xs report-muted">{{ payload.history.length }} runs tracked</span>
        </div>
        <div v-if="payload.comparison.hasBaseline" class="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="metric-pill rounded-lg px-3 py-2 text-xs">
            <div class="report-muted">Pass % vs prev</div>
            <div class="font-semibold" :class="payload.comparison.passRateDelta >= 0 ? 'text-emerald-400' : 'text-red-400'">
              {{ payload.comparison.passRateDelta > 0 ? '+' : '' }}{{ payload.comparison.passRateDelta }}%
            </div>
          </div>
          <div class="metric-pill rounded-lg px-3 py-2 text-xs">
            <div class="report-muted">Failed vs prev</div>
            <div class="font-semibold" :class="payload.comparison.failedDelta <= 0 ? 'text-emerald-400' : 'text-red-400'">
              {{ payload.comparison.failedDelta > 0 ? '+' : '' }}{{ payload.comparison.failedDelta }}
            </div>
          </div>
          <div class="metric-pill rounded-lg px-3 py-2 text-xs">
            <div class="report-muted">Flaky % vs prev</div>
            <div class="font-semibold" :class="payload.comparison.flakyRateDelta <= 0 ? 'text-emerald-400' : 'text-amber-400'">
              {{ payload.comparison.flakyRateDelta > 0 ? '+' : '' }}{{ payload.comparison.flakyRateDelta }}%
            </div>
          </div>
          <div class="metric-pill rounded-lg px-3 py-2 text-xs">
            <div class="report-muted">Duration vs prev</div>
            <div class="font-semibold" :class="payload.comparison.durationDeltaSec <= 0 ? 'text-emerald-400' : 'text-amber-400'">
              {{ payload.comparison.durationDeltaSec > 0 ? '+' : '' }}{{ payload.comparison.durationDeltaSec }}s
            </div>
          </div>
        </div>
        <div id="chart-run-trends" class="h-72 min-h-[288px]"></div>
        <p v-if="payload.history.length < 2" class="text-sm report-muted py-3">Need at least 2 runs to show trends</p>
        <div v-if="payload.history.length" class="mt-4 overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="report-border">
                <th class="text-left py-2 pr-3">Run</th>
                <th class="text-left py-2 px-3">Pass %</th>
                <th class="text-left py-2 px-3">Failed</th>
                <th class="text-left py-2 px-3">Flaky %</th>
                <th class="text-left py-2 px-3">Duration</th>
                <th class="text-left py-2 pl-3">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(h, idx) in payload.history.slice().reverse().slice(0, 10)" :key="'hr-'+idx" class="border-t report-border">
                <td class="py-2 pr-3">#{{ payload.history.length - idx }}</td>
                <td class="py-2 px-3">{{ h.passRate }}%</td>
                <td class="py-2 px-3">{{ h.failed }}</td>
                <td class="py-2 px-3">{{ h.flakyRate }}%</td>
                <td class="py-2 px-3">{{ h.durationDisplay }}</td>
                <td class="py-2 pl-3 report-muted">{{ new Date(h.generatedAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab: Failures -->
    <div v-show="tab === 'failures'" class="space-y-6">
      <p v-if="!payload.failedTests.length" class="text-sm report-muted">No failed tests.</p>
      <div v-else class="space-y-4">
        <div v-for="(test, idx) in payload.failedTests" :key="idx"
             class="rounded-xl border overflow-hidden report-card cursor-pointer"
             @click="openTest(test)">
          <div class="p-4 border-b flex flex-wrap items-start justify-between gap-2 report-border">
            <div class="min-w-0 flex-1">
              <div class="font-semibold text-red-400">{{ test.title }}</div>
              <div v-if="test.location" class="text-xs mt-1 font-mono report-muted">{{ test.location }}</div>
              <div class="text-xs mt-1 report-muted">{{ test.durationDisplay }}</div>
            </div>
            <span class="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400">Failed</span>
          </div>
          <div class="p-4 bg-red-950/30">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-red-300">Error message</span>
              <button @click.stop="copyError(test.error, test.errorStack)" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-red-200">Copy</button>
            </div>
            <pre class="code-block p-3 rounded bg-black/30 text-red-200 overflow-x-auto">{{ test.error || 'No message' }}</pre>
          </div>
          <div v-if="test.errorStack" class="p-4 border-t report-border">
            <button @click.stop="toggleStack(idx)" class="text-sm font-medium text-blue-400 hover:underline">
              {{ expandedStack === idx ? 'Hide stack trace' : 'Show stack trace' }}
            </button>
            <pre v-show="expandedStack === idx" class="code-block mt-2 p-3 rounded bg-black/20 overflow-x-auto text-xs report-muted">{{ test.errorStack }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab: All tests – click row to see steps -->
    <div v-show="tab === 'all'" class="rounded-xl border overflow-hidden report-card">
      <div class="p-4 border-b flex flex-wrap items-center gap-2 report-border">
        <input id="test-search-input" v-model="searchQuery" type="text" placeholder="Search tests..." class="flex-1 min-w-[220px] px-3 py-2 rounded-lg border text-sm report-border bg-[var(--report-card)]">
        <select v-model="filterStatus" class="px-3 py-2 rounded-lg border text-sm bg-[var(--report-card)] report-border report-muted">
          <option value="">All status</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
          <option value="timedOut">Timed out</option>
        </select>
        <select v-model="filterBrowser" class="px-3 py-2 rounded-lg border text-sm bg-[var(--report-card)] report-border report-muted">
          <option value="">All browsers</option>
          <option v-for="(b, i) in browserOptions" :key="'b-'+i" :value="b">{{ b }}</option>
        </select>
        <select v-model="filterSuite" class="px-3 py-2 rounded-lg border text-sm bg-[var(--report-card)] report-border report-muted max-w-[220px]">
          <option value="">All suites</option>
          <option v-for="(s, i) in suiteOptions" :key="'s-'+i" :value="s">{{ s }}</option>
        </select>
        <span class="text-sm report-muted">{{ filteredAllTests.length }} tests</span>
      </div>
      <div class="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 z-10 report-card">
            <tr class="report-border">
              <th class="text-left py-3 px-4 font-medium report-border">Test</th>
              <th class="text-left py-3 px-4 font-medium report-border">Duration</th>
              <th class="text-left py-3 px-4 font-medium report-border">Status</th>
              <th class="text-left py-3 px-4 font-medium report-border">Browser</th>
              <th class="text-left py-3 px-4 font-medium report-border">Suite</th>
              <th class="text-left py-3 px-4 font-medium report-border">File</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in filteredAllTests" :key="i" class="border-b test-row report-border"
                @click="openTest(t)">
              <td class="py-3 px-4 font-medium">{{ t.title }}</td>
              <td class="py-3 px-4 report-muted">{{ t.durationDisplay }}</td>
              <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded text-xs font-medium"
                  :class="{ 'bg-emerald-500/20 text-emerald-400': t.status === 'passed', 'bg-red-500/20 text-red-400': t.status === 'failed', 'bg-amber-500/20 text-amber-400': t.status === 'skipped', 'bg-cyan-500/20 text-cyan-400': t.status === 'timedOut', 'bg-slate-500/20 text-slate-300': !['passed','failed','skipped','timedOut'].includes(t.status) }">
                  {{ t.status }}
                </span>
              </td>
              <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded text-xs font-medium bg-sky-500/20 text-sky-300 capitalize">{{ t.browser || 'unknown' }}</span>
              </td>
              <td class="py-3 px-4 font-mono text-xs report-muted">{{ t.suite || '—' }}</td>
              <td class="py-3 px-4 font-mono text-xs report-muted">{{ t.file || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tab: Performance -->
    <div v-show="tab === 'performance'" class="space-y-6">
      <div class="rounded-xl border overflow-hidden report-card">
        <h3 class="p-4 font-semibold border-b report-border">Slowest tests</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="report-border">
                <th class="text-left py-3 px-4 font-medium report-border">Test</th>
                <th class="text-left py-3 px-4 font-medium report-border">Duration</th>
                <th class="text-left py-3 px-4 font-medium report-border">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in payload.slowestTests" :key="i" class="border-b report-border test-row" @click="openTest(payload.allTests.find(a => a.title === t.title && a.duration === t.duration) || t)">
                <td class="py-3 px-4">{{ t.title }}</td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2">
                    <div class="w-24 h-2 rounded-full bg-gray-700 overflow-hidden">
                      <div class="h-full rounded-full bg-amber-500" :style="{ width: t.percentage + '%' }"></div>
                    </div>
                    <span>{{ t.durationDisplay }}</span>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="{ 'bg-emerald-500/20 text-emerald-400': t.status === 'passed', 'bg-red-500/20 text-red-400': t.status === 'failed', 'bg-amber-500/20 text-amber-400': t.status === 'skipped', 'bg-cyan-500/20 text-cyan-400': t.status === 'timedOut', 'bg-slate-500/20 text-slate-300': !['passed','failed','skipped','timedOut'].includes(t.status) }">{{ t.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="payload.flakyTests.length" class="rounded-xl border p-4 report-card">
        <h3 class="font-semibold mb-3">Flaky tests</h3>
        <ul class="space-y-2 text-sm">
          <li v-for="(t, i) in payload.flakyTests" :key="i" class="flex justify-between items-center test-row py-1" @click="openTest(payload.allTests.find(a => a.title === t.title) || t)">
            <span>{{ t.title }}</span>
            <span class="text-violet-400">{{ t.retries }} retries · {{ t.durationDisplay }}</span>
          </li>
        </ul>
      </div>
    </div>

    <footer class="mt-12 pt-6 border-t text-center text-sm report-border report-muted">
      Playwright Custom Reports · Vue.js dashboard
    </footer>
  </div>

  <!-- Test detail panel (steps like Playwright HTML report) -->
  <div v-if="selectedTest" class="detail-panel report-card report-border" role="dialog" aria-label="Test details">
    <div class="p-4 border-b flex items-center justify-between report-border sticky top-0 report-card z-10">
      <h3 class="font-semibold truncate pr-2">Test details</h3>
      <button @click="closeTest" class="p-2 rounded hover:bg-black/10 text-xl leading-none report-muted" aria-label="Close">×</button>
    </div>
    <div class="p-4 space-y-4">
      <div>
        <div class="font-medium">{{ selectedTest.title }}</div>
        <div class="text-sm report-muted mt-1">{{ selectedTest.durationDisplay }} · {{ selectedTest.status }}</div>
        <div class="text-xs report-muted mt-1">
          <span class="capitalize">{{ selectedTest.browser || 'unknown' }}</span>
          <span> · </span>
          <span>{{ selectedTest.suite || 'Unknown suite' }}</span>
        </div>
        <div v-if="selectedTest.file || selectedTest.location" class="text-xs font-mono report-muted mt-1">{{ selectedTest.location || selectedTest.file }}</div>
      </div>
      <div v-if="selectedTest.error" class="rounded-lg p-3 bg-red-950/30 border border-red-500/30">
        <div class="text-sm font-medium text-red-400 mb-1">Error</div>
        <pre class="code-block text-red-200 text-xs">{{ selectedTest.error }}</pre>
      </div>
      <div>
        <div class="font-medium mb-2">Steps performed</div>
        <p v-if="!selectedTest.steps || selectedTest.steps.length === 0" class="text-sm report-muted">No step data (run with JSON reporter that includes stdout for step logs).</p>
        <div v-else class="space-y-0">
          <div v-for="(step, si) in selectedTest.steps" :key="si" class="step-item report-border bg-black/10 rounded-r">
            {{ step }}
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>

  <script>
    window.__REPORT_PAYLOAD__ = ${reportJson};
    (function(){ var p = window.__REPORT_PAYLOAD__; if (p && p.theme) document.documentElement.setAttribute('data-report-theme', p.theme); })();
  </script>
  <script>
    const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;

    createApp({
      setup() {
        const payload = window.__REPORT_PAYLOAD__;
        const params = new URLSearchParams(window.location.search);
        const tab = ref(params.get('tab') || 'overview');
        const selectedTheme = ref(params.get('theme') || payload.theme || 'dark');
        const expandedStack = ref(null);
        const searchQuery = ref(params.get('q') || '');
        const filterStatus = ref(params.get('status') || '');
        const filterBrowser = ref(params.get('browser') || '');
        const filterSuite = ref(params.get('suite') || '');
        const selectedTest = ref(null);
        const chartInstances = [];
        const browserOptions = computed(() => {
          const set = new Set(payload.allTests.map(t => t.browser).filter(Boolean));
          return Array.from(set).sort();
        });
        const suiteOptions = computed(() => {
          const set = new Set(payload.allTests.map(t => t.suite).filter(Boolean));
          return Array.from(set).sort();
        });

        const filteredAllTests = computed(() => {
          const q = searchQuery.value.trim().toLowerCase();
          return payload.allTests.filter(t => {
            const matchesQuery = !q || (
              (t.title || '').toLowerCase().includes(q) ||
              (t.file || '').toLowerCase().includes(q) ||
              (t.browser || '').toLowerCase().includes(q) ||
              (t.suite || '').toLowerCase().includes(q)
            );
            const matchesStatus = !filterStatus.value || t.status === filterStatus.value;
            const matchesBrowser = !filterBrowser.value || t.browser === filterBrowser.value;
            const matchesSuite = !filterSuite.value || t.suite === filterSuite.value;
            return matchesQuery && matchesStatus && matchesBrowser && matchesSuite;
          });
        });

        function hasChartData(series) {
          return Array.isArray(series) && series.some(function(n) { return n > 0; });
        }

        function syncUrlState() {
          const p = new URLSearchParams(window.location.search);
          const setOrDelete = function(key, value) {
            if (value == null || value === '') p.delete(key);
            else p.set(key, String(value));
          };
          setOrDelete('tab', tab.value);
          setOrDelete('theme', selectedTheme.value);
          setOrDelete('q', searchQuery.value.trim());
          setOrDelete('status', filterStatus.value);
          setOrDelete('browser', filterBrowser.value);
          setOrDelete('suite', filterSuite.value);
          const qs = p.toString();
          const next = qs ? ('?' + qs) : window.location.pathname;
          window.history.replaceState(null, '', next);
        }

        function switchTab(t) {
          tab.value = t;
          if (t === 'overview') {
            nextTick(function() {
              setTimeout(renderCharts, 80);
            });
          }
        }

        function renderCharts() {
          chartInstances.forEach(function(c) { try { c.destroy(); } catch (e) {} });
          chartInstances.length = 0;
          var textColor = getComputedStyle(document.body).getPropertyValue('--report-muted').trim() || '#94a3b8';
          var axisColor = getComputedStyle(document.body).getPropertyValue('--report-border').trim() || '#334155';
          var opts = { chart: { fontFamily: 'Plus Jakarta Sans' }, legend: { labels: { colors: textColor } }, noData: { text: 'No data', style: { color: textColor } }, grid: { borderColor: axisColor } };
          var el = function(id) { return document.querySelector(id); };
          if (el('#chart-duration')) {
            var c1 = new ApexCharts(el('#chart-duration'), {
              series: [{ name: 'Tests', data: payload.charts.duration.series }],
              chart: { type: 'bar', height: 256, toolbar: { show: false } },
              plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
              colors: payload.charts.duration.colors,
              xaxis: { categories: payload.charts.duration.labels },
              ...opts
            });
            c1.render();
            chartInstances.push(c1);
          }
          if (el('#chart-retries') && payload.charts.retries.series.length) {
            var c2 = new ApexCharts(el('#chart-retries'), {
              series: [{ name: 'Tests', data: payload.charts.retries.series }],
              chart: { type: 'bar', height: 256, toolbar: { show: false } },
              plotOptions: { bar: { borderRadius: 4 } },
              xaxis: { categories: payload.charts.retries.labels },
              colors: ['#60a5fa'],
              ...opts
            });
            c2.render();
            chartInstances.push(c2);
          }
          if (el('#chart-tiers')) {
            try {
              var c3 = new ApexCharts(el('#chart-tiers'), {
                series: payload.charts.tiers.series,
                chart: { type: 'donut', height: 256 },
                colors: payload.charts.tiers.colors,
                labels: payload.charts.tiers.labels,
                legend: { position: 'bottom', labels: { colors: textColor } },
                noData: { text: 'No data', style: { color: textColor } },
                dataLabels: { enabled: true },
                stroke: { width: 1 },
                tooltip: { y: { formatter: function(v) { return v + ' tests'; } } }
              });
              c3.render();
              chartInstances.push(c3);
            } catch (e) {
              var c3b = new ApexCharts(el('#chart-tiers'), {
                series: [{ name: 'Tests', data: payload.charts.tiers.series }],
                chart: { type: 'bar', height: 256, toolbar: { show: false } },
                plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
                colors: payload.charts.tiers.colors,
                xaxis: { categories: payload.charts.tiers.labels },
                ...opts
              });
              c3b.render();
              chartInstances.push(c3b);
            }
          }
          if (el('#chart-quality')) {
            var c4 = new ApexCharts(el('#chart-quality'), {
              series: [{ name: 'Score', data: payload.charts.quality.series }],
              chart: { type: 'radar', height: 256, toolbar: { show: false } },
              xaxis: { categories: payload.charts.quality.labels, labels: { style: { colors: payload.charts.quality.labels.map(function() { return textColor; }) } } },
              yaxis: { min: 0, max: 100, tickAmount: 4, labels: { style: { colors: [textColor] } } },
              fill: { opacity: 0.24 },
              stroke: { width: 2 },
              markers: { size: 4 },
              colors: ['#22c55e'],
              ...opts
            });
            c4.render();
            chartInstances.push(c4);
          }
          if (el('#chart-file-risk')) {
            var c5 = new ApexCharts(el('#chart-file-risk'), {
              series: [{ name: 'Risk Score', data: payload.charts.fileRisk.series }],
              chart: { type: 'bar', height: 256, toolbar: { show: false } },
              plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
              colors: payload.charts.fileRisk.colors,
              xaxis: { categories: payload.charts.fileRisk.labels, max: 100 },
              ...opts
            });
            c5.render();
            chartInstances.push(c5);
          }
          if (el('#chart-duration-top')) {
            var c6 = new ApexCharts(el('#chart-duration-top'), {
              series: [{ name: 'Seconds', data: payload.charts.durationTop.series }],
              chart: { type: 'area', height: 256, toolbar: { show: false } },
              dataLabels: { enabled: false },
              stroke: { curve: 'smooth', width: 3 },
              fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.55, opacityTo: 0.1 } },
              markers: { size: 3 },
              xaxis: { categories: payload.charts.durationTop.labels, labels: { show: false } },
              yaxis: { labels: { style: { colors: [textColor] } } },
              tooltip: { x: { show: true } },
              colors: ['#f97316'],
              ...opts
            });
            c6.render();
            chartInstances.push(c6);
          }
          if (el('#chart-browser-matrix') && payload.charts.browserMatrix.labels.length > 0) {
            try {
              var c7 = new ApexCharts(el('#chart-browser-matrix'), {
                series: payload.charts.browserMatrix.series,
                chart: { type: 'donut', height: 256 },
                labels: payload.charts.browserMatrix.labels,
                colors: payload.charts.browserMatrix.colors,
                legend: { position: 'bottom', labels: { colors: textColor } },
                noData: { text: 'No data', style: { color: textColor } },
                dataLabels: { enabled: true },
                stroke: { width: 1 },
                tooltip: { y: { formatter: function(v) { return v + ' tests'; } } }
              });
              c7.render();
              chartInstances.push(c7);
            } catch (e) {
              var c7b = new ApexCharts(el('#chart-browser-matrix'), {
                series: [{ name: 'Tests', data: payload.charts.browserMatrix.series }],
                chart: { type: 'bar', height: 256, toolbar: { show: false } },
                plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
                colors: payload.charts.browserMatrix.colors,
                xaxis: { categories: payload.charts.browserMatrix.labels },
                ...opts
              });
              c7b.render();
              chartInstances.push(c7b);
            }
          }
          if (el('#chart-suite-share') && payload.charts.suiteShare.labels.length > 0) {
            try {
              var c9 = new ApexCharts(el('#chart-suite-share'), {
                series: payload.charts.suiteShare.series,
                chart: { type: 'donut', height: 256 },
                labels: payload.charts.suiteShare.labels,
                colors: payload.charts.suiteShare.colors,
                legend: { position: 'bottom', labels: { colors: textColor } },
                noData: { text: 'No data', style: { color: textColor } },
                dataLabels: { enabled: true },
                stroke: { width: 1 },
                tooltip: { y: { formatter: function(v) { return v + ' tests'; } } }
              });
              c9.render();
              chartInstances.push(c9);
            } catch (e) {
              var c9b = new ApexCharts(el('#chart-suite-share'), {
                series: [{ name: 'Tests', data: payload.charts.suiteShare.series }],
                chart: { type: 'bar', height: 256, toolbar: { show: false } },
                plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
                colors: payload.charts.suiteShare.colors,
                xaxis: { categories: payload.charts.suiteShare.labels },
                ...opts
              });
              c9b.render();
              chartInstances.push(c9b);
            }
          }
          if (el('#chart-run-trends') && payload.charts.runTrends.labels.length > 1) {
            var c8 = new ApexCharts(el('#chart-run-trends'), {
              series: [
                { name: 'Pass %', data: payload.charts.runTrends.passRate },
                { name: 'Fail %', data: payload.charts.runTrends.failRate },
                { name: 'Flaky %', data: payload.charts.runTrends.flakyRate },
                { name: 'Duration (s)', data: payload.charts.runTrends.durationSec }
              ],
              chart: { type: 'line', height: 288, toolbar: { show: false } },
              stroke: { width: [3, 2, 2, 2], curve: 'smooth' },
              markers: { size: 3 },
              dataLabels: { enabled: false },
              colors: ['#22c55e', '#ef4444', '#8b5cf6', '#06b6d4'],
              xaxis: { categories: payload.charts.runTrends.labels, labels: { show: false } },
              yaxis: [
                { max: 100, title: { text: '%' }, labels: { style: { colors: [textColor] } } },
                { opposite: true, title: { text: 'Seconds' }, labels: { style: { colors: [textColor] } } }
              ],
              legend: { position: 'top' },
              tooltip: { shared: true },
              ...opts
            });
            c8.render();
            chartInstances.push(c8);
          }
        }

        function openTest(t) {
          if (!t) return;
          selectedTest.value = t;
        }

        function closeTest() {
          selectedTest.value = null;
        }

        function toggleStack(idx) {
          expandedStack.value = expandedStack.value === idx ? null : idx;
        }

        function copyError(msg, stack) {
          var text = [msg || '', stack || ''].filter(Boolean).join('\\n\\n--- Stack ---\\n');
          navigator.clipboard.writeText(text).then(function() { alert('Copied to clipboard'); }).catch(function() {});
        }

        function applyTheme(theme) {
          document.documentElement.setAttribute('data-report-theme', theme);
        }

        function onKeydown(ev) {
          if ((ev.ctrlKey || ev.metaKey || ev.altKey) && ev.key.toLowerCase() !== 'k') return;
          if (ev.key === '/') {
            ev.preventDefault();
            const input = document.getElementById('test-search-input');
            if (input) input.focus();
          }
          if (ev.key.toLowerCase() === 't') {
            ev.preventDefault();
            const themes = ['dark', 'light', 'professional', 'neon', 'ocean'];
            var idx = themes.indexOf(selectedTheme.value);
            if (idx < 0) idx = 0;
            selectedTheme.value = themes[(idx + 1) % themes.length];
          }
          if (ev.key.toLowerCase() === 'o') tab.value = 'overview';
          if (ev.key.toLowerCase() === 'f') tab.value = 'failures';
          if (ev.key.toLowerCase() === 'a') tab.value = 'all';
          if (ev.key.toLowerCase() === 'p') tab.value = 'performance';
        }

        onMounted(function() {
          applyTheme(selectedTheme.value);
          nextTick(function() {
            setTimeout(renderCharts, 100);
          });
          window.addEventListener('keydown', onKeydown);
          syncUrlState();
        });

        watch(selectedTheme, function(v) {
          applyTheme(v);
          nextTick(function() {
            setTimeout(renderCharts, 60);
          });
          syncUrlState();
        });
        watch(tab, function() { syncUrlState(); });
        watch(searchQuery, function() { syncUrlState(); });
        watch(filterStatus, function() { syncUrlState(); });
        watch(filterBrowser, function() { syncUrlState(); });
        watch(filterSuite, function() { syncUrlState(); });

        return { payload, tab, selectedTheme, expandedStack, searchQuery, filterStatus, filterBrowser, filterSuite, browserOptions, suiteOptions, selectedTest, filteredAllTests, hasChartData, switchTab, openTest, closeTest, toggleStack, copyError };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
