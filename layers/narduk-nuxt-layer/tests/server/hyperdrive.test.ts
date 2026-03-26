import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useHyperdriveConnectionString } from '../../server/utils/hyperdrive'

vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

const mockUseRuntimeConfig = vi.fn(() => ({
  hyperdriveBinding: 'HYPERDRIVE',
}))
vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)

describe('useHyperdriveConnectionString', () => {
  beforeEach(() => {
    mockUseRuntimeConfig.mockReturnValue({ hyperdriveBinding: 'HYPERDRIVE' })
  })

  it('throws when binding is missing', () => {
    const event = { context: { cloudflare: { env: {} } } }
    expect(() => useHyperdriveConnectionString(event as never)).toThrow(
      'Hyperdrive binding "HYPERDRIVE" is missing',
    )
  })

  it('throws when cloudflare env is absent', () => {
    const event = { context: {} }
    expect(() => useHyperdriveConnectionString(event as never)).toThrow(
      'Hyperdrive binding "HYPERDRIVE" is missing',
    )
  })

  it('returns connection string from default binding', () => {
    const event = {
      context: {
        cloudflare: {
          env: { HYPERDRIVE: { connectionString: 'postgres://localhost:5432/app' } },
        },
      },
    }
    expect(useHyperdriveConnectionString(event as never)).toBe('postgres://localhost:5432/app')
  })

  it('respects custom hyperdriveBinding in runtime config', () => {
    mockUseRuntimeConfig.mockReturnValue({ hyperdriveBinding: 'MY_PG' })
    const event = {
      context: {
        cloudflare: {
          env: { MY_PG: { connectionString: 'postgres://example/db' } },
        },
      },
    }
    expect(useHyperdriveConnectionString(event as never)).toBe('postgres://example/db')
  })
})
