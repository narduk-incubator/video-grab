/**
 * Rule: vue-official/no-template-complex-expressions
 *
 * Warns on complex expressions in templates
 */

import type { RuleContext, RuleListener } from 'eslint'
import { VUE_STYLE_GUIDE } from '../utils/vue-docs-urls'

const DEFAULT_WHITELIST = [
  'formatPrice',
  'formatChange',
  'formatPercent',
  'formatDate',
  'formatCurrency',
  'formatNumber',
  'toLocaleString',
  'toString',
  'toFixed',
]

export default {
  meta: {
    type: 'suggestion' as const,
    docs: {
      description: 'disallow complex expressions in templates',
      category: 'Best Practices',
      recommended: true,
      url: VUE_STYLE_GUIDE,
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxTernaryDepth: {
            type: 'number',
            default: 1,
          },
          maxLogicalOps: {
            type: 'number',
            default: 3,
          },
          maxCallArgs: {
            type: 'number',
            default: 2,
          },
          allowedFunctions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      complexExpression:
        'Template expression is too complex. Move to computed property or method. See: {{url}}',
    },
  },
  create(context: RuleContext<string, any[]>): RuleListener {
    const parserServices = (context.sourceCode?.parserServices ?? context.parserServices) as any
    const options = context.options[0] || {}
    const maxTernaryDepth = options.maxTernaryDepth ?? 1
    const maxLogicalOps = options.maxLogicalOps ?? 3
    const maxCallArgs = options.maxCallArgs ?? 2
    const allowedFunctions = options.allowedFunctions || DEFAULT_WHITELIST

    if (!parserServices || !parserServices.defineTemplateBodyVisitor) {
      return {}
    }

    const countTernaryDepth = (node: any, depth = 0): number => {
      if (node.type === 'ConditionalExpression') {
        const trueDepth = countTernaryDepth(node.consequent, depth + 1)
        const falseDepth = countTernaryDepth(node.alternate, depth + 1)
        return Math.max(trueDepth, falseDepth)
      }
      return depth
    }

    const countLogicalOps = (node: any, count = 0): number => {
      if (node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||')) {
        const leftCount = countLogicalOps(node.left, count + 1)
        const rightCount = countLogicalOps(node.right, count + 1)
        return Math.max(leftCount, rightCount)
      }
      return count
    }

    /**
     * Check whether a call argument is "complex" — i.e. contains a
     * ternary, logical chain, or nested function call with arguments.
     */
    const isComplexArg = (n: any): boolean => {
      if (!n || typeof n !== 'object') return false
      if (n.type === 'ConditionalExpression') return true
      if (n.type === 'LogicalExpression') return true
      if (n.type === 'CallExpression' && n.arguments.length > 0) return true
      // Recurse into sub-expressions (e.g. template literals, binary ops)
      for (const key in n) {
        if (key === 'parent' || key === 'loc' || key === 'range') continue
        const child = n[key]
        if (Array.isArray(child)) {
          if (child.some(isComplexArg)) return true
        } else if (child && typeof child === 'object' && child.type) {
          if (isComplexArg(child)) return true
        }
      }
      return false
    }

    const checkExpression = (node: any) => {
      // Check ternary depth
      const ternaryDepth = countTernaryDepth(node)
      if (ternaryDepth > maxTernaryDepth) {
        context.report({
          node,
          messageId: 'complexExpression',
          data: { url: VUE_STYLE_GUIDE },
        })
        return
      }

      // Check logical ops
      const logicalOps = countLogicalOps(node)
      if (logicalOps > maxLogicalOps) {
        context.report({
          node,
          messageId: 'complexExpression',
          data: { url: VUE_STYLE_GUIDE },
        })
        return
      }

      // Recursively check for disallowed function calls
      const checkForDisallowedFunctionCalls = (n: any): void => {
        if (!n || typeof n !== 'object') return

        if (n.type === 'CallExpression' && n.arguments.length > 0) {
          const callee = n.callee
          const calleeName = callee.type === 'Identifier' ? callee.name : null

          // Skip whitelisted function names
          if (calleeName && allowedFunctions.includes(calleeName)) {
            return
          }

          // Flag if too many arguments
          if (n.arguments.length > maxCallArgs) {
            context.report({
              node: n,
              messageId: 'complexExpression',
              data: { url: VUE_STYLE_GUIDE },
            })
            return
          }

          // Flag if any argument is complex (ternary, logical, nested call)
          if (n.arguments.some(isComplexArg)) {
            context.report({
              node: n,
              messageId: 'complexExpression',
              data: { url: VUE_STYLE_GUIDE },
            })
            return
          }

          // Simple call with ≤ maxCallArgs simple arguments — allowed
          return
        }

        // Recursively check all child nodes
        for (const key in n) {
          if (key === 'parent' || key === 'loc' || key === 'range') continue
          const child = n[key]
          if (Array.isArray(child)) {
            child.forEach(checkForDisallowedFunctionCalls)
          } else if (child && typeof child === 'object') {
            checkForDisallowedFunctionCalls(child)
          }
        }
      }

      checkForDisallowedFunctionCalls(node)
    }

    return parserServices.defineTemplateBodyVisitor(
      {
        'VExpressionContainer[expression!=null]'(node: any) {
          checkExpression(node.expression)
        },
      },
      {},
    )
  },
}
