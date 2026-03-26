/**
 * Rule: nuxt-guardrails/require-csrf-header-on-mutations
 *
 * Flags $fetch() calls in composables that use a mutation method (POST, PUT,
 * PATCH, DELETE) without including the `X-Requested-With` CSRF header.
 *
 * Agents commonly write API wrapper composables with raw $fetch and forget that
 * the layer's globalThis.$fetch override only works at runtime — composable
 * source code that passes explicit headers may clobber the injected ones, and
 * some patterns (e.g. $fetch.create) bypass injection entirely.
 *
 * Preferred fixes (in order):
 * 1. Use `useCsrfFetch()` — auto-injects the header on mutations.
 * 2. Use `useAppFetch()` — same, plus SSR cookie forwarding for stores.
 * 3. Manually include `'X-Requested-With': 'XMLHttpRequest'` in headers.
 */

import type { Rule } from 'eslint'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function isMutationMethod(node: any): boolean {
  if (!node) return false
  // Literal string: 'POST'
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return MUTATION_METHODS.has(node.value.toUpperCase())
  }
  // Template literal with no expressions: `POST`
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return MUTATION_METHODS.has(node.quasis[0].value.raw.toUpperCase())
  }
  return false
}

function hasXRequestedWithHeader(headersNode: any): boolean {
  if (!headersNode) return false
  // headers: { 'X-Requested-With': 'XMLHttpRequest' }
  if (headersNode.type === 'ObjectExpression') {
    return headersNode.properties.some((prop: any) => {
      if (prop.type !== 'Property') return false
      const key = prop.key
      const keyName =
        key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
      return keyName === 'X-Requested-With'
    })
  }
  // headers: csrfHeaders (variable reference — assume it's correct)
  if (headersNode.type === 'Identifier') return true
  // headers: { ...csrfHeaders } (spread — assume it's correct)
  if (headersNode.type === 'ObjectExpression') {
    return headersNode.properties.some((p: any) => p.type === 'SpreadElement')
  }
  return false
}

export default {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        'mutation $fetch calls in composables must use useCsrfFetch()/useAppFetch() or include X-Requested-With header',
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
      missingCsrf:
        'Mutation $fetch calls must include CSRF protection. Prefer useCsrfFetch() or useAppFetch() (auto-injects header). ' +
        "Alternatively, add { headers: { 'X-Requested-With': 'XMLHttpRequest' } } manually.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const options = context.options[0] as { testMode?: boolean } | undefined
    const testMode = options?.testMode === true
    const filename = context.filename ?? (context as any).getFilename?.() ?? ''
    const normalized = filename.replace(/\\/g, '/')

    if (!testMode && normalized) {
      if (!normalized.includes('/app/composables/')) return {}
      if (!normalized.endsWith('.ts')) return {}
    }

    return {
      CallExpression(node: any) {
        const callee = node.callee
        if (!callee) return

        // Match $fetch(...) calls
        const name = callee.type === 'Identifier' ? callee.name : null
        if (name !== '$fetch') return

        // Need at least 2 args: url + options
        if (node.arguments.length < 2) return

        const optionsArg = node.arguments[1]
        if (!optionsArg || optionsArg.type !== 'ObjectExpression') return

        // Find method property
        const methodProp = optionsArg.properties.find(
          (p: any) =>
            p.type === 'Property' &&
            ((p.key.type === 'Identifier' && p.key.name === 'method') ||
              (p.key.type === 'Literal' && p.key.value === 'method')),
        )
        if (!methodProp) return
        if (!isMutationMethod(methodProp.value)) return

        // Find headers property
        const headersProp = optionsArg.properties.find(
          (p: any) =>
            p.type === 'Property' &&
            ((p.key.type === 'Identifier' && p.key.name === 'headers') ||
              (p.key.type === 'Literal' && p.key.value === 'headers')),
        )

        if (!headersProp || !hasXRequestedWithHeader(headersProp.value)) {
          context.report({
            node: callee,
            messageId: 'missingCsrf',
          })
        }
      },
    }
  },
}
