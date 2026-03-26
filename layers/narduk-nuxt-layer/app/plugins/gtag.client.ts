/**
 * Google Analytics 4 (gtag.js) — client-only plugin.
 *
 * Loads the GA4 measurement script and tracks SPA page navigations.
 * Set GA_MEASUREMENT_ID in your .env to activate.
 *
 * CRITICAL: The gtag() function MUST use `dataLayer.push(arguments)`, NOT
 * `dataLayer.push([...args])`. The gtag.js library only processes Arguments
 * objects as command tuples — regular Arrays are silently ignored.
 */

function isLocalAnalyticsHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h === '::1' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local')
  )
}

export default defineNuxtPlugin(() => {
  const runtimeConfig = useRuntimeConfig()
  const measurementId = runtimeConfig.public.gaMeasurementId

  if (!measurementId || import.meta.server) return

  if (isLocalAnalyticsHost(window.location.hostname)) {
    return
  }

  window.dataLayer = window.dataLayer || []

  // Must push the real `arguments` object — a rest-parameter Array is not replayed
  // the same way by gtag.js. Outer type is variadic so call sites typecheck.
  const gtag: (...args: unknown[]) => void = function () {
    // eslint-disable-next-line prefer-rest-params -- gtag.js only accepts the Arguments object; rest arrays are ignored
    window.dataLayer.push(arguments as unknown as IArguments)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- gtag must be attached to window for GA4 to pick it up; no type definition exists
  ;(window as any).gtag = gtag

  gtag('js', new Date())
  gtag('config', measurementId)

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  // SPA navigations — initial page_view comes from gtag('config') above; skip
  // the first afterEach so we do not double-count the landing URL.
  const router = useRouter()
  let isFirstNavigation = true
  router.afterEach((to) => {
    if (isFirstNavigation) {
      isFirstNavigation = false
      return
    }
    nextTick(() => {
      gtag('config', measurementId, {
        page_path: to.fullPath,
        page_location: window.location.origin + to.fullPath,
        page_title: document.title,
      })
    })
  })
})

declare global {
  interface Window {
    dataLayer: IArguments[]
  }
}
