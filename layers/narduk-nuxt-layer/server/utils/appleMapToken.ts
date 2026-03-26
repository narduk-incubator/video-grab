/**
 * appleMapToken — Server-side utility for Apple Maps Server API authentication.
 *
 * Two-step auth:
 * 1. Sign a JWT (Maps Auth Token) with ES256 using the Apple private key
 * 2. Exchange it for a Maps Access Token via GET /v1/token
 *
 * The access token is cached in memory until it expires.
 */

import type { H3Event } from 'h3'

interface AppleTokenResponse {
  accessToken: string
  expiresInSeconds?: number
}

interface AppleSearchResult {
  results?: Array<Record<string, unknown>>
  displayMapRegion?: Record<string, unknown>
}

interface AppleGeocodeResult {
  results?: Array<Record<string, unknown>>
}

interface CachedToken {
  accessToken: string
  expiresAt: number // unix ms
}

let cachedToken: CachedToken | null = null

/**
 * Import a PEM-encoded ES256 private key for use with Web Crypto API.
 */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Strip PEM headers and whitespace
  const pemBody = pemKey
    .replaceAll('-----BEGIN PRIVATE KEY-----', '')
    .replaceAll('-----END PRIVATE KEY-----', '')
    .replaceAll('-----BEGIN EC PRIVATE KEY-----', '')
    .replaceAll('-----END EC PRIVATE KEY-----', '')
    .replaceAll(/\s/g, '')

  const binaryStr = atob(pemBody)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/**
 * Base64url encode a buffer or string.
 */
function base64url(input: ArrayBuffer | string): string {
  let str: string
  if (typeof input === 'string') {
    str = btoa(input)
  } else {
    const bytes = new Uint8Array(input)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    str = btoa(binary)
  }
  return str.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/**
 * Generate a Maps Auth Token (JWT) signed with ES256.
 */
async function generateAuthToken(
  privateKey: CryptoKey,
  teamId: string,
  keyId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 1800, // 30 minutes
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput),
  )

  // Convert DER signature to raw r||s format for JWT
  const rawSig = derToRaw(new Uint8Array(signature))
  const encodedSignature = base64url(rawSig.buffer as ArrayBuffer)

  return `${signingInput}.${encodedSignature}`
}

/**
 * Generate a MapKit JS token (JWT) for client-side mapkit.init().
 * Includes origin claim so the token is valid for that domain (e.g. http://localhost:3000).
 * Use the same Apple private key, Team ID, and Key ID as the Server API.
 *
 * @param origin - e.g. "http://localhost:3000" or "https://austin-texas.net"
 * @param expiresInSeconds - token lifetime (default 24h so local dev works without frequent refresh)
 */
export async function generateMapKitJsToken(
  privateKey: CryptoKey,
  teamId: string,
  keyId: string,
  origin: string,
  expiresInSeconds = 86400,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + expiresInSeconds,
    origin,
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput),
  )

  const rawSig = derToRaw(new Uint8Array(signature))
  const encodedSignature = base64url(rawSig.buffer as ArrayBuffer)

  return `${signingInput}.${encodedSignature}`
}

/** True if the string is a JWT whose `exp` is still in the future (MapKit JS bootstrap). */
function isUnexpiredMapKitJwt(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return false
    const payload = JSON.parse(atob(parts[1])) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000
  } catch {
    return false
  }
}

/**
 * Get a MapKit JS token for the given origin (e.g. http://localhost:3000).
 * Uses APPLE_SECRET_KEY, APPLE_TEAM_ID, APPLE_KEY_ID from runtime config when set;
 * otherwise returns a non-expired `public.mapkitToken` (MAPKIT_TOKEN / APPLE_MAPKIT_TOKEN) if present.
 * Use from a server route so the client can pass the token to mapkit.init().
 */
export async function getMapKitJsToken(event: H3Event, origin: string): Promise<string> {
  const config = useRuntimeConfig(event)
  const privateKeyPem = (config as Record<string, string>).appleSecretKey || ''
  const teamId = (config as Record<string, string>).appleTeamId || ''
  const keyId = (config as Record<string, string>).appleKeyId || ''

  if (privateKeyPem && teamId && keyId) {
    const privateKey = await importPrivateKey(privateKeyPem)
    return generateMapKitJsToken(privateKey, teamId, keyId, origin)
  }

  const publicToken = String(
    (config as { public?: { mapkitToken?: string } }).public?.mapkitToken ?? '',
  )
  if (publicToken.startsWith('eyJ') && isUnexpiredMapKitJwt(publicToken)) {
    return publicToken
  }

  throw new Error(
    'MapKit JS: set APPLE_SECRET_KEY, APPLE_TEAM_ID, and APPLE_KEY_ID to sign tokens for this origin, ' +
      'or set a non-expired MAPKIT_TOKEN / APPLE_MAPKIT_TOKEN (JWT) for mapkit.init().',
  )
}

