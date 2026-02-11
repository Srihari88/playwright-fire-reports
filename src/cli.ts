#!/usr/bin/env node
// CLI Tool
import fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { parsePlaywrightReport, validatePlaywrightReport } from './parser.js';
import { generateVueReport } from './vueReportGenerator.js';

interface HistoryEntry {
  generatedAt: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  timedOut: number;
  durationMs: number;
  passRate: number;
}

const argv = yargs(hideBin(process.argv))
  .option('input', {
    alias: 'i',
    describe: 'Path to Playwright JSON report file',
    type: 'string',
    default: './test-results.json'
  })
  .option('output', {
    alias: 'o',
    describe: 'Output path for HTML report',
    type: 'string',
    default: './reports/report.html'
  })
  .option('title', {
    alias: 't',
    describe: 'Report title',
    type: 'string',
    default: 'Playwright Test Report'
  })
  .option('theme', {
    describe: 'Theme: dark, light, professional, neon, ocean',
    type: 'string',
    choices: ['dark', 'light', 'professional', 'neon', 'ocean'],
    default: 'dark'
  })
  .option('branch', {
    describe: 'Git branch name (shown in report metadata)',
    type: 'string'
  })
  .option('commit', {
    describe: 'Commit SHA (shown in report metadata)',
    type: 'string'
  })
  .option('build-url', {
    describe: 'CI build URL (shown in report metadata)',
    type: 'string'
  })
  .option('environment', {
    describe: 'Environment name like qa/stage/prod',
    type: 'string'
  })
  .option('pr', {
    describe: 'Pull request number/id',
    type: 'string'
  })
  .option('history-file', {
    describe: 'Path to a JSON file used to store run history for trend analytics',
    type: 'string',
    default: './reports/.fire-report-history.json'
  })
  .option('history-limit', {
    describe: 'Maximum number of historical runs to keep',
    type: 'number',
    default: 30
  })
  .help()
  .parseSync() as any;

async function main() {
  try {
    console.log(chalk.blue.bold('\n🎭 Playwright Custom Report Generator\n'));

    const inputPath = path.resolve(argv.input);
    const outputPath = path.resolve(argv.output);

    if (!fs.existsSync(inputPath)) {
      console.log(chalk.red(`❌ Input file not found: ${inputPath}`));
      process.exit(1);
    }

    console.log(chalk.cyan(`📂 Reading report from: ${inputPath}`));

    const raw = await fs.readFile(inputPath, 'utf-8');
    let report;
    try {
      report = JSON.parse(raw);
    } catch (error) {
      console.log(chalk.red(`❌ Failed to parse JSON file: ${inputPath}`));
      process.exit(1);
    }

    if (!validatePlaywrightReport(report)) {
      console.log(chalk.red(`❌ Invalid Playwright report structure in file: ${inputPath}`));
      process.exit(1);
    }

    const data = parsePlaywrightReport(report);

    if (data.totalTests === 0) {
      console.log(chalk.yellow(`⚠️ No tests were parsed from: ${inputPath}`));
      console.log(chalk.yellow(`   This usually means the input is not Playwright JSON reporter output.`));
      console.log(chalk.yellow(`   Use reporter: ['json', { outputFile: 'test-results.json' }]`));
      console.log(chalk.yellow(`   Then run: npx fire-report --input test-results.json --output report.html\n`));
    }

    console.log(chalk.cyan(`📊 Total tests: ${chalk.yellow(data.totalTests)}`));
    console.log(chalk.cyan(`✓ Passed: ${chalk.green(data.passed)}`));
    console.log(chalk.cyan(`✕ Failed: ${chalk.red(data.failed)}`));
    console.log(chalk.cyan(`⊘ Skipped: ${chalk.yellow(data.skipped)}`));
    console.log(chalk.cyan(`🔄 Flaky: ${chalk.magenta(data.flaky)}`));
    console.log(chalk.cyan(`⏱ Total duration: ${(data.totalDuration / 1000).toFixed(2)}s\n`));
    if (data.browserStats && data.browserStats.length > 0) {
      const browserSummary = data.browserStats.map(b => `${b.browser}:${b.total}`).join(', ');
      console.log(chalk.cyan(`🌐 Browsers: ${chalk.yellow(browserSummary)}`));
    }
    if (data.suiteStats && data.suiteStats.length > 0) {
      console.log(chalk.cyan(`🧩 Suites: ${chalk.yellow(data.suiteStats.length)}\n`));
    }

    const timedOut = data.tests.filter(t => t.status === 'timedOut').length;
    const passRate = data.totalTests > 0 ? Math.round((data.passed / data.totalTests) * 100) : 0;
    const historyFilePath = path.resolve(argv['history-file']);
    const historyLimit = Math.max(1, Number(argv['history-limit']) || 30);
    let history: HistoryEntry[] = [];
    if (await fs.pathExists(historyFilePath)) {
      try {
        const rawHistory = await fs.readFile(historyFilePath, 'utf-8');
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) {
          history = parsed.filter((e: any) => e && typeof e === 'object');
        }
      } catch {
        history = [];
      }
    }
    history.push({
      generatedAt: new Date().toISOString(),
      total: data.totalTests,
      passed: data.passed,
      failed: data.failed,
      skipped: data.skipped,
      flaky: data.flaky,
      timedOut,
      durationMs: data.totalDuration,
      passRate
    });
    history = history.slice(-historyLimit);
    await fs.ensureDir(path.dirname(historyFilePath));
    await fs.writeFile(historyFilePath, JSON.stringify(history, null, 2), 'utf-8');

    console.log(chalk.cyan('🎨 Generating Vue.js report...'));
    
    const reportPath = await generateVueReport(data, {
      title: argv.title,
      theme: argv.theme as import('./vueReportGenerator.js').VueReportTheme,
      metadata: {
        branch: argv.branch,
        commit: argv.commit,
        buildUrl: argv['build-url'],
        environment: argv.environment,
        pullRequest: argv.pr
      },
      history,
      outputPath
    });

    console.log(chalk.green.bold(`\n✅ Report generated successfully!\n`));
    console.log(chalk.cyan(`📄 Report saved to: ${chalk.yellow(reportPath)}`));
    console.log(chalk.cyan(`🌐 Open in browser to view\n`));

  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
    process.exit(1);
  }
}

main();
