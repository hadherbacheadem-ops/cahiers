// Mobile tests (Nuit 2, M1): tests/mobile/*.spec.ts on iPhone 14 (WebKit) and
// Pixel 7 (Chromium) against the production build served by `vite preview`.
//   npm run build && npx playwright test            → both phones
//   npx playwright test --project=parcours          → recorded journey (trace + video in docs/mobile/parcours/)
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/mobile',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  webServer: {
    command: 'npx vite preview --port 4199 --strictPort',
    url: 'http://localhost:4199',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:4199',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone-14', testIgnore: /parcours/, use: { ...devices['iPhone 14'] } },
    { name: 'pixel-7', testIgnore: /parcours/, use: { ...devices['Pixel 7'] } },
    { name: 'parcours', testMatch: /parcours\.spec\.ts/, outputDir: 'docs/mobile/parcours/raw', use: { ...devices['iPhone 14'], video: 'on', trace: 'on' } },
  ],
})
