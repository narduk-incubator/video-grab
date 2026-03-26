import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const layerRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // Match layer default build (D1); Postgres builds set NUXT_DATABASE_BACKEND=postgres in Nuxt.
      '#layer/orm-tables': resolve(layerRoot, 'server/database/schema.ts'),
    },
  },
  test: {
    // Server-only unit tests — no Nuxt/Vue runtime needed
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['server/**/*.ts'],
      exclude: ['server/database/schema.ts', 'server/database/pg-schema.ts', 'server/types/**'],
      thresholds: {
        lines: 22,
        functions: 28,
        branches: 21,
        statements: 22,
      },
    },
  },
})
