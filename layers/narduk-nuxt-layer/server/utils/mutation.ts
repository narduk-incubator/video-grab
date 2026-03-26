import type { H3Event } from 'h3'
import { ZodError } from 'zod'
import type { AuthUser } from '#layer/server/utils/auth'
import { requireAdmin, requireAuth } from '#layer/server/utils/auth'
import { requireCronAuth } from '#layer/server/utils/cron'
import type { RateLimitPolicy } from '#layer/server/utils/rateLimit'
import { enforceRateLimitPolicy } from '#layer/server/utils/rateLimit'

type MaybePromise<T> = T | Promise<T>
type MutationBodyValidator<TBody> = (body: unknown) => MaybePromise<TBody>
type MutationAuthResolver<TContext> = (event: H3Event) => MaybePromise<TContext>
export type MutationBodyParser<TBody> = (event: H3Event) => MaybePromise<TBody>
export type MutationRateLimit = RateLimitPolicy

export interface MutationOptions<TBody> {
  parseBody?: MutationBodyParser<TBody>
  rateLimit: MutationRateLimit
}

type MutationContext<TBody> = {
  body: TBody
  event: H3Event
}

function isHttpErrorLike(error: unknown): error is { statusCode: number } {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number',
  )
}

function formatValidationError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ') || 'Invalid request body'
}

function toValidationError(error: unknown) {
  if (isHttpErrorLike(error)) {
    return error
  }

  if (error instanceof ZodError) {
    return createError({
      statusCode: 400,
      statusMessage: `Validation error: ${formatValidationError(error)}`,
    })
  }

  return createError({
    statusCode: 400,
    statusMessage: 'Invalid request body',
  })
}

async function buildMutationContext<TBody, TContext>(
  event: H3Event,
  options: MutationOptions<TBody>,
  resolveAuth: MutationAuthResolver<TContext>,
): Promise<MutationContext<TBody> & TContext> {
  await enforceRateLimitPolicy(event, options.rateLimit)
  const authContext = await resolveAuth(event)
  const body = options.parseBody ? await options.parseBody(event) : (undefined as TBody)

  return {
    event,
    body,
    ...authContext,
  }
}

export async function readValidatedMutationBody<TBody>(
  event: H3Event,
  validate: MutationBodyValidator<TBody>,
): Promise<TBody> {
  try {
    return await validate(await readBody<unknown>(event))
  } catch (error) {
    throw toValidationError(error)
  }
}

export async function readOptionalMutationBody(
  event: H3Event,
  fallback: unknown = {},
): Promise<unknown> {
  try {
    return await readBody<unknown>(event)
  } catch {
    return fallback
  }
}

export async function readOptionalValidatedMutationBody<TBody>(
  event: H3Event,
  validate: MutationBodyValidator<TBody>,
  fallback: unknown = {},
): Promise<TBody> {
  try {
    return await validate(await readOptionalMutationBody(event, fallback))
  } catch (error) {
    throw toValidationError(error)
  }
}

export function withValidatedBody<TBody>(
  validate: MutationBodyValidator<TBody>,
): MutationBodyParser<TBody> {
  return (event) => readValidatedMutationBody(event, validate)
}

export function withOptionalValidatedBody<TBody>(
  validate: MutationBodyValidator<TBody>,
  fallback: unknown = {},
): MutationBodyParser<TBody> {
  return (event) => readOptionalValidatedMutationBody(event, validate, fallback)
}

export function definePublicMutation<TBody = undefined, TResult = unknown>(
  options: MutationOptions<TBody>,
  handler: (context: MutationContext<TBody>) => MaybePromise<TResult>,
) {
  return defineEventHandler(async (event) =>
    handler(await buildMutationContext(event, options, async () => ({}))),
  )
}

export function defineUserMutation<TBody = undefined, TResult = unknown>(
  options: MutationOptions<TBody>,
  handler: (context: MutationContext<TBody> & { user: AuthUser }) => MaybePromise<TResult>,
) {
  return defineEventHandler(async (event) =>
    handler(
      await buildMutationContext(event, options, async () => ({
        user: await requireAuth(event),
      })),
    ),
  )
}

export function defineAdminMutation<TBody = undefined, TResult = unknown>(
  options: MutationOptions<TBody>,
  handler: (context: MutationContext<TBody> & { admin: AuthUser }) => MaybePromise<TResult>,
) {
  return defineEventHandler(async (event) =>
    handler(
      await buildMutationContext(event, options, async () => ({
        admin: await requireAdmin(event),
      })),
    ),
  )
}

export function defineCronMutation<TBody = undefined, TResult = unknown>(
  options: MutationOptions<TBody>,
  handler: (context: MutationContext<TBody>) => MaybePromise<TResult>,
) {
  return defineEventHandler(async (event) =>
    handler(
      await buildMutationContext(event, options, async () => {
        requireCronAuth(event)
        return {}
      }),
    ),
  )
}

export function defineWebhookMutation<TBody = undefined, TResult = unknown>(
  options: MutationOptions<TBody>,
  handler: (context: MutationContext<TBody>) => MaybePromise<TResult>,
) {
  return definePublicMutation(options, handler)
}

export function defineCallbackMutation<TBody = undefined, TResult = unknown>(
  options: MutationOptions<TBody>,
  handler: (context: MutationContext<TBody>) => MaybePromise<TResult>,
) {
  return definePublicMutation(options, handler)
}
