import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCookie = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: (event: unknown) => unknown) => fn)

vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

vi.stubGlobal('getCookie', mockGetCookie)

describe('posthog-bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetCookie.mockReset()
  })

  it('returns distinct id when owner cookie is set and config is present', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      posthogOwnerDistinctId: '550e8400-e29b-41d4-a716-446655440000',
    }))
    mockGetCookie.mockImplementation((_e, name) => (name === 'narduk_owner' ? 'true' : undefined))

    const handler = (await import('../../server/api/owner/posthog-bootstrap.get')).default as (
      event: unknown,
    ) => { distinctId: string }

    expect(handler({})).toEqual({
      distinctId: '550e8400-e29b-41d4-a716-446655440000',
    })
  })

  it('throws 403 without owner cookie', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      posthogOwnerDistinctId: '550e8400-e29b-41d4-a716-446655440000',
    }))
    mockGetCookie.mockReturnValue()

    const handler = (await import('../../server/api/owner/posthog-bootstrap.get')).default as (
      event: unknown,
    ) => unknown

    expect(() => handler({})).toThrow('Owner cookie required')
  })

  it('throws 501 when distinct id is not configured', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      posthogOwnerDistinctId: '',
    }))
    mockGetCookie.mockImplementation((_e, name) => (name === 'narduk_owner' ? 'true' : undefined))

    const handler = (await import('../../server/api/owner/posthog-bootstrap.get')).default as (
      event: unknown,
    ) => unknown

    expect(() => handler({})).toThrow('POSTHOG_OWNER_DISTINCT_ID')
  })
})
