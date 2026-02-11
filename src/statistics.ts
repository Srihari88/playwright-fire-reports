// Report Statistics Calculator
import { ReportData, TestResult } from './parser';

export interface Statistics {
  passRate: number;
  failRate: number;
  skipRate: number;
  averageDuration: number;
  maxDuration: number;
  minDuration: number;
  durationByStatus: {
    passed: number;
    failed: number;
    skipped: number;
  };
  retriesDistribution: { [key: number]: number };
  durationRanges: {
    fast: number;      // < 1s
    medium: number;    // 1-5s
    slow: number;      // 5-15s
    verySlow: number;  // > 15s
  };
  failedTests: TestResult[];
  flakyTests: TestResult[];
  slowestTests: TestResult[];
}

export function calculateStatistics(data: ReportData): Statistics {
  if (!data || !data.tests || data.tests.length === 0) {
    return {
      passRate: 0,
      failRate: 0,
      skipRate: 0,
      averageDuration: 0,
      maxDuration: 0,
      minDuration: 0,
      durationByStatus: { passed: 0, failed: 0, skipped: 0 },
      retriesDistribution: {},
      durationRanges: { fast: 0, medium: 0, slow: 0, verySlow: 0 },
      failedTests: [],
      flakyTests: [],
      slowestTests: []
    };
  }

  const durationByStatus = {
    passed: 0,
    failed: 0,
    skipped: 0
  };

  const retriesMap: { [key: number]: number } = {};
  let maxDuration = 0;
  let minDuration = Infinity;

  // Calculate durations and retries
  for (const test of data.tests) {
    if (test.status === 'passed') durationByStatus.passed += test.duration;
    if (test.status === 'failed') durationByStatus.failed += test.duration;
    if (test.status === 'skipped') durationByStatus.skipped += test.duration;

    maxDuration = Math.max(maxDuration, test.duration);
    minDuration = Math.min(minDuration, test.duration);

    retriesMap[test.retries] = (retriesMap[test.retries] || 0) + 1;
  }

  minDuration = minDuration === Infinity ? 0 : minDuration;

  // Duration ranges
  const durationRanges = {
    fast: 0,
    medium: 0,
    slow: 0,
    verySlow: 0
  };

  for (const test of data.tests) {
    if (test.duration < 1000) durationRanges.fast++;
    else if (test.duration < 5000) durationRanges.medium++;
    else if (test.duration < 15000) durationRanges.slow++;
    else durationRanges.verySlow++;
  }

  // Get failed, flaky, and slowest tests
  const failedTests = data.tests.filter(t => t.status === 'failed');
  const flakyTests = data.tests.filter(t => t.retries > 0 && t.status === 'passed');
  const slowestTests = [...data.tests].sort((a, b) => b.duration - a.duration).slice(0, 10);

  return {
    passRate: data.totalTests > 0 ? Math.round((data.passed / data.totalTests) * 100) : 0,
    failRate: data.totalTests > 0 ? Math.round((data.failed / data.totalTests) * 100) : 0,
    skipRate: data.totalTests > 0 ? Math.round((data.skipped / data.totalTests) * 100) : 0,
    averageDuration: data.totalTests > 0 ? Math.round(data.totalDuration / data.totalTests) : 0,
    maxDuration,
    minDuration,
    durationByStatus,
    retriesDistribution: retriesMap,
    durationRanges,
    failedTests,
    flakyTests,
    slowestTests
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'passed': return '#10b981';
    case 'failed': return '#ef4444';
    case 'skipped': return '#f59e0b';
    case 'timedOut': return '#8b5cf6';
    default: return '#6b7280';
  }
}

export function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed': return '✓';
    case 'failed': return '✕';
    case 'skipped': return '⊘';
    case 'timedOut': return '⏱';
    default: return '?';
  }
}
