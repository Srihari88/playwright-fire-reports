// Report Parser - Extracts and analyzes Playwright test data
export interface TestResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  retries: number;
  /** Playwright project/browser name (e.g. chromium/firefox/webkit) */
  browser?: string;
  /** Logical suite title for suite-level analytics */
  suite?: string;
  error?: string;
  /** Full stack trace when test failed (for report display) */
  errorStack?: string;
  file?: string;
  /** Line in source file (1-based) for "where it failed" */
  line?: number;
  column?: number;
  /** Steps performed (e.g. from stdout or trace) – like Playwright HTML report */
  steps?: string[];
}

export interface ReportData {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  totalDuration: number;
  startTime?: string;
  endTime?: string;
  tests: TestResult[];
  suites?: string[];
  browsers?: string[];
  browserStats?: BrowserStats[];
  suiteStats?: SuiteStats[];
}

export interface BrowserStats {
  browser: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  flaky: number;
  passRate: number;
  duration: number;
}

export interface SuiteStats {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  flaky: number;
  passRate: number;
  duration: number;
}

/** Playwright JSON reporter can use nested suites: suite.suites[].specs */
export interface PlaywrightReport {
  suites: Array<{
    title?: string;
    file?: string;
    specs?: Array<{
      title: string;
      file?: string;
      tests: Array<{
        title?: string;
        projectName?: string;
        results: Array<{
          status: 'passed' | 'failed' | 'skipped' | 'timedOut';
          duration: number;
          error?: { message?: string; stack?: string };
          errors?: Array<{ message?: string; stack?: string }>;
          stdout?: Array<{ text?: string }>;
        }>;
      }>;
    }>;
    suites?: PlaywrightReport['suites'];
  }>;
}

type SpecEntry = NonNullable<PlaywrightReport['suites'][0]['specs']>[number];
type CollectedSpec = { spec: SpecEntry; suiteTitle?: string };

/** Recursively collect all specs from a suite and its nested suites (Playwright format). */
function collectSpecs(
  suite: PlaywrightReport['suites'][0],
  acc: CollectedSpec[],
  parentSuiteTitle?: string
): void {
  if (!suite || typeof suite !== 'object') return;
  const currentTitle = suite.title || parentSuiteTitle;
  const specs = suite.specs;
  if (Array.isArray(specs)) {
    for (const spec of specs) {
      if (spec && Array.isArray(spec.tests)) acc.push({ spec, suiteTitle: currentTitle });
    }
  }
  const childSuites = suite.suites;
  if (Array.isArray(childSuites)) {
    for (const child of childSuites) {
      collectSpecs(child, acc, currentTitle);
    }
  }
}

export function validatePlaywrightReport(report: any): boolean {
  if (!report || typeof report !== 'object') return false;
  if (!Array.isArray(report.suites)) return false;
  for (const suite of report.suites) {
    if (!suite || typeof suite !== 'object') return false;
    const specs = suite.specs;
    const childSuites = suite.suites;
    const hasSpecs = Array.isArray(specs) && specs.some((s: any) => s && Array.isArray(s.tests));
    const hasNested = Array.isArray(childSuites) && childSuites.length > 0;
    if (!hasSpecs && !hasNested) continue;
    if (hasNested) {
      for (const child of childSuites) {
        if (!validatePlaywrightReport({ suites: [child] })) return false;
      }
    }
  }
  return true;
}

function getResultError(result: { error?: { message?: string }; errors?: Array<{ message?: string }> }): string | undefined {
  if (result.error?.message) return result.error.message;
  const errors = result.errors;
  if (Array.isArray(errors) && errors.length > 0 && errors[0]?.message) return errors[0].message;
  return undefined;
}

function getResultErrorStack(result: { error?: { stack?: string }; errors?: Array<{ stack?: string }> }): string | undefined {
  if (result.error?.stack) return result.error.stack;
  const errors = result.errors;
  if (Array.isArray(errors) && errors.length > 0 && errors[0]?.stack) return errors[0].stack;
  return undefined;
}

