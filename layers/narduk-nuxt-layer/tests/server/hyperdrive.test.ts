import { describe, it, expect, vi } from 'vitest'
import { useHyperdriveConnectionString } from '../../server/utils/hyperdrive'

vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

vi.stubGlobal('useRuntimeConfig', () => ({
  hyperdriveBinding: 'HYPERDRIVE',
}))

describe('useHyperdriveConnectionString', () => {
  it('throws when binding is missing', () => {
    const event = { context: { cloudflare: { env: {} } } }
    expect(() => useHyperdriveConnectionString(event as never)).toThrow(
      'Hyperdrive binding "HYPERDRIVE" is missing',
    )
  })

  it('throws when cloudflare context is absent', () => {
    const event = { context: {} }
    expect(() => useHyperdriveConnectionString(event as never)).toThrow(
      'Hyperdrive binding "HYPERDRIVE" is missing',
    )
  })

  it('returns connectionString when binding is present', () => {
    const event = {
      context: {
        cloudflare: {
          env: {
            HYPERDRIVE: { connectionString: 'postgres://localhost:5432/app' },
          },
        },
      },
    }
    expect(useHyperdriveConnectionString(event as never)).toBe('postgres://localhost:5432/app')
  })

  it('uses custom binding name from runtime config', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      hyperdriveBinding: 'MY_PG',
    }))
    const event = {
      context: {
        cloudflare: {
          env: {
            MY_PG: { connectionString: 'postgres://example/db' },
          },
        },
      },
    }
    expect(useHyperdriveConnectionString(event as never)).toBe('postgres://example/db')
  })
})
