---
description:
  Sync template infrastructure and layer code to fleet apps (all or single)
---

# Sync Fleet

Pushes template infrastructure files and layer code from `narduk-nuxt-template`
to fleet apps in `~/new-code/template-apps/` using fresh clones by default.

> [!IMPORTANT] All commands run from the **template repo root**:
> `~/new-code/narduk-nuxt-template`

---

## 0. Pre-flight — ask the user

Ask: **"Sync all fleet apps, or a specific app? (e.g. `tide-check`)"**

- If the user names one or more apps → use the **Single / Filtered** path (Step
  2a).
- If the user says "all" → use the **Full Fleet** path (Step 2b).

---

## 2a. Single / Filtered App Sync

For a single app (e.g. `tide-check`), run both phases manually:

### Phase 1 — Sync template config files

```bash
cd ~/new-code/narduk-nuxt-template && npx tsx tools/sync-template.ts ~/new-code/template-apps/<app-name>
```

### Phase 2 — Update layer code

```bash
cd ~/new-code/template-apps/<app-name> && npx tsx tools/update-layer.ts --from ~/new-code/narduk-nuxt-template --skip-quality
```

### Phase 3 — Quality check

```bash
cd ~/new-code/template-apps/<app-name> && pnpm quality
```

### Phase 4 — Review & commit

```bash
cd ~/new-code/template-apps/<app-name> && git diff --stat && git add -A && git commit -m "chore: sync with template $(cd ~/new-code/narduk-nuxt-template && git rev-parse --short HEAD)"
```

> [!TIP] To sync multiple specific apps, repeat steps 2a for each, or use the
> `--repos=` flag in step 2b.

---

## 2b. Full Fleet Sync (all apps, parallel)

```bash
cd ~/new-code/narduk-nuxt-template && pnpm run sync:fleet -- --auto-commit
```

### Available flags

| Flag                | Description                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--no-fresh-clone`  | Reuse existing local clone directory instead of re-cloning                                                  |
| `--dry-run`         | Preview changes without writing                                                                             |
| `--skip-quality`    | Skip `pnpm quality` per app                                                                                 |
| `--auto-commit`     | Auto-commit each app after sync                                                                             |
| `--repos=app1,app2` | Sync only specific apps (comma-separated)                                                                   |
| `--jobs=N`          | Number of parallel workers (default: 4)                                                                     |
| `--allow-dirty-app` | Try `git pull` from the synced temp clone into a dirty local app (can still fail if the same files changed) |

`sync-fleet` builds each app in `/tmp`, then **fast-forwards your local**
`~/new-code/template-apps/<app>` to that result. An **unclean local worktree**
(commit or stash first, or pass `--allow-dirty-app`) blocks that final step so
you do not lose uncommitted work. Preflight fails immediately when the local
clone is dirty, so you avoid a full clone + quality run that would fail at
promotion anyway.

> [!NOTE] `--no-fresh-clone` in older notes maps to the current CLI surface in
> `tools/sync-fleet.ts` (`--clone-fleet-repos` clones missing locals). Prefer
> `pnpm exec tsx tools/sync-fleet.ts --help` for the exact flag list.

### Examples

```bash
# Dry-run all apps
pnpm run sync:fleet -- --dry-run

# Sync two specific apps with auto-commit
pnpm run sync:fleet -- --repos=tide-check,flashcard-pro --auto-commit

# Full fleet, skip quality, 8 workers
pnpm run sync:fleet -- --skip-quality --auto-commit --jobs=8
```

### Dirty local checkout (promotion blocked)

Symptom: `Dirty worktree` / `Local checkout has uncommitted changes` for
`~/new-code/template-apps/<app>`.

Fix: in that app repo, `git stash push -u` (or commit), re-run `sync:fleet`,
then `git stash pop` if needed. Use `--allow-dirty-app` only when you understand
that `git pull --ff-only` may refuse or conflict on overlapping files.

---

## 3. (Optional) Sync Doppler canonical secrets

If secrets in `0_global-canonical-tokens` changed:

```bash
cd ~/new-code/narduk-nuxt-template && npx tsx tools/sync-canonical-to-fleet.ts --apply
```

---

## 4. Post-sync health check (single app)

```bash
cd ~/new-code/template-apps/<app-name> && npx tsx tools/check-sync-health.ts
```
