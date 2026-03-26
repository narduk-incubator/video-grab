// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import { sharedConfigs } from '@narduk-enterprises/eslint-config/config'
import {
  importXVueCoreModuleFragment,
  redundantNuxtAutoImportFlatConfig,
} from './eslint-nuxt-flat-fragments.mjs'

export default withNuxt(
  ...sharedConfigs,
  redundantNuxtAutoImportFlatConfig,
  importXVueCoreModuleFragment,
)
