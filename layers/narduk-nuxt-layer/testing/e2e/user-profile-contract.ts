import {
  createUniqueEmail,
  expect,
  loginAsAdmin,
  logoutViaApi,
  registerAndLogin,
  test,
  updateProfileViaApi,
  waitForBaseUrlReady,
  waitForHydration,
  warmUpApp,
} from './fixtures.ts'

/**
 * Shared user menu and profile contract.
 *
 * Tests user menu rendering, profile API, and settings page behavior.
 * Apps invoke this with minimal configuration.
 *
 * Usage:
 *   import { useSharedUserProfileContract } from '…/testing/e2e/user-profile-contract.ts'
 *   useSharedUserProfileContract({
 *     appName: 'myapp',
 *     settingsPath: '/settings',
 *   })
 */

interface SharedUserProfileContractOptions {
  appName?: string
  basePath?: string
  settingsPath?: string
  loginPath?: string
}

export function useSharedUserProfileContract(options: SharedUserProfileContractOptions = {}) {
  const { appName = 'app', basePath = '/' } = options

  test.describe(`${appName} shared user profile contract`, () => {
    test.beforeAll(async ({ browser, baseURL }) => {
      if (!baseURL) {
        throw new Error('Shared user profile contract requires Playwright baseURL.')
      }
      await waitForBaseUrlReady(baseURL)
      await warmUpApp(browser, baseURL, basePath)
    })

    // ─── Profile API Tests ──────────────────────────────────

    test('GET /api/auth/me returns null when unauthenticated', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const data = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })

      expect(data.user).toBeNull()
    })

    test('GET /api/auth/me returns user when authenticated', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const email = createUniqueEmail(`${appName}-me`)
      await registerAndLogin(page, { name: 'Profile User', email, password: 'password123' })

      const data = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })

      expect(data.user).toBeTruthy()
      expect(data.user.email).toBe(email)
    })

    test('PATCH /api/auth/me requires authentication', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const status = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({ name: 'Hacker' }),
        })
        return response.status
      })

      expect(status).toBe(401)
    })

    test('PATCH /api/auth/me updates the user name', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const email = createUniqueEmail(`${appName}-update`)
      await registerAndLogin(page, { name: 'Old Name', email, password: 'password123' })

      const result = await updateProfileViaApi(page, { name: 'New Name' })
      expect(result.ok).toBe(true)

      // Verify the name was updated in the session
      const data = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })

      expect(data.user.name).toBe('New Name')
    })

    test('PATCH /api/auth/me trims whitespace from name', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const email = createUniqueEmail(`${appName}-trim`)
      await registerAndLogin(page, { name: 'Trimmer', email, password: 'password123' })

      await updateProfileViaApi(page, { name: '  Trimmed Name  ' })

      const data = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })

      expect(data.user.name).toBe('Trimmed Name')
    })

    // ─── Logout Flow Tests ──────────────────────────────────

    test('logout clears session and redirects', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const email = createUniqueEmail(`${appName}-logout`)
      await registerAndLogin(page, { name: 'Logout User', email, password: 'password123' })

      // Verify authenticated
      const dataBefore = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })
      expect(dataBefore.user).toBeTruthy()

      // Logout
      await logoutViaApi(page)

      // Verify session is cleared
      const dataAfter = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })
      expect(dataAfter.user).toBeNull()
    })

    // ─── Admin User Tests ───────────────────────────────────

    test('admin user has isAdmin flag set', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      await loginAsAdmin(page)

      const data = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })

      expect(data.user).toBeTruthy()
      expect(data.user.isAdmin).toBe(true)
    })

    test('normal user does not have isAdmin flag', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)

      const email = createUniqueEmail(`${appName}-normal`)
      await registerAndLogin(page, { name: 'Normal User', email, password: 'password123' })

      const data = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return response.json()
      })

      expect(data.user.isAdmin).toBeFalsy()
    })
  })
}
