import type { PostHog } from 'posthog-js'

/**
 * Client-side PostHog helper. Prefer this over `window.$nuxt.$posthog` or raw
 * `posthog` imports so calls no-op when analytics is disabled (no key, SSR,
 * localhost).
 */
export function usePosthog() {
  const client = import.meta.client ? (useNuxtApp().$posthog as PostHog | undefined) : undefined

  return {
    /** Raw posthog-js instance when initialized; otherwise undefined. */
    client: client ?? null,
    capture: (event: string, properties?: Record<string, unknown>) => {
      client?.capture(event, properties)
    },
    identify: (distinctId: string, properties?: Record<string, unknown>) => {
      client?.identify(distinctId, properties)
    },
    reset: () => {
      client?.reset()
    },
  }
}
