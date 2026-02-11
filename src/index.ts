// Main entry point
export { parsePlaywrightReport, PlaywrightReport, ReportData, TestResult } from './parser.js';
export { calculateStatistics, Statistics, formatDuration, getStatusColor, getStatusIcon } from './statistics.js';
export { generateReport, ReportOptions } from './reportGenerator.js';
export { generateAdvancedReport, AdvancedReportOptions } from './advancedReportGenerator.js';
export { generateVueReport, VueReportOptions, type VueReportTheme } from './vueReportGenerator.js';

import fs from 'fs-extra';
import { parsePlaywrightReport } from './parser.js';
import { generateVueReport } from './vueReportGenerator.js';

export async function createReport(
  jsonPath: string,
  outputPath: string,
  options: {
    title?: string;
    theme?: import('./vueReportGenerator.js').VueReportTheme;
    advanced?: boolean;
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
  } = {}
) {
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const report = JSON.parse(raw);
    const data = parsePlaywrightReport(report);
    
    const reportPath = await generateVueReport(data, {
      title: options.title || 'Playwright Test Report',
      theme: options.theme || 'dark',
      metadata: options.metadata,
      history: options.history,
      outputPath
    });
    
    return reportPath;
  } catch (error) {
    throw new Error(`Failed to create report: ${(error as Error).message}`);
  }
}
