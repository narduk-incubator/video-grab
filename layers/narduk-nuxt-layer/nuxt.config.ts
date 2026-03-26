import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

function readPackageVersion(): string {
  const candidates = [
    resolve(process.cwd(), 'apps/web/package.json'),
    resolve(process.cwd(), 'package.json'),
  ]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue

    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf-8')) as { version?: string }
      if (parsed.version) return parsed.version
    } catch {
      // Ignore malformed or unreadable package manifests and fall through.
    }
  }

  return ''
}

function readGitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const appVersion =
  process.env.APP_VERSION || process.env.npm_package_version || readPackageVersion()
const buildVersion =
  process.env.BUILD_VERSION ||
  process.env.GITHUB_SHA?.slice(0, 12) ||
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ||
  readGitSha() ||
  appVersion
const buildTime = process.env.BUILD_TIME || new Date().toISOString()
const colorModePreference = process.env.NUXT_COLOR_MODE_PREFERENCE || 'system'
export default defineNuxtConfig({
  alias: {
    '#layer': fileURLToPath(new URL('./', import.meta.url)),
  },

  modules: [
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxt/image',
    '@nuxtjs/seo',
    '@nuxt/eslint',
    'nuxt-auth-utils',
  ],
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],

  icon: {
    // Downstream apps frequently resolve icon names dynamically from props, CMS data,
    // or database rows. Keep the client runtime flexible, but serve Lucide from the
    // local Nuxt endpoint so fleet apps never depend on Iconify's public API or CORS.
    provider: 'server',
    fallbackToApi: false,
    serverBundle: {
      collections: ['lucide'],
    },
  },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },

  runtimeConfig: {
    /**
     * `d1` — default; `useDatabase()` uses the D1 `DB` binding.
     * `postgres` — opt into Postgres via Hyperdrive + a Postgres Drizzle schema (see `useHyperdriveConnectionString`).
     */
    databaseBackend: process.env.NUXT_DATABASE_BACKEND === 'postgres' ? 'postgres' : 'd1',
    /** Must match `hyperdrive[].binding` in wrangler (default `HYPERDRIVE`). */
    hyperdriveBinding: process.env.NUXT_HYPERDRIVE_BINDING || 'HYPERDRIVE',
    /** Optional: secret for cron routes (e.g. cache warming). Set CRON_SECRET in Doppler; provisioning sets it. */
    cronSecret: process.env.CRON_SECRET || '',
    ownerTagSecret: process.env.OWNER_TAG_SECRET || '',
    /** Optional shared UUID for PostHog `identify` after `/api/owner-tag` (same value across fleet = one owner person). */
    posthogOwnerDistinctId: process.env.POSTHOG_OWNER_DISTINCT_ID || '',
    /** Log level for server route logging. Supports: debug | info | warn | error | silent. Set LOG_LEVEL in env. */
    logLevel: process.env.LOG_LEVEL || 'warn',
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
      cookie: {
        // `secure: true` for prod; `$development` turns it off for `nuxt dev`. Avoid `import.meta.dev` here (unreliable in nuxt.config — nuxt/nuxt#32098).
        secure: true,
      },
    },
    appleTeamId: process.env.APPLE_TEAM_ID || '',
    appleKeyId: process.env.APPLE_KEY_ID || '',
    appleSecretKey: process.env.APPLE_SECRET_KEY || '',
    mapkitServerApiKey: process.env.MAPKIT_SERVER_API_KEY || '',
    public: {
      mapkitToken: process.env.MAPKIT_TOKEN || '',
      appVersion,
      buildVersion,
      buildTime,
      controlPlaneUrl: process.env.CONTROL_PLANE_URL || '',
      gaMeasurementId: process.env.GA_MEASUREMENT_ID || '',
      posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      cspScriptSrc: process.env.CSP_SCRIPT_SRC || '',
      cspConnectSrc: process.env.CSP_CONNECT_SRC || '',
      cspFrameSrc: process.env.CSP_FRAME_SRC || '',
      cspWorkerSrc: process.env.CSP_WORKER_SRC || '',
    },
  },

  site: {
    name: process.env.APP_NAME || 'Nuxt 4 App',
    description: 'A Nuxt 4 application deployed on Cloudflare Workers.',
  },

  compatibilityDate: '2026-03-03',

  hooks: {
    // Workaround for nuxt/ui#6118: @nuxt/ui@4.5.0 auto-import scanner
    // incorrectly registers 'options' (a parameter name) as an export from useResizable.js
    'imports:extend'(imports) {
      for (let i = imports.length - 1; i >= 0; i--) {
        const entry = imports[i]
        if (
          entry?.name === 'options' &&
          typeof entry.from === 'string' &&
          entry.from.includes('useResizable')
        ) {
          imports.splice(i, 1)
        }
      }
    },
  },

  future: {
    compatibilityVersion: 4,
  },

  $development: {
    runtimeConfig: {
      logLevel: process.env.LOG_LEVEL || 'debug',
      session: {
        password: process.env.NUXT_SESSION_PASSWORD || 'layer-auth-dev-session-secret-min-32-chars',
        cookie: {
          // Safari rejects Secure cookies on local HTTP, so relax this only for `nuxt dev`.
          secure: false,
        },
      },
    },
  },

  ui: {
    colorMode: true,
  },

  // Default follows the OS. Set NUXT_COLOR_MODE_PREFERENCE to light or dark for
  // deterministic SSR, screenshots, or fleet-wide single-theme surfaces.
  colorMode: {
    preference: colorModePreference,
    fallback: 'dark',
  },

  ogImage: {
    enabled: true,
    runtimeCacheStorage: {
      driver: 'memory',
    },
  },

  image: {
    provider: 'cloudflare',
  },

  routeRules: {
    // Redirect legacy iOS apple-touch-icon-precomposed requests to the standard icon
    '/apple-touch-icon-precomposed.png': { redirect: '/apple-touch-icon.png' },
  },

  nitro: {
    preset: 'cloudflare-module',
    imports: {
      // Prevent nuxt-auth-utils password.js from being server-auto-imported;
      // the layer provides its own Web Crypto (PBKDF2) implementations.
      exclude: [/nuxt-auth-utils\/dist\/runtime\/server\/utils\/password/],
    },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    externals: {
      inline: ['drizzle-orm', '@neondatabase/serverless'],
    },
  },

  // Expose the layer configurations and files to consumers
  components: [
    { path: fileURLToPath(new URL('./app/components', import.meta.url)), pathPrefix: false },
  ],
})
