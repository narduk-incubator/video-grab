import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Server-only unit tests — no Nuxt/Vue runtime needed
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['server/**/*.ts'],
      exclude: ['server/database/schema.ts', 'server/types/**'],
      thresholds: {
        lines: 22,
        functions: 28,
        branches: 21,
        statements: 22,
      },
    },
  },
})
