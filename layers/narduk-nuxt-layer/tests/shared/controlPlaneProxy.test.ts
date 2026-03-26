import { describe, expect, it } from 'vitest'

import {
  buildControlPlaneUpstreamUrl,
  normalizeControlPlaneOrigin,
  resolveControlPlaneProxyPath,
} from '../../shared/controlPlaneProxy'

describe('controlPlaneProxy helpers', () => {
  it('normalizes the configured control-plane origin', () => {
    expect(normalizeControlPlaneOrigin('https://control-plane.nard.uk/api/fleet/apps')).toBe(
      'https://control-plane.nard.uk',
    )
    expect(normalizeControlPlaneOrigin('')).toBeNull()
  })

  it('rewrites configured fleet API requests to the same-origin proxy path', () => {
    expect(
      resolveControlPlaneProxyPath(
        'https://control-plane.nard.uk/api/fleet/posthog/bluebonnet-status-online?startDate=2026-02-21',
        'https://control-plane.nard.uk',
        'https://bluebonnet-status.example.com',
      ),
    ).toBe('/api/control-plane/fleet/posthog/bluebonnet-status-online?startDate=2026-02-21')
  })

  it('ignores non-fleet and non-control-plane URLs', () => {
    expect(
      resolveControlPlaneProxyPath(
        'https://control-plane.nard.uk/api/admin/users',
        'https://control-plane.nard.uk',
        'https://bluebonnet-status.example.com',
      ),
    ).toBeNull()

    expect(
      resolveControlPlaneProxyPath(
        'https://example.com/api/fleet/posthog/app',
        'https://control-plane.nard.uk',
        'https://bluebonnet-status.example.com',
      ),
    ).toBeNull()
  })

  it('builds an upstream fleet URL for the server proxy route', () => {
    expect(
      buildControlPlaneUpstreamUrl(
        'fleet/posthog/bluebonnet-status-online',
        '?endDate=2026-03-23',
        'https://control-plane.nard.uk',
      )?.href,
    ).toBe(
      'https://control-plane.nard.uk/api/fleet/posthog/bluebonnet-status-online?endDate=2026-03-23',
    )
  })
})
