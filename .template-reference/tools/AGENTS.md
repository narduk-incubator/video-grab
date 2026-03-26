# AGENTS.md — tools/

These are **Node.js automation scripts** that run locally or in CI. They are
**NOT** deployed to Cloudflare Workers.

> **Important:** These scripts use `node:fs`, `node:child_process`, and other
> Node.js built-in modules. This does NOT violate the project's "no Node.js
> modules" constraint. That constraint applies only to `server/` code deployed
> to Workers.

## Scripts

| Script                 | Purpose                                                                                    | Usage                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `validate.ts`          | Confirms infrastructure is correctly provisioned (D1, Doppler, GitHub secrets)             | `pnpm run validate`                                      |
| `generate-favicons.ts` | Generates all favicon variants (apple-touch-icon, ico, PNG, webmanifest) from a source SVG | `pnpm generate:favicons`                                 |
| `setup-analytics.ts`   | Bootstraps GA4, Google Search Console, and IndexNow                                        | Run directly or from control-plane provisioning pipeline |
| `gsc-toolbox.ts`       | Google Search Console API utilities                                                        | Used by `setup-analytics.ts`                             |

## vs. `scripts/`

The `scripts/` directory at the repo root contains **shell helper scripts** for
developer convenience (`dev-kill.sh`, `run-dev-auth.sh`). The `tools/` directory
contains **TypeScript automation** for validation and supporting scripts. **New
apps:** provision only via the control plane; there is no `init.ts`.
