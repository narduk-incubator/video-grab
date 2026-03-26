/**
 * Module augmentation for ESLint v10 RuleTester.
 *
 * ESLint's RuleTester exposes `describe`, `it`, and `afterAll` as
 * assignable static properties so test frameworks can inject their
 * own runners.  The shipped type declarations omit `afterAll`,
 * causing TS2339 in every test file that does:
 *
 *   RuleTester.afterAll = afterAll   // from vitest
 *
 * This declaration merges the missing property into the existing type.
 */
import 'eslint'

declare module 'eslint' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- RuleTester typings intentionally augment the eslint module namespace
  namespace RuleTester {
    let afterAll: ((fn: () => void) => void) | undefined
  }
}
