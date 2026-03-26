// @ts-check
// Wraps @narduk-enterprises/eslint-config; Nuxt patches live in the layer (synced to fleet).
import {
  sharedConfigs as upstreamSharedConfigs,
  nardukPlugin,
} from '@narduk-enterprises/eslint-config/config'
import {
  importXVueCoreModuleFragment,
  redundantNuxtAutoImportFlatConfig,
} from '../../layers/narduk-nuxt-layer/eslint-nuxt-flat-fragments.mjs'

export { nardukPlugin }
export {
  importXVueCoreModuleFragment,
  redundantNuxtAutoImportFlatConfig,
} from '../../layers/narduk-nuxt-layer/eslint-nuxt-flat-fragments.mjs'

export const sharedConfigs = [
  ...upstreamSharedConfigs,
  redundantNuxtAutoImportFlatConfig,
  importXVueCoreModuleFragment,
]
