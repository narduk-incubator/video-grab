import { resolveControlPlaneProxyPath } from '../../shared/controlPlaneProxy'

/**
 * Global fetch/$fetch interceptor.
 *
 * - Rewrites configured control-plane fleet requests to a same-origin proxy so
 *   browsers never hit cross-origin fleet endpoints directly.
 * - Automatically adds the `X-Requested-With: XMLHttpRequest` header to
 *   same-origin mutation requests to satisfy the shared CSRF middleware.
 */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function getRequestUrl(request: RequestInfo | URL): string | undefined {
  if (typeof request === 'string') return request
  if (request instanceof URL) return request.href
  if (request instanceof Request) return request.url
  return undefined
}

function isSameOriginRequest(requestUrl: string | undefined, currentOrigin: string): boolean {
  if (!requestUrl) return false
  if (requestUrl.startsWith('/')) return true

  try {
    return new URL(requestUrl, currentOrigin).origin === currentOrigin
  } catch {
    return false
  }
}

export default defineNuxtPlugin(() => {
  const runtimeConfig = useRuntimeConfig()
  const controlPlaneUrl = runtimeConfig.public.controlPlaneUrl
  const currentOrigin = window.location.origin
  const originalFetch = window.__NARDUK_NATIVE_FETCH__ || window.fetch.bind(window)

  window.__NARDUK_NATIVE_FETCH__ = originalFetch

  const proxiedFetch: typeof window.fetch = (input, init) => {
    const proxiedUrl = resolveControlPlaneProxyPath(
      getRequestUrl(input),
      controlPlaneUrl,
      currentOrigin,
    )

    if (!proxiedUrl) return originalFetch(input, init)

    if (input instanceof Request) {
      return originalFetch(new Request(proxiedUrl, input), init)
    }

    return originalFetch(proxiedUrl, init)
  }

  window.fetch = proxiedFetch
  globalThis.fetch = proxiedFetch

  const fetchWithCsrf = $fetch.create({
    onRequest(context) {
      const proxiedUrl = resolveControlPlaneProxyPath(
        getRequestUrl(context.request),
        controlPlaneUrl,
        currentOrigin,
      )

      if (proxiedUrl) {
        context.request =
          context.request instanceof Request ? new Request(proxiedUrl, context.request) : proxiedUrl
      }

      const method = (context.options.method || 'GET').toString().toUpperCase()
      if (!MUTATION_METHODS.has(method)) return

      if (!isSameOriginRequest(getRequestUrl(context.request), currentOrigin)) return

      const headers = new Headers((context.options.headers as HeadersInit) || {})
      if (!headers.has('X-Requested-With')) {
        headers.set('X-Requested-With', 'XMLHttpRequest')
      }
      context.options.headers = headers
    },
  })

  globalThis.$fetch = fetchWithCsrf as typeof globalThis.$fetch

  return { provide: { csrfFetch: fetchWithCsrf } }
})
