import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'

export function requireCronAuth(event: H3Event) {
  const runtimeConfig = useRuntimeConfig(event)

  if (!runtimeConfig.cronSecret) {
    if (import.meta.dev) {
      return
    }

    throw createError({
      statusCode: 500,
      message: 'CRON_SECRET is not configured.',
    })
  }

  const authorization = getHeader(event, 'authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '').trim()
  if (token !== runtimeConfig.cronSecret) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized cron request.',
    })
  }
}
