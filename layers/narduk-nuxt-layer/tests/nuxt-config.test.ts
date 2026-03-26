import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const nuxtConfigPath = resolve(import.meta.dirname, '../nuxt.config.ts')
const originalColorModePreference = process.env.NUXT_COLOR_MODE_PREFERENCE
type LayerNuxtConfig = {
  $development?: {
    runtimeConfig?: {
      logLevel?: string
      session?: {
        password?: string
        cookie?: {
          secure?: boolean
        }
      }
    }
  }
  colorMode?: {
    preference?: string
    fallback?: string
  }
  icon?: {
    clientBundle?: unknown
    serverBundle?: unknown
  }
  runtimeConfig?: {
    logLevel?: string
    session?: {
      password?: string
      cookie?: {
        secure?: boolean
      }
    }
  }
}

async function loadNuxtConfig() {
  const previousDefineNuxtConfig = (globalThis as { defineNuxtConfig?: unknown }).defineNuxtConfig
  ;(globalThis as { defineNuxtConfig?: (config: unknown) => unknown }).defineNuxtConfig = (
    config: unknown,
  ) => config

  try {
    vi.resetModules()
    return (await import(nuxtConfigPath)).default as LayerNuxtConfig
  } finally {
    if (previousDefineNuxtConfig) {
      ;(globalThis as { defineNuxtConfig?: unknown }).defineNuxtConfig = previousDefineNuxtConfig
    } else {
      delete (globalThis as { defineNuxtConfig?: unknown }).defineNuxtConfig
    }
  }
}

afterEach(() => {
  if (originalColorModePreference === undefined) {
    delete process.env.NUXT_COLOR_MODE_PREFERENCE
  } else {
    process.env.NUXT_COLOR_MODE_PREFERENCE = originalColorModePreference
  }
})

describe('layer nuxt config', () => {
  it('defaults color mode preference to system', async () => {
    delete process.env.NUXT_COLOR_MODE_PREFERENCE

    const config = await loadNuxtConfig()

    expect(config.colorMode).toMatchObject({
      preference: 'system',
      fallback: 'dark',
    })
  })

  it('allows color mode preference override via env', async () => {
    process.env.NUXT_COLOR_MODE_PREFERENCE = 'light'

    const config = await loadNuxtConfig()

    expect(config.colorMode).toMatchObject({
      preference: 'light',
      fallback: 'dark',
    })
  })

  it('keeps icon rendering compatible with dynamic icon names', async () => {
    const config = await loadNuxtConfig()

    expect(config.icon?.clientBundle).toBeUndefined()
    expect(config.icon?.serverBundle).toEqual({
      collections: ['lucide'],
    })
  })

  it('keeps auth cookies secure by default and relaxes them only in development', async () => {
    const config = await loadNuxtConfig()

    expect(config.runtimeConfig).toMatchObject({
      logLevel: 'warn',
      session: {
        password: '',
        cookie: {
          secure: true,
        },
      },
    })

    expect(config.$development?.runtimeConfig).toMatchObject({
      logLevel: 'debug',
      session: {
        password: 'layer-auth-dev-session-secret-min-32-chars',
        cookie: {
          secure: false,
        },
      },
    })
  })
})
