/**
 * check-setup.js — Bootstrap Guard
 * ─────────────────────────────────
 * Runs as a `pre*` hook before dev/build/deploy to ensure a `.setup-complete`
 * sentinel exists (written by the control-plane provisioning pipeline’s hydrate
 * step for new apps, or committed for authoring monorepos).
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SENTINEL = path.join(ROOT, '.setup-complete')

if (!fs.existsSync(SENTINEL)) {
  console.error()
  console.error('┌──────────────────────────────────────────────────────────────┐')
  console.error('│  🚨  PROJECT SETUP NOT COMPLETE                             │')
  console.error('│                                                              │')
  console.error('│  New fleet apps are provisioned only through the control     │')
  console.error('│  plane (GitHub Action hydrates the repo and writes            │')
  console.error('│  .setup-complete). There is no local init.ts.                │')
  console.error('│                                                              │')
  console.error('│  PROVISION (API):                                            │')
  console.error('│    POST https://control-plane.nard.uk/api/fleet/provision    │')
  console.error('│    Authorization: Bearer $PROVISION_API_KEY                  │')
  console.error('│                                                              │')
  console.error('│  AUTHORING (template / control-plane monorepo):              │')
  console.error('│    This clone should include a tracked .setup-complete.      │')
  console.error('│    If you removed it, restore from git or re-clone.          │')
  console.error('│                                                              │')
  console.error('│  See docs/agents/operations.md and AGENTS.md.                 │')
  console.error('└──────────────────────────────────────────────────────────────┘')
  console.error()
  process.exit(1)
}
