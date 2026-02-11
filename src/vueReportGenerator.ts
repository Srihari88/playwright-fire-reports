/**
 * Vue.js Report Generator – World-class Playwright test reports
 * Single-file HTML with Vue 3 + ECharts, Tailwind CSS
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
    flakyRate: number;
    failRate: number;
    skipRate: number;
    timedOut: number;
    avgDuration: string;
    nonPassing: number;
  };
  highlights: {
    browsers: number;
    suites: number;
    retriedTests: number;
    historyPoints: number;
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
    releaseGate: 'READY' | 'RISKY' | 'BLOCKED';
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

const THEME_PALETTES: Record<VueReportTheme, { bg: string; card: string; text: string; muted: string; border: string; accent: string; accent2: string }> = {
  dark: {
    // Executive Slate
    bg: '#111827',
    card: '#1f2937',
    text: '#f3f4f6',
    muted: '#9ca3af',
    border: '#374151',
    accent: '#3b82f6',
    accent2: '#14b8a6'
  },
  light: {
    // Boardroom Light
    bg: '#f8fafc',
    card: '#ffffff',
    text: '#1f2937',
    muted: '#6b7280',
    border: '#d1d5db',
    accent: '#2563eb',
    accent2: '#0d9488'
  },
  professional: {
    // Enterprise Clean (default)
    bg: '#f3f6fb',
    card: '#ffffff',
    text: '#0f172a',
    muted: '#475569',
    border: '#cbd5e1',
    accent: '#1d4ed8',
    accent2: '#0f766e'
  },
  neon: {
    // Executive Carbon
    bg: '#0f172a',
    card: '#1e293b',
    text: '#e2e8f0',
    muted: '#94a3b8',
    border: '#334155',
    accent: '#0ea5e9',
    accent2: '#22c55e'
  },
  ocean: {
    // Coastal Corporate
    bg: '#eaf2f7',
    card: '#f8fbff',
    text: '#102a43',
    muted: '#486581',
    border: '#bcccdc',
    accent: '#1d4ed8',
    accent2: '#0f766e'
  }
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
  const title = options.title || 'Playwright Fire Reports';
  const theme = (options.theme || 'professional') as VueReportTheme;

  const inputTests = data?.tests ?? [];
  const canonicalTotal = inputTests.length;
  const canonicalPassed = inputTests.filter(t => t.status === 'passed').length;
  const canonicalFailed = inputTests.filter(t => t.status === 'failed').length;
  const canonicalSkipped = inputTests.filter(t => t.status === 'skipped').length;
  const canonicalFlaky = inputTests.filter(t => (t.retries || 0) > 0 && t.status === 'passed').length;
  const canonicalDuration = inputTests.reduce((acc, t) => acc + Math.max(0, t.duration || 0), 0);

  const safeData: ReportData = {
    totalTests: canonicalTotal,
    passed: canonicalPassed,
    failed: canonicalFailed,
    skipped: canonicalSkipped,
    flaky: canonicalFlaky,
    totalDuration: canonicalDuration,
    tests: inputTests,
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
  const flakyRate = data.totalTests > 0 ? Math.round((data.flaky / data.totalTests) * 100) : 0;
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
  const avgDurationMs = data.totalTests > 0 ? Math.round(data.totalDuration / data.totalTests) : 0;
  const nonPassing = data.failed + timedOut;
  const releaseGate: VueReportPayload['insights']['releaseGate'] =
    (data.failed > 0 || timedOut > 0)
      ? 'BLOCKED'
      : ((flakyRate >= 8) || (comparison.hasBaseline && comparison.durationDeltaSec > 20))
        ? 'RISKY'
        : 'READY';

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
      flakyRate,
      failRate: enhanced.failRate,
      skipRate: enhanced.skipRate,
      timedOut,
      avgDuration: formatDuration(avgDurationMs),
      nonPassing
    },
    highlights: {
      browsers: browserStats.length,
      suites: suiteStats.length,
      retriedTests,
      historyPoints: history.length
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
      riskLevel,
      releaseGate
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
    return `html[data-report-theme="${t}"] { --report-bg: ${p.bg}; --report-card: ${p.card}; --report-text: ${p.text}; --report-muted: ${p.muted}; --report-border: ${p.border}; --report-accent: ${p.accent}; --report-accent-2: ${p.accent2}; }`;
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
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      background:
        radial-gradient(1100px 520px at 8% -8%, color-mix(in srgb, var(--report-accent) 24%, transparent), transparent 68%),
        radial-gradient(1000px 560px at 96% 0%, color-mix(in srgb, var(--report-accent-2) 18%, transparent), transparent 70%),
        linear-gradient(180deg, color-mix(in srgb, var(--report-bg) 96%, #000 4%), var(--report-bg));
      color: var(--report-text);
      min-height: 100vh;
    }
    .report-root { background: var(--report-bg); color: var(--report-text); }
    .report-card {
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--report-card) 98%, #fff 2%), color-mix(in srgb, var(--report-card) 94%, transparent));
      border-color: color-mix(in srgb, var(--report-border) 86%, transparent);
      backdrop-filter: blur(4px);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--report-accent) 8%, transparent);
      transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
    }
    .report-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 30px color-mix(in srgb, var(--report-accent) 14%, transparent);
      border-color: color-mix(in srgb, var(--report-accent) 28%, var(--report-border));
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
        radial-gradient(80% 120% at 5% 0%, color-mix(in srgb, var(--report-accent) 28%, transparent), transparent 70%),
        radial-gradient(80% 120% at 95% 0%, color-mix(in srgb, var(--report-accent-2) 22%, transparent), transparent 70%),
        color-mix(in srgb, var(--report-card) 96%, transparent);
      border: 1px solid color-mix(in srgb, var(--report-accent) 32%, var(--report-border));
      box-shadow: 0 14px 36px color-mix(in srgb, var(--report-accent) 12%, transparent);
    }
    .metric-pill {
      border: 1px solid color-mix(in srgb, var(--report-accent) 35%, var(--report-border));
      background: linear-gradient(135deg, color-mix(in srgb, var(--report-accent) 16%, transparent), color-mix(in srgb, var(--report-accent-2) 12%, transparent));
    }
    .hero-kpi {
      border: 1px solid color-mix(in srgb, var(--report-accent) 28%, var(--report-border));
      background: color-mix(in srgb, var(--report-card) 84%, transparent);
    }
    .action-btn {
      border: 1px solid color-mix(in srgb, var(--report-accent) 34%, var(--report-border));
      background: linear-gradient(135deg, color-mix(in srgb, var(--report-accent) 18%, transparent), color-mix(in srgb, var(--report-accent-2) 14%, transparent));
      color: var(--report-text);
    }
    .action-btn:hover { filter: brightness(1.04); transform: translateY(-1px); }
    body.exporting-pdf .no-print { display: none !important; }
    body.exporting-pdf .report-card { transform: none !important; }
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
    html[data-report-theme="light"] .report-card,
    html[data-report-theme="professional"] .report-card {
      box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
    }
    html[data-report-theme="neon"] .hero-panel,
    html[data-report-theme="ocean"] .hero-panel {
      box-shadow: 0 16px 36px color-mix(in srgb, var(--report-accent) 24%, transparent);
    }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff !important; color: #111 !important; }
      .report-card { box-shadow: none !important; backdrop-filter: none !important; }
    }
    ${themeCss}
  </style>
</head>
<body class="min-h-screen antialiased">
  <div id="app" class="report-root" v-cloak>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header -->
    <header class="mb-8 flex flex-wrap lg:flex-nowrap items-start justify-between gap-4 fade-up">
      <div class="hero-panel rounded-2xl p-4 sm:p-5 w-full lg:w-[380px] lg:shrink-0">
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
            <option value="professional">Enterprise Clean</option>
            <option value="light">Boardroom Light</option>
            <option value="dark">Executive Slate</option>
            <option value="neon">Executive Carbon</option>
            <option value="ocean">Coastal Corporate</option>
          </select>
        </div>
        <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div class="hero-kpi rounded-xl px-4 py-3 border-l-4 border-l-emerald-500 bg-emerald-500/10">
            <div class="report-muted text-xs">Passed</div>
            <div class="text-xl font-bold text-emerald-400">{{ payload.summary.passed }}</div>
          </div>
          <div class="hero-kpi rounded-xl px-4 py-3 border-l-4 border-l-red-500 bg-red-500/10">
            <div class="report-muted text-xs">Failed</div>
            <div class="text-xl font-bold text-red-400">{{ payload.summary.failed }}</div>
          </div>
          <div class="hero-kpi rounded-xl px-4 py-3 border-l-4 border-l-blue-500 bg-blue-500/10">
            <div class="report-muted text-xs">Pass Rate</div>
            <div class="text-xl font-bold text-blue-400">{{ payload.summary.passRate }}%</div>
          </div>
          <div class="hero-kpi rounded-xl px-4 py-3 border-l-4 border-l-amber-500 bg-amber-500/10">
            <div class="report-muted text-xs">Non-Passing</div>
            <div class="text-xl font-bold text-amber-400">{{ payload.summary.nonPassing }}</div>
          </div>
          <div class="hero-kpi rounded-xl px-4 py-3 border-l-4 border-l-violet-500 bg-violet-500/10">
            <div class="report-muted text-xs">Avg/Test</div>
            <div class="text-xl font-bold text-violet-400">{{ payload.summary.avgDuration }}</div>
          </div>
          <div class="hero-kpi rounded-xl px-4 py-3 border-l-4 border-l-cyan-500 bg-cyan-500/10">
            <div class="report-muted text-xs">Coverage</div>
            <div class="text-lg font-bold text-cyan-300">{{ payload.highlights.browsers }} browsers · {{ payload.highlights.suites }} suites</div>
          </div>
        </div>
      </div>
      <div class="flex-1 min-w-[320px]">
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
        <div class="mt-4 rounded-xl border p-4 report-card">
          <div class="flex items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-wider report-muted">Release Gate</div>
            <span class="px-3 py-1 rounded-full text-xs font-semibold"
              :class="payload.insights.releaseGate === 'READY' ? 'bg-emerald-500/20 text-emerald-400' : payload.insights.releaseGate === 'RISKY' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'">
              {{ payload.insights.releaseGate }}
            </span>
          </div>
          <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div class="hero-kpi rounded-lg px-3 py-2 border-l-4 border-l-red-500 bg-red-500/10">
              <div class="report-muted text-xs">Failed tests</div>
              <div class="font-bold text-red-400 text-lg">{{ payload.summary.failed }}</div>
            </div>
            <div class="hero-kpi rounded-lg px-3 py-2 border-l-4 border-l-violet-500 bg-violet-500/10">
              <div class="report-muted text-xs">Flaky rate</div>
              <div class="font-bold text-violet-400 text-lg">{{ payload.summary.flakyRate }}%</div>
            </div>
            <div class="hero-kpi rounded-lg px-3 py-2 border-l-4 border-l-cyan-500 bg-cyan-500/10">
              <div class="report-muted text-xs">Duration vs previous run</div>
              <div v-if="payload.comparison.hasBaseline" class="font-bold text-lg"
                :class="payload.comparison.durationDeltaSec <= 0 ? 'text-emerald-400' : 'text-amber-400'">
                {{ payload.comparison.durationDeltaSec > 0 ? '+' : '' }}{{ payload.comparison.durationDeltaSec }}s
              </div>
              <div v-else class="font-semibold text-slate-400 text-sm">N/A</div>
            </div>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2 no-print">
          <button type="button" @click.prevent.stop="downloadPdf" class="action-btn px-3 py-1.5 rounded-lg text-xs font-medium transition">Download PDF</button>
          <button type="button" @click.prevent.stop="shareByEmail" class="action-btn px-3 py-1.5 rounded-lg text-xs font-medium transition">Share Email</button>
          <button type="button" @click.prevent.stop="shareToSlack" class="action-btn px-3 py-1.5 rounded-lg text-xs font-medium transition">Share Slack</button>
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
        <div class="text-sm report-muted">Flaky (subset)</div>
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
    const { createApp, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;

    createApp({
      setup() {
        const payload = window.__REPORT_PAYLOAD__;
        const params = new URLSearchParams(window.location.search);
        const tab = ref(params.get('tab') || 'overview');
        const selectedTheme = ref(params.get('theme') || payload.theme || 'professional');
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
          chartInstances.forEach(function(c) { try { c.dispose(); } catch (e) {} });
          chartInstances.length = 0;

          var textColor = getComputedStyle(document.body).getPropertyValue('--report-muted').trim() || '#94a3b8';
          var axisColor = getComputedStyle(document.body).getPropertyValue('--report-border').trim() || '#334155';
          var cardColor = getComputedStyle(document.body).getPropertyValue('--report-card').trim() || '#0f172a';
          var el = function(id) { return document.querySelector(id); };

          function mountChart(id, option) {
            var node = el(id);
            if (!node || !window.echarts) return null;
            var chart = window.echarts.init(node, null, { renderer: 'canvas' });
            chart.setOption(option, true);
            chartInstances.push(chart);
            return chart;
          }

          function makePieData(labels, series, colors) {
            var items = labels.map(function(label, idx) {
              return { name: label, value: Number(series[idx] || 0), itemStyle: { color: colors[idx % colors.length] } };
            }).filter(function(item) { return item.value > 0; });
            if (items.length === 0) {
              return [{ name: 'No data', value: 1, itemStyle: { color: axisColor, opacity: 0.4 }, label: { color: textColor } }];
            }
            return items;
          }

          mountChart('#chart-duration', {
            color: payload.charts.duration.colors,
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: 110, right: 24, top: 20, bottom: 24, containLabel: true },
            xAxis: { type: 'value', axisLine: { lineStyle: { color: axisColor } }, splitLine: { lineStyle: { color: axisColor, opacity: 0.35 } }, axisLabel: { color: textColor } },
            yAxis: { type: 'category', data: payload.charts.duration.labels, axisLine: { lineStyle: { color: axisColor } }, axisLabel: { color: textColor, width: 90, overflow: 'truncate' } },
            series: [{
              name: 'Tests',
              type: 'bar',
              data: payload.charts.duration.series,
              itemStyle: { borderRadius: [0, 6, 6, 0] },
              barMaxWidth: 18
            }]
          });

          if (payload.charts.retries.series.length) {
            mountChart('#chart-retries', {
              color: ['#60a5fa'],
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
              grid: { left: 44, right: 18, top: 20, bottom: 24, containLabel: true },
              xAxis: { type: 'category', data: payload.charts.retries.labels, axisLine: { lineStyle: { color: axisColor } }, axisLabel: { color: textColor } },
              yAxis: { type: 'value', axisLine: { lineStyle: { color: axisColor } }, splitLine: { lineStyle: { color: axisColor, opacity: 0.35 } }, axisLabel: { color: textColor } },
              series: [{ name: 'Tests', type: 'bar', data: payload.charts.retries.series, itemStyle: { borderRadius: [6, 6, 0, 0] }, barMaxWidth: 26 }]
            });
          }

          mountChart('#chart-tiers', {
            tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
            legend: { bottom: 0, textStyle: { color: textColor } },
            series: [{
              name: 'Performance tier',
              type: 'pie',
              radius: ['45%', '74%'],
              center: ['50%', '44%'],
              avoidLabelOverlap: true,
              label: { color: textColor },
              labelLine: { lineStyle: { color: axisColor } },
              data: makePieData(payload.charts.tiers.labels, payload.charts.tiers.series, payload.charts.tiers.colors)
            }]
          });

          mountChart('#chart-quality', {
            radar: {
              indicator: payload.charts.quality.labels.map(function(label) { return { name: label, max: 100 }; }),
              axisName: { color: textColor },
              axisLine: { lineStyle: { color: axisColor } },
              splitLine: { lineStyle: { color: axisColor, opacity: 0.5 } },
              splitArea: { areaStyle: { color: ['transparent'] } }
            },
            tooltip: {},
            series: [{
              name: 'Quality',
              type: 'radar',
              data: [{ value: payload.charts.quality.series, name: 'Score' }],
              areaStyle: { opacity: 0.25, color: '#22c55e' },
              lineStyle: { color: '#22c55e', width: 2 },
              itemStyle: { color: '#22c55e' }
            }]
          });

          mountChart('#chart-file-risk', {
            color: payload.charts.fileRisk.colors,
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: 120, right: 18, top: 20, bottom: 24, containLabel: true },
            xAxis: { type: 'value', max: 100, axisLine: { lineStyle: { color: axisColor } }, splitLine: { lineStyle: { color: axisColor, opacity: 0.35 } }, axisLabel: { color: textColor } },
            yAxis: { type: 'category', data: payload.charts.fileRisk.labels, axisLine: { lineStyle: { color: axisColor } }, axisLabel: { color: textColor, width: 100, overflow: 'truncate' } },
            series: [{
              name: 'Risk Score',
              type: 'bar',
              data: payload.charts.fileRisk.series,
              itemStyle: { borderRadius: [0, 6, 6, 0] },
              barMaxWidth: 18
            }]
          });

          mountChart('#chart-duration-top', {
            color: ['#f97316'],
            tooltip: { trigger: 'axis' },
            grid: { left: 44, right: 18, top: 24, bottom: 24, containLabel: true },
            xAxis: { type: 'category', data: payload.charts.durationTop.labels, axisLabel: { show: false, color: textColor }, axisLine: { lineStyle: { color: axisColor } } },
            yAxis: { type: 'value', axisLine: { lineStyle: { color: axisColor } }, splitLine: { lineStyle: { color: axisColor, opacity: 0.35 } }, axisLabel: { color: textColor } },
            series: [{
              name: 'Seconds',
              type: 'line',
              smooth: true,
              symbolSize: 7,
              data: payload.charts.durationTop.series,
              areaStyle: {
                color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(249,115,22,0.45)' },
                  { offset: 1, color: 'rgba(249,115,22,0.06)' }
                ])
              },
              lineStyle: { width: 3 }
            }]
          });

          if (payload.charts.browserMatrix.labels.length > 0) {
            mountChart('#chart-browser-matrix', {
              tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
              legend: { bottom: 0, textStyle: { color: textColor } },
              series: [{
                name: 'Browser share',
                type: 'pie',
                radius: ['45%', '74%'],
                center: ['50%', '44%'],
                label: { color: textColor },
                labelLine: { lineStyle: { color: axisColor } },
                data: makePieData(payload.charts.browserMatrix.labels, payload.charts.browserMatrix.series, payload.charts.browserMatrix.colors)
              }]
            });
          }

          if (payload.charts.suiteShare.labels.length > 0) {
            mountChart('#chart-suite-share', {
              tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
              legend: { bottom: 0, textStyle: { color: textColor } },
              series: [{
                name: 'Suite share',
                type: 'pie',
                radius: ['45%', '74%'],
                center: ['50%', '44%'],
                label: { color: textColor },
                labelLine: { lineStyle: { color: axisColor } },
                data: makePieData(payload.charts.suiteShare.labels, payload.charts.suiteShare.series, payload.charts.suiteShare.colors)
              }]
            });
          }

          if (payload.charts.runTrends.labels.length > 1) {
            mountChart('#chart-run-trends', {
              color: ['#22c55e', '#ef4444', '#8b5cf6', '#06b6d4'],
              tooltip: { trigger: 'axis' },
              legend: { top: 0, textStyle: { color: textColor } },
              grid: { left: 44, right: 44, top: 42, bottom: 28, containLabel: true },
              xAxis: { type: 'category', data: payload.charts.runTrends.labels, axisLabel: { show: false, color: textColor }, axisLine: { lineStyle: { color: axisColor } } },
              yAxis: [
                { type: 'value', min: 0, max: 100, name: '%', axisLabel: { color: textColor }, splitLine: { lineStyle: { color: axisColor, opacity: 0.35 } } },
                { type: 'value', name: 'Seconds', axisLabel: { color: textColor }, splitLine: { show: false } }
              ],
              series: [
                { name: 'Pass %', type: 'line', smooth: true, data: payload.charts.runTrends.passRate, symbolSize: 6 },
                { name: 'Fail %', type: 'line', smooth: true, data: payload.charts.runTrends.failRate, symbolSize: 6 },
                { name: 'Flaky %', type: 'line', smooth: true, data: payload.charts.runTrends.flakyRate, symbolSize: 6 },
                { name: 'Duration (s)', type: 'line', smooth: true, yAxisIndex: 1, data: payload.charts.runTrends.durationSec, symbolSize: 6 }
              ]
            });
          }
        }

        function handleResize() {
          chartInstances.forEach(function(c) { try { c.resize(); } catch (e) {} });
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

        function buildShareSummary() {
          return [
            payload.title,
            '',
            'Total: ' + payload.summary.total,
            'Passed: ' + payload.summary.passed,
            'Failed: ' + payload.summary.failed,
            'Skipped: ' + payload.summary.skipped,
            'Timed out: ' + payload.summary.timedOut,
            'Pass rate: ' + payload.summary.passRate + '%',
            'Duration: ' + payload.summary.duration,
            'Risk: ' + payload.insights.riskLevel,
            'Generated: ' + new Date(payload.generatedAt).toLocaleString(),
            '',
            'Report: ' + window.location.href
          ].join('\\n');
        }

        async function downloadPdf(ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
          var node = document.querySelector('.max-w-7xl');
          if (!node || !window.html2pdf) {
            window.print();
            return;
          }

          // Freeze chart animations and force resize before capture.
          chartInstances.forEach(function(c) {
            try {
              c.resize();
              c.setOption({ animation: false });
            } catch (e) {}
          });

          document.body.classList.add('exporting-pdf');
          await new Promise(function(resolve) { setTimeout(resolve, 180); });

          try {
            var filename = (payload.title || 'playwright-fire-reports')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '') + '.pdf';
            var opt = {
              margin: [6, 6, 6, 6],
              filename: filename,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                logging: false
              },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
              pagebreak: { mode: ['css', 'legacy'] }
            };
            await window.html2pdf().set(opt).from(node).save();
          } catch (e) {
            window.print();
          } finally {
            document.body.classList.remove('exporting-pdf');
            chartInstances.forEach(function(c) {
              try { c.setOption({ animation: true }); } catch (e) {}
            });
          }
        }

        function shareByEmail(ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
          var subject = payload.title + ' - Test Report';
          var body = buildShareSummary();
          window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        }

        async function shareToSlack(ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
          var storageKey = 'fire_report_slack_webhook';
          var previous = localStorage.getItem(storageKey) || '';
          var webhook = window.prompt('Enter Slack Incoming Webhook URL to share this report:', previous || '');
          if (!webhook) return;
          localStorage.setItem(storageKey, webhook);
          var text = buildShareSummary();
          try {
            var res = await fetch(webhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: text })
            });
            if (!res.ok) throw new Error('Slack webhook returned ' + res.status);
            alert('Report shared to Slack.');
          } catch (e) {
            try {
              await navigator.clipboard.writeText(text);
              alert('Could not post directly to Slack from browser. Summary copied to clipboard.');
            } catch (_) {
              alert('Could not post directly to Slack from browser.');
            }
          }
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
          window.addEventListener('resize', handleResize);
          syncUrlState();
        });

        onBeforeUnmount(function() {
          window.removeEventListener('keydown', onKeydown);
          window.removeEventListener('resize', handleResize);
          chartInstances.forEach(function(c) { try { c.dispose(); } catch (e) {} });
          chartInstances.length = 0;
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

        return { payload, tab, selectedTheme, expandedStack, searchQuery, filterStatus, filterBrowser, filterSuite, browserOptions, suiteOptions, selectedTest, filteredAllTests, hasChartData, switchTab, openTest, closeTest, toggleStack, copyError, downloadPdf, shareByEmail, shareToSlack };
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
