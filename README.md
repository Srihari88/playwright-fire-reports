# Playwright Fire Reports

HTML reports for Playwright test results with charts, themes, test steps, and failure details.

---

## How to generate a report

Follow these three steps every time you want a report.

---

### Step 1: Install the package

In your Playwright project:

```bash
npm install playwright-fire-reports
```

---

### Step 2: Run tests and save JSON

**Add the JSON reporter to your Playwright config.**

Open `playwright.config.ts` and set the reporter like this:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
  ],
});
```

Then run your tests:

```bash
npx playwright test
```

This creates a file named `test-results.json` in your project root.

---

### Step 3: Generate the HTML report

Run:

```bash
npx fire-report --input test-results.json --output report.html
```

Then open the report in your browser:

```bash
open report.html
```

(On Windows use `start report.html`, on Linux use `xdg-open report.html`.)

---

## Optional: change theme or title

- **Theme** (default is `dark`): use `--theme light`, `--theme professional`, `--theme neon`, or `--theme ocean`.
- **Title**: use `--title "My Report"`.

Example:

```bash
npx fire-report --input test-results.json --output report.html --theme light --title "E2E Test Report"
```

---

## Optional: use in code

```ts
import { createReport } from 'playwright-fire-reports';

await createReport('test-results.json', 'report.html', {
  title: 'My Report',
  theme: 'dark',
});
```

---

## Summary

| Step | Command |
|------|---------|
| 1. Install | `npm install playwright-fire-reports` |
| 2. Add reporter to `playwright.config.ts` | `['json', { outputFile: 'test-results.json' }]` |
| 3. Run tests | `npx playwright test` |
| 4. Generate report | `npx fire-report --input test-results.json --output report.html` |
| 5. Open report | `open report.html` |
