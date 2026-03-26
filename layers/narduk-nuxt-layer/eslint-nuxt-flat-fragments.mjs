// @ts-check
/**
 * Shared ESLint flat-config fragments for Nuxt apps extending this layer.
 * Consumed by `eslint.config.mjs` here, `packages/eslint-config`, and synced fleet apps.
 */
import redundantNuxtAutoImport from './eslint-plugin-redundant-nuxt-auto-import.mjs'

/** @see packages/eslint-config (historical); keep in sync when editing. */
export const importXVueCoreModuleFragment = {
  files: ['**/*.ts', '**/*.mts', '**/*.vue'],
  settings: {
    'import-x/core-modules': ['vue'],
  },
}

export const redundantNuxtAutoImportFlatConfig = {
  files: ['**/*.vue', '**/*.ts', '**/*.mts'],
  plugins: {
    'nuxt-redundant-auto-import': redundantNuxtAutoImport,
  },
  rules: {
    'nuxt-redundant-auto-import/no-redundant-auto-import': 'warn',
  },
}
