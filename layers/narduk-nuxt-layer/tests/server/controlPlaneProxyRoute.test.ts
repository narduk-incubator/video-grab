import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockEvent {
  method: string
  context: {
    params?: {
      path?: string | string[]
    }
  }
}

const mockFetch = vi.fn()
const mockGetRequestURL = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: (event: MockEvent) => unknown) => fn)
vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('getRequestURL', mockGetRequestURL)
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    controlPlaneUrl: 'https://control-plane.nard.uk',
  },
}))
vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) =>
  Object.assign(new Error(input.statusMessage), input),
)

describe('control-plane proxy route', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    mockGetRequestURL.mockReset()
  })

  it('proxies fleet GET requests through the configured control-plane origin', async () => {
    mockGetRequestURL.mockReturnValue(
      new URL('https://bluebonnet-status.example.com/api/control-plane/fleet/posthog/app?days=30'),
    )
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const handler = (await import('../../server/api/control-plane/[...path]')).default as (
      event: MockEvent,
    ) => Promise<Response>

    const response = await handler({
      method: 'GET',
      context: {
        params: {
          path: 'fleet/posthog/app',
        },
      },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      new URL('https://control-plane.nard.uk/api/fleet/posthog/app?days=30'),
      { method: 'GET' },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('rejects non-fleet paths', async () => {
    mockGetRequestURL.mockReturnValue(
      new URL('https://bluebonnet-status.example.com/api/control-plane/admin/secret'),
    )

    const handler = (await import('../../server/api/control-plane/[...path]')).default as (
      event: MockEvent,
    ) => Promise<Response>

    await expect(
      handler({
        method: 'GET',
        context: {
          params: {
            path: 'admin/secret',
          },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects mutation methods', async () => {
    mockGetRequestURL.mockReturnValue(
      new URL('https://bluebonnet-status.example.com/api/control-plane/fleet/posthog/app'),
    )

    const handler = (await import('../../server/api/control-plane/[...path]')).default as (
      event: MockEvent,
    ) => Promise<Response>

    await expect(
      handler({
        method: 'POST',
        context: {
          params: {
            path: 'fleet/posthog/app',
          },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 405 })
  })
})
