import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build served under the same
// subpath that GitHub Pages uses, so asset and worker URLs are exercised for real.
const PORT = 4173;
const BASE = '/Flashcards/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build:pages && npx vite preview --port ${PORT} --strictPort --base ${BASE}`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
