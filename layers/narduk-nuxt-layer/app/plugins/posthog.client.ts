import { posthog } from 'posthog-js'

export default defineNuxtPlugin(() => {
  const runtimeConfig = useRuntimeConfig()
  const posthogApiKey = runtimeConfig.public.posthogPublicKey
  const posthogHost = runtimeConfig.public.posthogHost
  const appName = (runtimeConfig.public.appName as string) || 'Unknown App'
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  if (!posthogApiKey || import.meta.server || isLocalhost) return

  const posthogClient = posthog.init(posthogApiKey as string, {
    api_host: (posthogHost as string) || 'https://us.i.posthog.com',
    capture_pageview: false, // We'll handle this manually for Nuxt SPA navigation
    capture_pageleave: true,

    // --- Prevent sendBeacon 64KB payload limit ---
    // Disable session recording — biggest payload contributor
    disable_session_recording: true,

    // Use XHR instead of sendBeacon on page unload (avoids 64KB cap entirely)
    // @ts-expect-error: transport exists in modern versions but is sometimes absent from Partial<PostHogConfig> types
    transport: 'XHR',

    loaded: (ph) => {
      if (import.meta.dev) ph.debug()
    },
  })

  // Expose broadly for any legacy integration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy integration global injection
  if (!(window as any).$nuxt) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy integration global injection
    ;(window as any).$nuxt = {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy integration global injection
  ;(window as any).$nuxt.$posthog = posthogClient

  // ---------------------------------------------------------------------------
  // Super properties — registered on every event for easy filtering.
  //
  // PostHog dashboard setup:
  //   Project Settings → "Filter out internal and test users" →
  //     • is_owner — is set        (owner traffic)
  //     • is_internal_user — is set (preview deploy traffic)
  //     • environment — does not equal "production"  (optional)
  //
  // To tag yourself as owner, POST /api/owner-tag with OWNER_TAG_SECRET.
  // ---------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic property bag
  const superProperties: Record<string, any> = { app: appName }

  // Tag preview/staging deploys (.pages.dev URLs)
  if (window.location.hostname.endsWith('.pages.dev')) {
    superProperties.is_internal_user = true
  }

  // Tag owner traffic (cookie set via /api/owner-tag)
  const isOwner = document.cookie.includes('narduk_owner=true')
  superProperties.is_owner = isOwner

  // Correlate traffic with deploy versions
  const appVersion = runtimeConfig.public.appVersion
  if (appVersion) {
    superProperties.app_version = appVersion
  }

  // Environment heuristic: preview (.pages.dev) / development (localhost) / production
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    superProperties.environment = 'development'
  } else if (hostname.endsWith('.pages.dev')) {
    superProperties.environment = 'preview'
  } else {
    superProperties.environment = 'production'
  }

  posthog.register(superProperties)

  // Capture initial pageview since Nuxt router.afterEach does not fire on SSR hydration
  nextTick(() => {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
    })
  })

  // Manual pageview tracking on subsequent route changes
  const router = useRouter()
  router.afterEach((to) => {
    nextTick(() => {
      posthog.capture('$pageview', {
        $current_url: window.location.origin + to.fullPath,
      })
    })
  })

  return {
    provide: {
      posthog: posthogClient,
    },
  }
})
