import { test as base, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

const HYDRATION_PATTERNS = [
  /hydration/i,
  /mismatch/i,
  /hydration node mismatch/i,
  /data-server-rendered/i,
]

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const consoleLogs: string[] = []

    page.on('console', (msg) => {
      consoleLogs.push(msg.text())
    })

    await use(page)

    const hydrationErrors = consoleLogs.filter((log) =>
      HYDRATION_PATTERNS.some((pattern) => pattern.test(log)),
    )
    if (hydrationErrors.length > 0) {
      throw new Error(`Hydration errors detected in console:\n${hydrationErrors.join('\n')}`)
    }
  },
})

export async function waitForHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(100)
}

export async function waitForBaseUrlReady(baseUrl: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const headResponse = await fetch(baseUrl, { method: 'HEAD' })
      if (headResponse.ok) {
        return
      }

      const getResponse = await fetch(baseUrl)
      if (getResponse.ok) {
        return
      }
    } catch {
      // Server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error(`Server at ${baseUrl} did not become ready within ${timeoutMs}ms`)
}

export async function warmUpApp(browser: Browser, baseUrl: string, path = '/') {
  const page = await browser.newPage()

  try {
    await page.goto(new URL(path, baseUrl).toString(), { timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 })
  } finally {
    await page.close()
  }
}

export function createUniqueEmail(prefix = 'e2e') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${suffix}@example.com`
}

// ─── API Helpers ────────────────────────────────────────────
// Reusable helpers for E2E tests. All run inside page.evaluate()
// so they use the browser's cookie jar (session cookies).

/** CSRF headers required by the layer's CSRF middleware. */
const _CSRF_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
} as const

/**
 * Create a pre-configured fetch function for E2E tests that automatically
 * includes CSRF headers (`X-Requested-With: XMLHttpRequest`).
 *
 * This mirrors what `useCsrfFetch()` does at runtime but for Playwright's
 * `page.evaluate()` context where Nuxt composables aren't available.
 *
 * ```ts
 * const testFetch = createTestFetch()
 * await page.evaluate(async (fetch) => {
 *   await fetch('/api/items', { method: 'POST', body: JSON.stringify(data) })
 * }, testFetch)
 * ```
 */
export function createTestFetchHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...extraHeaders,
  } as const
}

/** Shorthand: CSRF + JSON content type headers for mutation requests with a body. */
export function createTestMutationHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...extraHeaders,
  } as const
}

/**
 * Register a new user via the API and return the user object.
 * The page's cookie jar will contain the session after this call.
 */
export async function registerAndLogin(
  page: Page,
  payload: { name: string; email: string; password: string },
) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }, payload)
}

/**
 * Log in as the seeded admin user (admin@example.com / testpass123).
 */
export async function loginAsAdmin(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'testpass123' }),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  })
}

/**
 * Log in with specific credentials.
 */
export async function loginViaApi(page: Page, payload: { email: string; password: string }) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }, payload)
}

/**
 * Log out the current user.
 */
export async function logoutViaApi(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  })
}

/**
 * Create a notification via the API. Useful for seeding test state.
 * Requires an authenticated admin/user session.
 */
export async function createNotificationViaApi(
  page: Page,
  payload: {
    userId: string
    kind: string
    title: string
    body: string
    icon?: string
    actionUrl?: string
  },
) {
  return page.evaluate(async (body) => {
    // Use the internal server route — in tests we POST directly
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }, payload)
}

/**
 * Fetch notifications for the currently authenticated user.
 */
export async function fetchNotificationsViaApi(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/notifications')
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  })
}

/**
 * Fetch unread notification count for the currently authenticated user.
 */
export async function fetchUnreadCountViaApi(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch('/api/notifications/unread-count')
    if (!response.ok) throw new Error(await response.text())
    const data = await response.json()
    return data.count
  })
}

/**
 * Mark all notifications as read for the currently authenticated user.
 */
export async function markAllNotificationsReadViaApi(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  })
}

/**
 * Update the current user's profile name.
 */
export async function updateProfileViaApi(page: Page, payload: { name: string }) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }, payload)
}

export { expect }
