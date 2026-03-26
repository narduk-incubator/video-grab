import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const layerRoot = join(__dirname, '..', '..')
const drizzleDir = join(layerRoot, 'drizzle')

function readSchemaTables(): string[] {
  const schemaSource = readFileSync(join(layerRoot, 'server/database/schema.ts'), 'utf-8')
  const matches = schemaSource.matchAll(/sqliteTable\('(\w+)'/gi)
  return [...new Set([...matches].map((match) => match[1]!))].sort()
}

function readMigratedTables(): string[] {
  const files = readdirSync(drizzleDir).filter((file) => /^0.*\.sql$/.test(file))
  const tables = new Set<string>()

  for (const file of files) {
    const sql = readFileSync(join(drizzleDir, file), 'utf-8')
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS [`"]?(\w+)[`"]?/gi)) {
      tables.add(match[1]!)
    }
  }

  return [...tables].sort()
}

function readSeedTables(): string[] {
  const sql = readFileSync(join(drizzleDir, 'seed.sql'), 'utf-8')
  const tables = new Set<string>()

  for (const match of sql.matchAll(/INSERT(?: OR IGNORE)? INTO\s+[`"]?(\w+)[`"]?/gi)) {
    tables.add(match[1]!)
  }

  return [...tables].sort()
}

describe('layer drizzle artifacts', () => {
  it('migrates every layer-owned schema table', () => {
    expect(readMigratedTables()).toEqual(readSchemaTables())
  })

  it('seeds only tables that layer migrations create', () => {
    expect(readMigratedTables()).toEqual(expect.arrayContaining(readSeedTables()))
  })
})
