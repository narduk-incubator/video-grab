#!/usr/bin/env -S pnpm exec jiti
/**
 * GENERATE-FAVICONS.TS — Centralized Favicon Generator
 * -------------------------------------------------------
 * Generates all required favicon assets from a source SVG file.
 *
 * Usage:
 *   pnpm generate:favicons
 *   pnpm generate:favicons -- --target=apps/web/public
 *   pnpm generate:favicons -- --target=apps/web/public --name="My App" --short-name="MA"
 *   pnpm generate:favicons -- --source=path/to/logo.svg --target=layers/narduk-nuxt-layer/public
 *
 * Options:
 *   --target      Directory to write generated files into (default: layers/narduk-nuxt-layer/public)
 *   --source      Path to the source SVG file (default: <target>/favicon.svg)
 *   --name        Full name for the web manifest (default: "Nuxt 4 App")
 *   --short-name  Short name for the web manifest (default: first 12 chars of --name)
 *   --color       Theme color for the manifest (default: "#10b981")
 *   --bg          Background color for the manifest (default: "#0B1120")
 *
 * Prerequisites:
 *   sharp must be available (listed in root package.json onlyBuiltDependencies)
 *   Install if missing: pnpm add -wD sharp
 *
 * Output:
 *   <target>/apple-touch-icon.png     (180×180)
 *   <target>/favicon-32x32.png        (32×32)
 *   <target>/favicon-16x16.png        (16×16)
 *   <target>/favicon.ico              (32×32 PNG — modern browsers accept this)
 *   <target>/site.webmanifest         (JSON web app manifest)
 *
 * NOTE: The source favicon.svg is NOT overwritten. If you want to replace the
 * SVG itself, do that manually or via the /generate-branding agent workflow.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, '..')

// --- Argument parsing ---

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)=?(.*)$/)
    if (match) return [match[1], match[2] || true]
    return [arg, true]
  }),
) as Record<string, string | true>

const targetDir = resolve(
  ROOT_DIR,
  typeof args.target === 'string' ? args.target : 'layers/narduk-nuxt-layer/public',
)
const appName = typeof args.name === 'string' ? args.name : 'Nuxt 4 App'
const shortName = typeof args['short-name'] === 'string' ? args['short-name'] : appName.slice(0, 12)
const themeColor = typeof args.color === 'string' ? args.color : '#10b981'
const bgColor = typeof args.bg === 'string' ? args.bg : '#0B1120'

// Source SVG — defaults to <target>/favicon.svg
const sourcePath =
  typeof args.source === 'string'
    ? resolve(ROOT_DIR, args.source)
    : resolve(targetDir, 'favicon.svg')

// --- Validation ---

if (!existsSync(sourcePath)) {
  console.error(`❌ Source SVG not found: ${sourcePath}`)
  console.error(
    '   Create a favicon.svg in the target directory first, or specify --source=path/to/your.svg',
  )
  process.exit(1)
}

// --- Generation ---

async function generate() {
  // Dynamic import of sharp — it's an optional dependency
  let sharp: typeof import('sharp')
  try {
    sharp = (await import('sharp')).default as any
  } catch {
    console.error('❌ sharp is not installed. Run: pnpm add -wD sharp')
    process.exit(1)
  }

  const svgBuffer = readFileSync(sourcePath)

  console.log(`🎨 Generating favicons from ${sourcePath}`)
  console.log(`   → Target: ${targetDir}\n`)

  // Apple Touch Icon (180×180)
  await sharp(svgBuffer).resize(180, 180).png().toFile(resolve(targetDir, 'apple-touch-icon.png'))
  console.log('  ✅ apple-touch-icon.png (180×180)')

  // Favicon 32×32
  await sharp(svgBuffer).resize(32, 32).png().toFile(resolve(targetDir, 'favicon-32x32.png'))
  console.log('  ✅ favicon-32x32.png (32×32)')

  // Favicon 16×16
  await sharp(svgBuffer).resize(16, 16).png().toFile(resolve(targetDir, 'favicon-16x16.png'))
  console.log('  ✅ favicon-16x16.png (16×16)')

  // favicon.ico (32×32 PNG — modern browsers handle this fine)
  await sharp(svgBuffer).resize(32, 32).png().toFile(resolve(targetDir, 'favicon.ico'))
  console.log('  ✅ favicon.ico (32×32)')

  // site.webmanifest
  const manifest = {
    name: appName,
    short_name: shortName,
    icons: [
      { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    theme_color: themeColor,
    background_color: bgColor,
    display: 'standalone' as const,
  }
  writeFileSync(resolve(targetDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2))
  console.log('  ✅ site.webmanifest')

  console.log('\n🎉 Done! All favicons generated.')
  console.log('   Apple Touch Icon link tags are set in the layer nuxt.config.ts.')
}

generate().catch((err) => {
  console.error(err)
  process.exit(1)
})
