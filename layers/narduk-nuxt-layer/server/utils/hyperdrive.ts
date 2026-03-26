import type { H3Event } from 'h3'

/**
 * Cloudflare Hyperdrive binding surface (Postgres via `postgres.js` + Drizzle).
 * @see https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/
 */
export type HyperdriveBinding = {
  readonly connectionString: string
}

function cloudflareEnv(event: H3Event): Record<string, unknown> | undefined {
  return event.context.cloudflare?.env as Record<string, unknown> | undefined
}

/**
 * Returns Hyperdrive’s connection string for the binding named in runtime config
 * (`hyperdriveBinding`, default `HYPERDRIVE`).
 *
 * Production: binding comes from wrangler `hyperdrive`.
 * Local `nuxt dev`: use `nitro-cloudflare-dev` with Hyperdrive in wrangler, and set
 * `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` or `localConnectionString`.
 */
export function useHyperdriveConnectionString(event: H3Event): string {
  const { hyperdriveBinding } = useRuntimeConfig()
  const name = hyperdriveBinding || 'HYPERDRIVE'
  const binding = cloudflareEnv(event)?.[name] as HyperdriveBinding | undefined
  const connectionString = binding?.connectionString

  if (!connectionString) {
    throw createError({
      statusCode: 500,
      message: `Hyperdrive binding "${name}" is missing or has no connectionString. Add hyperdrive to wrangler, use wrangler env postgres (or your env name) with NUXT_WRANGLER_ENVIRONMENT for local dev, and set CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${name} or localConnectionString.`,
    })
  }

  return connectionString
}
