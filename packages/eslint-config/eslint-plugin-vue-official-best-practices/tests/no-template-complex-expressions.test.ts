import * as tsParser from '@typescript-eslint/parser'
/**
 * Tests for no-template-complex-expressions rule
 */

import { RuleTester } from 'eslint'
import rule from '../src/rules/no-template-complex-expressions'
import vueParser from 'vue-eslint-parser'

import { describe, it, afterAll } from 'vitest'
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

const ruleTester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
    },
  },
})

ruleTester.run('no-template-complex-expressions', rule, {
  valid: [
    // Simple variable reference
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ count }}</div>
        </template>
      `,
    },
    // Whitelisted function call
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ formatPrice(price) }}</div>
        </template>
      `,
    },
    // Single-arg function call (not whitelisted — allowed by maxCallArgs default)
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ entryStatus(entry) }}</div>
        </template>
      `,
    },
    // Single-arg call with property access argument
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ formatTime(entry.timestamp) }}</div>
        </template>
      `,
    },
    // Single-arg call in event handler
    {
      filename: 'test.vue',
      code: `
        <template>
          <button @click="handleDelete(item.id)">Delete</button>
        </template>
      `,
    },
    // Zero-arg function call
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ getData() }}</div>
        </template>
      `,
    },
    // Two-arg function call (allowed by maxCallArgs default of 2)
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ handleJoin(wager.id, payload) }}</div>
        </template>
      `,
    },
  ],
  invalid: [
    // Nested ternary (still flagged)
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ a ? b ? c : d : e }}</div>
        </template>
      `,
      errors: [
        {
          messageId: 'complexExpression',
        },
      ],
    },
    // Multi-arg function call (exceeds maxCallArgs default of 2)
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ calculate(a, b, c) }}</div>
        </template>
      `,
      errors: [
        {
          messageId: 'complexExpression',
        },
      ],
    },
    // Single-arg call with complex argument (ternary inside)
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ doStuff(a ? b : c) }}</div>
        </template>
      `,
      errors: [
        {
          messageId: 'complexExpression',
        },
      ],
    },
    // Single-arg call with nested function call argument
    {
      filename: 'test.vue',
      code: `
        <template>
          <div>{{ outer(inner(x)) }}</div>
        </template>
      `,
      errors: [
        {
          messageId: 'complexExpression',
        },
      ],
    },
  ],
})
