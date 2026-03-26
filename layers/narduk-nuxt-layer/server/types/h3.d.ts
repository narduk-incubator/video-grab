import type { Logger } from '../utils/logger'

declare module 'h3' {
  interface H3EventContext {
    /** Per-request Drizzle database instance, memoized by useDatabase(). Backend-agnostic (D1 or PG). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Backend-agnostic: D1 and PG Drizzle instances share no common type.
    _db?: any
    /** Per-request app-level Drizzle database instance, memoized by createAppDatabase(). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Backend-agnostic: app database type depends on dialect chosen at runtime.
    _appDb?: any
    /** Per-request correlation ID, set by requestLogger middleware */
    _requestId?: string
    /** Per-request structured logger, memoized by useLogger() */
    _logger?: Logger
  }
}
