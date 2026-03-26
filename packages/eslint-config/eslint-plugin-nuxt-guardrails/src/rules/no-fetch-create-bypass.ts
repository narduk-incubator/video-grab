/**
 * Rule: nuxt-guardrails/no-fetch-create-bypass
 *
 * Flags $fetch.create() calls in app/ code. The layer provides a CSRF-safe
 * fetch instance via the fetch.client.ts plugin (globalThis.$fetch override
 * and useNuxtApp().$csrfFetch). Creating a new ofetch instance with
 * $fetch.create() bypasses this injection entirely.
 *
 * The only legitimate use is in `plugins/fetch.client.ts` itself, which is
 * where the layer creates the CSRF-safe wrapper.
 */

import type { Rule } from 'eslint'

export default {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        '$fetch.create() bypasses the layer CSRF header injection — use $csrfFetch instead',
      category: 'Security',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          testMode: { type: 'boolean', default: false },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      fetchCreateBypass:
        "$fetch.create() bypasses the layer's CSRF header injection. Use useNuxtApp().$csrfFetch or the globally patched $fetch instead.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const options = context.options[0] as { testMode?: boolean } | undefined
    const testMode = options?.testMode === true
    const filename = context.filename ?? (context as any).getFilename?.() ?? ''
    const normalized = filename.replace(/\\/g, '/')

    if (!testMode) {
      // Only run on app/ files (composables, pages, components, plugins, etc.)
      if (!normalized.includes('/app/')) return {}
      // Exclude legitimate CSRF-safe wrappers that use $fetch.create()
      if (normalized.includes('plugins/fetch.client.')) return {}
      if (normalized.includes('composables/useCsrfFetch.')) return {}
      // Exclude test files
      if (
        normalized.includes('.test.') ||
        normalized.includes('.spec.') ||
        normalized.includes('e2e/')
      )
        return {}
    }

    return {
      CallExpression(node: any) {
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return

        // Match $fetch.create(...)
        const obj = callee.object
        const prop = callee.property
        if (
          obj?.type === 'Identifier' &&
          obj.name === '$fetch' &&
          prop?.type === 'Identifier' &&
          prop.name === 'create'
        ) {
          context.report({
            node: callee,
            messageId: 'fetchCreateBypass',
          })
        }
      },
    }
  },
}
