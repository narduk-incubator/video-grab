import type { H3Event } from 'h3'

/**
 * Cloudflare Workers Rate Limiting binding (see `ratelimits` in wrangler.json).
 * Counters are coordinated per PoP (not per-isolate memory). Complements the
 * in-memory limiter below for defense in depth.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
export interface CloudflareRateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

/** Wrangler binding names — must match `ratelimits[].name` in each app. */
export type LayerRateLimitBindingName =
  | 'RL_10'
  | 'RL_20'
  | 'RL_30'
  | 'RL_60'
  | 'RL_120'
  | 'RL_240'
  | 'RL_300'

export type LayerRateLimitEnv = Partial<
  Record<LayerRateLimitBindingName, CloudflareRateLimitBinding>
>

/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Designed for Cloudflare Workers where each isolate has its own memory —
 * this provides per-isolate protection against brute-force/credential-stuffing.
 * When `ratelimits` bindings are configured, `enforceRateLimitPolicy` also
 * calls the platform limiter (per-PoP, shared across isolates in that location).
 *
 * NOTE: The module-scope `buckets` Map is INTENTIONAL. It provides within-isolate
 * rate limiting across requests handled by the same Worker instance. This state
 * is NOT shared across isolates and is lost when the isolate is evicted.
 *
 * Usage:
 *   await enforceRateLimitPolicy(event, RATE_LIMIT_POLICIES.authLogin)
 */

interface RateLimitEntry {
  timestamps: number[]
}

export interface RateLimitPolicy {
  namespace: string
  maxRequests: number
  windowMs: number
}

const MINUTE = 60_000

export const RATE_LIMIT_POLICIES = {
  adminAiModel: { namespace: 'admin-ai-model', maxRequests: 20, windowMs: MINUTE },
  adminSystemPrompts: { namespace: 'admin-system-prompts', maxRequests: 20, windowMs: MINUTE },
  adminUsers: { namespace: 'admin-users', maxRequests: 20, windowMs: MINUTE },
  authLogin: { namespace: 'auth-login', maxRequests: 60, windowMs: MINUTE },
  authRegister: { namespace: 'auth-register', maxRequests: 30, windowMs: MINUTE },
  authChangePassword: { namespace: 'auth-change-password', maxRequests: 30, windowMs: MINUTE },
  authApiKeys: { namespace: 'auth-api-keys', maxRequests: 60, windowMs: MINUTE },
  authLogout: { namespace: 'auth-logout', maxRequests: 30, windowMs: MINUTE },
  authProfile: { namespace: 'auth-profile', maxRequests: 30, windowMs: MINUTE },
  notifications: { namespace: 'notifications', maxRequests: 60, windowMs: MINUTE },
  ownerTag: { namespace: 'owner-tag', maxRequests: 10, windowMs: MINUTE },
  upload: { namespace: 'upload', maxRequests: 60, windowMs: MINUTE },
  indexNowSubmit: { namespace: 'indexnow', maxRequests: 60, windowMs: MINUTE },
  googleIndexingBatch: {
    namespace: 'google-indexing-batch',
    maxRequests: 60,
    windowMs: MINUTE,
  },
  googleIndexingPublish: {
    namespace: 'google-indexing-publish',
    maxRequests: 120,
    windowMs: MINUTE,
  },
  googleIndexingStatus: {
    namespace: 'google-indexing-status',
    maxRequests: 240,
    windowMs: MINUTE,
  },
  showcaseAuthLogin: { namespace: 'auth-login', maxRequests: 60, windowMs: MINUTE },
  showcaseAuthLoginTest: { namespace: 'auth-login-test', maxRequests: 300, windowMs: MINUTE },
} as const satisfies Record<string, RateLimitPolicy>

const buckets = new Map<string, Map<string, RateLimitEntry>>()
let cleanupCounter = 0

/** Maps policy maxRequests (per minute) to a wrangler `ratelimits` binding. */
const RATE_LIMIT_BINDING_BY_MAX: Partial<Record<number, LayerRateLimitBindingName>> = {
  10: 'RL_10',
  20: 'RL_20',
  30: 'RL_30',
  60: 'RL_60',
  120: 'RL_120',
  240: 'RL_240',
  300: 'RL_300',
}

function getCloudflareRateLimiter(
  event: H3Event,
  policy: RateLimitPolicy,
): CloudflareRateLimitBinding | null {
  const bindingName = RATE_LIMIT_BINDING_BY_MAX[policy.maxRequests]
  if (!bindingName) return null

  const env = event.context.cloudflare?.env as LayerRateLimitEnv | undefined
  const limiter = env?.[bindingName]
  return limiter ?? null
}

function getClientIp(event: H3Event): string {
  return (
    getHeader(event, 'cf-connecting-ip') ||
    getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  )
}

/**
 * Enforce a rate limit for the given namespace.
 *
 * @param event - H3 event
 * @param namespace - e.g. 'auth', 'api'
 * @param maxRequests - max requests allowed in the window
 * @param windowMs - sliding window duration in milliseconds
 * @throws 429 Too Many Requests if the limit is exceeded
 */
export async function enforceRateLimit(
  event: H3Event,
  namespace: string,
  maxRequests: number,
  windowMs: number,
): Promise<void> {
  const ip = getClientIp(event)
  const key = `${namespace}:${ip}`

  if (!buckets.has(namespace)) {
    buckets.set(namespace, new Map())
  }

  const bucket = buckets.get(namespace)!
  const now = Date.now()
  const cutoff = now - windowMs

  let entry = bucket.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    bucket.set(key, entry)
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= maxRequests) {
    const retryAfter = Math.ceil((entry.timestamps[0]! + windowMs - now) / 1000)
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
    })
  }

  entry.timestamps.push(now)

  // Deterministic cleanup: remove stale entries every 100 requests
  cleanupCounter++
  if (cleanupCounter % 100 === 0) {
    for (const [k, v] of bucket) {
      if (v.timestamps.every((t) => t <= cutoff)) {
        bucket.delete(k)
      }
    }
  }
}

async function enforceCloudflareRateLimit(event: H3Event, policy: RateLimitPolicy): Promise<void> {
  const limiter = getCloudflareRateLimiter(event, policy)
  if (!limiter) return

  const ip = getClientIp(event)
  const key = `${policy.namespace}:${ip}`
  const { success } = await limiter.limit({ key })

  if (!success) {
    const retryAfterSec = Math.max(1, Math.ceil(policy.windowMs / 1000))
    setResponseHeader(event, 'Retry-After', retryAfterSec)
    throw createError({
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
    })
  }
}

export async function enforceRateLimitPolicy(
  event: H3Event,
  policy: RateLimitPolicy,
): Promise<void> {
  await enforceCloudflareRateLimit(event, policy)
  await enforceRateLimit(event, policy.namespace, policy.maxRequests, policy.windowMs)
}