/**
 * Convert a DER-encoded ECDSA signature to raw (r||s) format.
 * Web Crypto may return DER format on some platforms.
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // If it's already 64 bytes, it's raw
  if (der.length === 64) return der

  // Parse DER sequence
  if (der[0] !== 0x30) return der // Not DER, return as-is

  let offset = 2
  const lenByte = der[1]
  if (lenByte === undefined) return der
  if (lenByte & 0x80) offset += lenByte & 0x7f

  // Parse r
  if (der[offset] !== 0x02) return der
  const rLen = der[offset + 1]
  if (rLen === undefined) return der
  offset += 2
  let r = der.slice(offset, offset + rLen)
  offset += rLen

  // Parse s
  if (der[offset] !== 0x02) return der
  const sLen = der[offset + 1]
  if (sLen === undefined) return der
  offset += 2
  let s = der.slice(offset, offset + sLen)

  // Trim leading zeros and pad to 32 bytes
  if (r.length > 32) r = r.slice(r.length - 32)
  if (s.length > 32) s = s.slice(s.length - 32)

  const raw = new Uint8Array(64)
  raw.set(r, 32 - r.length)
  raw.set(s, 64 - s.length)
  return raw
}

/**
 * Exchange a Maps Auth Token for a Maps Access Token.
 */
async function exchangeForAccessToken(authToken: string): Promise<CachedToken> {
  const response = await fetch('https://maps-api.apple.com/v1/token', {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Apple Maps token exchange failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as AppleTokenResponse
  const accessToken = data.accessToken
  const expiresInSeconds = data.expiresInSeconds || 1800

  return {
    accessToken,
    expiresAt: Date.now() + (expiresInSeconds - 60) * 1000, // refresh 60s early
  }
}

/**
 * Get a valid Apple Maps Access Token, refreshing if needed.
 */
export async function getAppleMapsAccessToken(event?: H3Event): Promise<string> {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()

  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken
  }

  // Strategy 1: Use pre-signed JWT from MAPKIT_SERVER_API_KEY (already a Maps Auth Token)
  const preSignedJwt = (config as Record<string, string>).mapkitServerApiKey || ''
  if (preSignedJwt && preSignedJwt.startsWith('eyJ')) {
    cachedToken = await exchangeForAccessToken(preSignedJwt)
    return cachedToken.accessToken
  }

  // Strategy 2: Sign our own JWT using the raw PEM private key
  const privateKeyPem = (config as Record<string, string>).appleSecretKey || ''
  const teamId = (config as Record<string, string>).appleTeamId || ''
  const keyId = (config as Record<string, string>).appleKeyId || ''

  if (!privateKeyPem || !teamId || !keyId) {
    throw new Error(
      'Apple Maps config missing. Need either MAPKIT_SERVER_API_KEY (pre-signed JWT) ' +
        'or APPLE_SECRET_KEY + APPLE_TEAM_ID + APPLE_KEY_ID for PEM signing.',
    )
  }

  const privateKey = await importPrivateKey(privateKeyPem)
  const authToken = await generateAuthToken(privateKey, teamId, keyId)
  cachedToken = await exchangeForAccessToken(authToken)

  return cachedToken.accessToken
}

/**
 * Search Apple Maps Server API.
 */
export async function searchAppleMaps(
  query: string,
  options?: {
    lat?: number
    lng?: number
    categories?: string[]
    limit?: number
  },
): Promise<AppleSearchResult> {
  const accessToken = await getAppleMapsAccessToken()

  const params = new URLSearchParams({
    q: query,
    resultTypeFilter: 'Poi',
  })

  if (options?.lat && options?.lng) {
    params.set('searchLocation', `${options.lat},${options.lng}`)
  }

  if (options?.categories?.length) {
    params.set('includePoiCategories', options.categories.join(','))
  }

  if (options?.limit) {
    params.set('limit', String(options.limit))
  }

  const url = `https://maps-api.apple.com/v1/search?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Apple Maps search failed (${response.status}): ${body}`)
  }

  return response.json()
}

/**
 * Geocode an address string using Apple Maps Server API.
 * Uses /v1/geocode with an optional search region hint.
 */
export async function geocodeAppleMaps(
  address: string,
  options?: {
    searchRegion?: string // "northLat,eastLng,southLat,westLng"
    limitToCountries?: string
  },
): Promise<AppleGeocodeResult> {
  const accessToken = await getAppleMapsAccessToken()

  const params = new URLSearchParams({ q: address })

  if (options?.searchRegion) {
    params.set('searchRegion', options.searchRegion)
  }

  if (options?.limitToCountries) {
    params.set('limitToCountries', options.limitToCountries)
  }

  const url = `https://maps-api.apple.com/v1/geocode?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Apple Maps geocode failed (${response.status}): ${body}`)
  }

  return response.json()
}

/**
 * Search Apple Maps for neighborhood/sub-locality addresses.
 * Uses resultTypeFilter=Address for area-level results.
 *
 * @param name - Neighborhood or sub-locality name to search
 * @param options - Optional search region and location context
 * @param options.locationContext - City/region qualifier appended to the query (e.g. "Austin, TX").
 *                                  Defaults to empty string so results aren't pinned to a specific city.
 * @param options.limitToCountries - ISO 3166-1 alpha-2 country code (defaults to 'US')
 */
export async function searchAppleMapsNeighborhood(
  name: string,
  options?: {
    searchRegion?: string
    locationContext?: string
    limitToCountries?: string
  },
): Promise<AppleSearchResult> {
  const accessToken = await getAppleMapsAccessToken()

  const query = options?.locationContext ? `${name}, ${options.locationContext}` : name

  const params = new URLSearchParams({
    q: query,
    resultTypeFilter: 'Address',
    includeAddressCategories: 'SubLocality',
    limitToCountries: options?.limitToCountries ?? 'US',
  })

  if (options?.searchRegion) {
    params.set('searchRegion', options.searchRegion)
  }

  const url = `https://maps-api.apple.com/v1/search?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Apple Maps neighborhood search failed (${response.status}): ${body}`)
  }

  return response.json()
}
