import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
const executable =
  process.env.CHROMIUM_EXECUTABLE_PATH ??
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
export default defineConfig({
  testDir: './apps/web/tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30000,
  outputDir: '/tmp/research-browser-results',
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: process.env.BROWSER_REPORT_PATH ?? '/tmp/research-browser-results.json' },
    ],
  ],
  use: {
    headless: true,
    viewport: { width: 1280, height: 960 },
    launchOptions: {
      ...(executable ? { executablePath: executable } : {}),
    },
  },
});