export function parsePlaywrightReport(report: PlaywrightReport): ReportData {
  const tests: TestResult[] = [];
  const suites = new Set<string>();
  const browsers = new Set<string>();
  let totalDuration = 0;

  function processSuite(suite: PlaywrightReport['suites'][0]) {
    if (!suite) return;
    if (suite.title) suites.add(suite.title);
    if (suite.file) suites.add(suite.file);

    const allSpecs: CollectedSpec[] = [];
    collectSpecs(suite, allSpecs);

    for (const item of allSpecs) {
      const spec = item.spec;
      if (spec.file) suites.add(spec.file);
      for (const test of spec.tests || []) {
        const results = test.results || [];
        if (results.length === 0) continue;

        const lastResult = results[results.length - 1];
        const retries = results.length - 1;
        const testAny = test as { file?: string; line?: number; column?: number; title?: string; projectName?: string };
        const rawResult = lastResult as { stdout?: Array<{ text?: string }> };
        const steps = Array.isArray(rawResult.stdout)
          ? rawResult.stdout.map(s => (s?.text ?? '').trim()).filter(Boolean)
          : undefined;
        const browser = testAny.projectName;
        if (browser) browsers.add(browser);
        const suiteName = item.suiteTitle || spec.file || suite.title || 'Unknown Suite';

        const testRecord: TestResult = {
          title: spec.title || testAny.title || 'Unnamed test',
          status: lastResult.status as 'passed' | 'failed' | 'skipped' | 'timedOut',
          duration: lastResult.duration ?? 0,
          retries,
          browser,
          suite: suiteName,
          error: getResultError(lastResult),
          errorStack: getResultErrorStack(lastResult),
          file: spec.file || testAny.file,
          line: testAny.line,
          column: testAny.column,
          steps: steps?.length ? steps : undefined
        };

        tests.push(testRecord);
        totalDuration += testRecord.duration;
      }
    }
  }

  for (const suite of report.suites || []) {
    processSuite(suite);
  }

  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => t.status === 'failed').length;
  const skipped = tests.filter(t => t.status === 'skipped').length;
  const flaky = tests.filter(t => t.retries > 0 && t.status === 'passed').length;
  const browserStatsMap = new Map<string, BrowserStats>();
  const suiteStatsMap = new Map<string, SuiteStats>();

  for (const t of tests) {
    const browserKey = t.browser || 'unknown';
    const b = browserStatsMap.get(browserKey) || {
      browser: browserKey,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      flaky: 0,
      passRate: 0,
      duration: 0
    };
    b.total += 1;
    b.duration += t.duration;
    if (t.status === 'passed') b.passed += 1;
    if (t.status === 'failed') b.failed += 1;
    if (t.status === 'skipped') b.skipped += 1;
    if (t.status === 'timedOut') b.timedOut += 1;
    if (t.retries > 0 && t.status === 'passed') b.flaky += 1;
    browserStatsMap.set(browserKey, b);

    const suiteKey = t.suite || t.file || 'Unknown Suite';
    const s = suiteStatsMap.get(suiteKey) || {
      suite: suiteKey,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      flaky: 0,
      passRate: 0,
      duration: 0
    };
    s.total += 1;
    s.duration += t.duration;
    if (t.status === 'passed') s.passed += 1;
    if (t.status === 'failed') s.failed += 1;
    if (t.status === 'skipped') s.skipped += 1;
    if (t.status === 'timedOut') s.timedOut += 1;
    if (t.retries > 0 && t.status === 'passed') s.flaky += 1;
    suiteStatsMap.set(suiteKey, s);
  }

  const browserStats = [...browserStatsMap.values()]
    .map(b => ({ ...b, passRate: b.total > 0 ? Math.round((b.passed / b.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
  const suiteStats = [...suiteStatsMap.values()]
    .map(s => ({ ...s, passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  return {
    totalTests: tests.length,
    passed,
    failed,
    skipped,
    flaky,
    totalDuration,
    tests,
    suites: Array.from(suites),
    browsers: Array.from(browsers),
    browserStats,
    suiteStats
  };
}
