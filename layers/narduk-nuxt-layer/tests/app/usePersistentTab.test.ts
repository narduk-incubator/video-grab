import { describe, expect, it } from 'vitest'
import {
  buildPersistentTabStorageKey,
  normalizePersistentTabValue,
} from '../../app/utils/persistentTab'

describe('normalizePersistentTabValue', () => {
  it('matches query strings back to numeric tab values', () => {
    expect(
      normalizePersistentTabValue({
        candidate: '2',
        values: [1, 2, 3],
      }),
    ).toBe(2)
  })

  it('uses the first entry from array-based query params', () => {
    expect(
      normalizePersistentTabValue({
        candidate: ['activity', 'billing'],
        values: ['overview', 'activity', 'billing'],
      }),
    ).toBe('activity')
  })

  it('falls back when the requested tab is invalid', () => {
    expect(
      normalizePersistentTabValue({
        candidate: 'missing',
        values: ['overview', 'settings'],
        fallbackValue: 'overview',
      }),
    ).toBe('overview')
  })

  it('accepts raw strings when no whitelist is provided', () => {
    expect(
      normalizePersistentTabValue({
        candidate: 'preview',
      }),
    ).toBe('preview')
  })
})

describe('buildPersistentTabStorageKey', () => {
  it('namespaces tab state by route path and local key', () => {
    expect(buildPersistentTabStorageKey('/settings/profile', 'account-tabs')).toBe(
      'narduk:tabs:/settings/profile:account-tabs',
    )
  })
})
