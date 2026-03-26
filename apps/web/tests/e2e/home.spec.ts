import * as playwright from '@playwright/test'

const { test, expect } = playwright

/**
 * E2E tests expect the Video Grab app at http://localhost:3000 (not the default Nuxt welcome).
 * Run `pnpm run dev` from repo root so the web app serves the Video Grab UI, or run
 * `pnpm run test:e2e` with nothing on port 3000 so Playwright starts the server.
 */
test.describe('Video Grab home page', () => {
  test('loads with title and form', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /Video Grab/i })).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByText(/Paste an X or Twitter video link below/i),
    ).toBeVisible()
    await expect(
      page.getByPlaceholder(/x\.com\/username\/status/i),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /Grab video/i })).toBeVisible()
  })

  test('submit button is disabled for empty URL', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const submitBtn = page.getByRole('button', { name: /Grab video/i })
    await expect(submitBtn).toBeVisible({ timeout: 10_000 })
    await expect(submitBtn).toBeDisabled()
  })

  test('submit button is disabled for non-X URL', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const input = page.getByPlaceholder(/x\.com\/username\/status/i)
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('https://example.com/foo')
    const submitBtn = page.getByRole('button', { name: /Grab video/i })
    await expect(submitBtn).toBeDisabled()
  })

  test('submit button is enabled for valid X URL format', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const input = page.getByPlaceholder(/x\.com\/username\/status/i)
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('https://x.com/user/status/1234567890')
    const submitBtn = page.getByRole('button', { name: /Grab video/i })
    await expect(submitBtn).toBeEnabled()
  })

  test('submitting valid-format X URL shows loading then result or error', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const input = page.getByPlaceholder(/x\.com\/username\/status/i)
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('https://x.com/LakeBoss/status/2028843353652031717')
    await page.getByRole('button', { name: /Grab video/i }).click()
    await expect(page.getByRole('button', { name: /Grab video/i })).toBeDisabled()
    await page.waitForTimeout(300)
    await expect(
      page.getByText(/Ready to download|No video found|Could not fetch|Only X \(Twitter\)|Invalid|Something went wrong/i),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('Clear button appears after result and resets state', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const input = page.getByPlaceholder(/x\.com\/username\/status/i)
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('https://x.com/someuser/status/9999999999999999999')
    await page.getByRole('button', { name: /Grab video/i }).click()
    await page.getByRole('button', { name: /Clear/i }).waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('button', { name: /Clear/i }).click()
    await expect(page.getByRole('button', { name: /Clear/i })).not.toBeVisible()
  })

  test('Open X link goes to x.com', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const openX = page.getByRole('link', { name: /Open X/i })
    await expect(openX).toBeVisible({ timeout: 10_000 })
    await expect(openX).toHaveAttribute('href', /x\.com/)
    await expect(openX).toHaveAttribute('target', '_blank')
  })
})
