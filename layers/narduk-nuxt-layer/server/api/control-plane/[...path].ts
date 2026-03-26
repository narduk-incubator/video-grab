import { buildControlPlaneUpstreamUrl } from '../../../shared/controlPlaneProxy'

const ALLOWED_METHODS = new Set(['GET', 'HEAD'])

export default defineEventHandler(async (event) => {
  const method = event.method.toUpperCase()
  if (!ALLOWED_METHODS.has(method)) {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed',
    })
  }

  const config = useRuntimeConfig(event)
  const requestUrl = getRequestURL(event)
  const upstreamUrl = buildControlPlaneUpstreamUrl(
    event.context.params?.path,
    requestUrl.search,
    config.public.controlPlaneUrl,
  )

  if (!upstreamUrl) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Control plane route is not configured',
    })
  }

  try {
    const response = await fetch(upstreamUrl, { method })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to reach control plane',
    })
  }
})
