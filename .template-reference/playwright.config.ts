import { defineConfig, devices } from '@playwright/test'

const nuxtPort = Number(process.env.NUXT_PORT || 3000)
const baseURL = `http://localhost:${Number.isFinite(nuxtPort) ? nuxtPort : 3000}`

/**
 * Derived-app baseline for Playwright config.
 * Downstream apps can customize this file, but this version is the template
 * reference for a single-app monorepo with tests under apps/web/tests/e2e.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  maxFailures: process.env.CI ? undefined : 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    command: 'pnpm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'web',
      testDir: 'apps/web/tests/e2e',
      use: { ...devices['Desktop Chrome'], baseURL },
    },
  ],
})
