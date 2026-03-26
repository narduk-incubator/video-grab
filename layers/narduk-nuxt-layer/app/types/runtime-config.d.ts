/**
 * RuntimeConfig type augmentation.
 *
 * Provides full type safety for `useRuntimeConfig()` across the layer and
 * all downstream apps. Eliminates the need for `as any` or `as string` casts.
 */
declare module 'nuxt/schema' {
  interface RuntimeConfig {
    /** Primary SQL backend for app code that branches on storage (default `d1`). */
    databaseBackend: 'd1' | 'postgres'
    /** Wrangler Hyperdrive binding name; used by `useHyperdriveConnectionString`. */
    hyperdriveBinding: string
    googleServiceAccountKey: string
    posthogApiKey: string
    gaPropertyId: string
    posthogProjectId: string
    ownerTagSecret: string
    /** Server-only PostHog distinct id for owner-tagged browsers; optional. */
    posthogOwnerDistinctId: string
  }

  interface PublicRuntimeConfig {
    appUrl: string
    appName: string
    appVersion: string
    controlPlaneUrl: string
    posthogPublicKey: string
    posthogHost: string
    gaMeasurementId: string
    indexNowKey: string
    cspScriptSrc: string
    cspConnectSrc: string
    cspFrameSrc: string
    cspWorkerSrc: string
    /** Set at build time for "latest build" checks (e.g. CI or curl script). */
    buildVersion: string
    /** ISO string set at build time. */
    buildTime: string
  }
}

declare global {
  interface Window {
    __NARDUK_BUILD__?:
      | {
          appName: string
          appVersion: string
          buildVersion: string
          buildTime: string
          localBuildTime?: string
        }
      | undefined
    __NARDUK_BUILD_LOGGED__?: string | undefined
    __NARDUK_NATIVE_FETCH__?: typeof fetch
  }
}

export {}
