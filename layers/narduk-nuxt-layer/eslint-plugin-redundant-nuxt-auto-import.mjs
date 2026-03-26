// @ts-check
/**
 * ESLint plugin: flag explicit value imports that duplicate Nuxt auto-imports.
 *
 * Reads `.nuxt/imports.d.ts` (run `nuxt prepare` first). Whole `import type` declarations are
 * ignored; mixed `import { value, type T }` fixes drop redundant values and rewrite to `import type { T }`.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** @type {Map<string, { mtimeMs: number, map: Map<string, Set<string>> }>} */
const cache = new Map()

/**
 * @param {string} fromFile
 * @returns {string | null}
 */
function findImportsDts(fromFile) {
  let dir = dirname(fromFile)
  for (let i = 0; i < 48; i++) {
    const candidate = join(dir, '.nuxt', 'imports.d.ts')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * @param {string} segment
 * @returns {string | null}
 */
function parseExportedName(segment) {
  const s = segment.trim()
  if (!s || s.startsWith('type ')) return null
  let m = s.match(/^default\s+as\s+(\w+)$/)
  if (m) return m[1]
  m = s.match(/^(\w+)\s+as\s+(\w+)$/)
  if (m) return m[2]
  if (/^\w+$/.test(s)) return s
  return null
}

/**
 * @param {string} exportClause
 * @returns {string[]}
 */
function namesFromExportClause(exportClause) {
  const names = []
  let depth = 0
  let cur = ''
  for (const ch of exportClause) {
    if (ch === '{' || ch === '<') depth += 1
    else if (ch === '}' || ch === '>') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      const n = parseExportedName(cur)
      if (n) names.push(n)
      cur = ''
      continue
    }
    cur += ch
  }
  const n = parseExportedName(cur)
  if (n) names.push(n)
  return names
}

/**
 * @param {string} content
 * @returns {Map<string, Set<string>>}
 */
function parseImportsDts(content) {
  /** @type {Map<string, Set<string>>} */
  const bySource = new Map()
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('export {')) continue
    const fromMatch = line.match(/\}\s+from\s+['"]([^'"]+)['"]\s*(?:;\s*)?$/)
    if (!fromMatch) continue
    const endBrace = line.indexOf('} from ')
    if (endBrace === -1) continue
    const exportInner = line.slice('export {'.length, endBrace)
    const source = fromMatch[1]
    if (!bySource.has(source)) bySource.set(source, new Set())
    const set = bySource.get(source)
    for (const name of namesFromExportClause(exportInner)) {
      set.add(name)
    }
  }
  return bySource
}

/**
 * @param {string} importsPath
 * @returns {Map<string, Set<string>> | null}
 */
function loadModuleExports(importsPath) {
  try {
    const stat = statSync(importsPath)
    const hit = cache.get(importsPath)
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.map
    const map = parseImportsDts(readFileSync(importsPath, 'utf8'))
    cache.set(importsPath, { mtimeMs: stat.mtimeMs, map })
    return map
  } catch {
    return null
  }
}

/**
 * @param {import('estree').ImportSpecifier} sp
 * @returns {string | null}
 */
function getImportedName(sp) {
  if (sp.imported.type === 'Identifier') return sp.imported.name
  if (sp.imported.type === 'Literal' && typeof sp.imported.value === 'string')
    return sp.imported.value
  return null
}

/**
 * @param {import('estree').ImportSpecifier} sp
 * @param {import('eslint').SourceCode} sourceCode
 * @returns {string | null}
 */
function formatTypeOnlySpecifierText(sp, sourceCode) {
  const local = sp.local.name
  if (sp.imported.type === 'Identifier') {
    const imported = sp.imported.name
    return local === imported ? imported : `${imported} as ${local}`
  }
  if (sp.imported.type === 'Literal' && typeof sp.imported.value === 'string') {
    return `${sourceCode.getText(sp.imported)} as ${local}`
  }
  return null
}

/**
 * @param {import('estree').ImportSpecifier} sp
 * @returns {boolean}
 */
function isInlineTypeSpecifier(sp) {
  return 'importKind' in sp && sp.importKind === 'type'
}

/** @type {import('eslint').Rule.RuleModule} */
const noRedundantAutoImportRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow explicit value imports that Nuxt already auto-imports (see .nuxt/imports.d.ts).',
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundant:
        "'{{names}}' is auto-imported by Nuxt — remove redundant value import(s) (ensure `.nuxt/imports.d.ts` exists via `nuxt prepare`).",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return
        const src = node.source && 'value' in node.source ? node.source.value : null
        if (typeof src !== 'string') return

        const filePath = context.filename ?? context.physicalFilename
        if (typeof filePath !== 'string') return

        const importsPath = findImportsDts(filePath)
        if (!importsPath) return

        const moduleExports = loadModuleExports(importsPath)
        if (!moduleExports) return

        const allowed = moduleExports.get(src)
        if (!allowed || allowed.size === 0) return

        if (node.specifiers.some((s) => s.type !== 'ImportSpecifier')) return

        /** @type {import('estree').ImportSpecifier[]} */
        const typeSpecifiers = node.specifiers.filter(
          (s) => s.type === 'ImportSpecifier' && isInlineTypeSpecifier(s),
        )
        /** @type {import('estree').ImportSpecifier[]} */
        const valueSpecifiers = node.specifiers.filter(
          (s) => s.type === 'ImportSpecifier' && !isInlineTypeSpecifier(s),
        )
        if (valueSpecifiers.length === 0) return

        for (const sp of valueSpecifiers) {
          const imported = getImportedName(sp)
          if (!imported || !allowed.has(imported)) return
        }

        const names = valueSpecifiers
          .map((s) => getImportedName(s))
          .filter(Boolean)
          .join(', ')

        const sourceCode = context.sourceCode ?? context.getSourceCode?.()
        const typeParts =
          sourceCode && typeSpecifiers.length > 0
            ? typeSpecifiers.map((sp) => formatTypeOnlySpecifierText(sp, sourceCode))
            : []
        const canRewriteTypeOnlyImport =
          typeSpecifiers.length > 0 &&
          typeParts.length === typeSpecifiers.length &&
          typeParts.every((p) => typeof p === 'string' && p.length > 0)

        context.report({
          node,
          messageId: 'redundant',
          data: { names },
          fix(fixer) {
            const sc = context.sourceCode ?? context.getSourceCode?.()
            const range = node.range
            if (!sc || !range) {
              return typeSpecifiers.length > 0 ? null : fixer.remove(node)
            }
            const [start, end] = range

            if (typeSpecifiers.length > 0) {
              if (!canRewriteTypeOnlyImport) return null
              const originalText = sc.getText(node)
              const semi = originalText.trimEnd().endsWith(';') ? ';' : ''
              const moduleText = sc.getText(node.source)
              const newText = `import type { ${typeParts.join(', ')} } from ${moduleText}${semi}`
              return fixer.replaceTextRange([start, end], newText)
            }

            let removeEnd = end
            const after = sc.text.slice(end)
            const nl = after.match(/^\r?\n/)
            if (nl) removeEnd = end + nl[0].length
            return fixer.removeRange([start, removeEnd])
          },
        })
      },
    }
  },
}

export default {
  meta: {
    name: 'eslint-plugin-nuxt-redundant-auto-import',
    version: '1.0.0',
  },
  rules: {
    'no-redundant-auto-import': noRedundantAutoImportRule,
  },
}
