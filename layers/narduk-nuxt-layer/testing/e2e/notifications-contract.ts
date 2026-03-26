import {
  createUniqueEmail,
  expect,
  fetchNotificationsViaApi,
  fetchUnreadCountViaApi,
  loginAsAdmin,
  markAllNotificationsReadViaApi,
  registerAndLogin,
  test,
  waitForBaseUrlReady,
  waitForHydration,
  warmUpApp,
} from './fixtures.ts'

/**
 * Shared notification API contract.
 *
 * Tests the /api/notifications/* endpoints that the layer provides.
 * Apps invoke this with minimal config to verify they inherit working
 * notification routes.
 *
 * Usage:
 *   import { defineSharedNotificationsContract } from '…/testing/e2e/notifications-contract.ts'
 *   defineSharedNotificationsContract({ appName: 'myapp' })
 */

interface SharedNotificationsContractOptions {
  appName?: string
  basePath?: string
}

export function defineSharedNotificationsContract(
  options: SharedNotificationsContractOptions = {},
) {
  const { appName = 'app', basePath = '/' } = options

  test.describe(`${appName} shared notifications contract`, () => {
    test.describe.configure({ mode: 'serial' })

    test.beforeAll(async ({ browser, baseURL }) => {
      if (!baseURL) {
        throw new Error('Shared notifications contract requires Playwright baseURL.')
      }
      await waitForBaseUrlReady(baseURL)
      await warmUpApp(browser, baseURL, basePath)
    })

    test('GET /api/notifications requires authentication', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const status = await page.evaluate(async () => {
        const response = await fetch('/api/notifications')
        return response.status
      })

      expect(status).toBe(401)
    })

    test('GET /api/notifications/unread-count requires authentication', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const status = await page.evaluate(async () => {
        const response = await fetch('/api/notifications/unread-count')
        return response.status
      })

      expect(status).toBe(401)
    })

    test('authenticated user can fetch notifications', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const email = createUniqueEmail(`${appName}-notif`)
      await registerAndLogin(page, { name: 'Notif User', email, password: 'password123' })

      const data = await fetchNotificationsViaApi(page)

      expect(data).toHaveProperty('notifications')
      expect(Array.isArray(data.notifications)).toBe(true)
    })

    test('authenticated user can fetch unread count', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const email = createUniqueEmail(`${appName}-count`)
      await registerAndLogin(page, { name: 'Count User', email, password: 'password123' })

      const count = await fetchUnreadCountViaApi(page)

      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(0)
    })

    test('seeded admin user has unread notifications', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      await loginAsAdmin(page)

      const count = await fetchUnreadCountViaApi(page)
      expect(count).toBeGreaterThan(0)

      const data = await fetchNotificationsViaApi(page)
      expect(data.notifications.length).toBeGreaterThan(0)

      // Verify notification shape
      const notification = data.notifications[0]
      expect(notification).toHaveProperty('id')
      expect(notification).toHaveProperty('title')
      expect(notification).toHaveProperty('body')
      expect(notification).toHaveProperty('kind')
      expect(notification).toHaveProperty('isRead')
      expect(notification).toHaveProperty('createdAt')
    })

    test('mark-all-read clears unread count', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      await loginAsAdmin(page)

      const countBefore = await fetchUnreadCountViaApi(page)
      expect(countBefore).toBeGreaterThan(0)

      await markAllNotificationsReadViaApi(page)

      const countAfter = await fetchUnreadCountViaApi(page)
      expect(countAfter).toBe(0)
    })

    test('PATCH /api/notifications/:id marks single notification as read', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      await loginAsAdmin(page)

      const countBefore = await fetchUnreadCountViaApi(page)
      expect(countBefore).toBeGreaterThan(0)

      const data = await fetchNotificationsViaApi(page)
      const unread = data.notifications.find((n: { isRead: boolean }) => !n.isRead)

      expect(unread).toBeDefined()

      const response = await page.evaluate(async (id: string) => {
        const response = await fetch(`/api/notifications/${id}`, {
          method: 'PATCH',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        return response.status
      }, unread!.id)

      expect(response).toBe(200)

      const countAfter = await fetchUnreadCountViaApi(page)
      expect(countAfter).toBeLessThanOrEqual(countBefore - 1)
    })

    test('DELETE /api/notifications/:id requires authentication', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const status = await page.evaluate(async () => {
        const response = await fetch('/api/notifications/fake-id', {
          method: 'DELETE',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        return response.status
      })

      expect(status).toBe(401)
    })

    test('POST /api/notifications/read-all requires authentication', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const status = await page.evaluate(async () => {
        const response = await fetch('/api/notifications/read-all', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        return response.status
      })

      expect(status).toBe(401)
    })
  })
}
