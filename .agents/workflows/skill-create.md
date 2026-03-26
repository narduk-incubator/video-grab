---
description:
  Scaffold a new agent skill with proper structure, frontmatter, and repo-local
  cross-agent registration
---

# Create a New Skill

This workflow scaffolds a new agent skill, registers it in the repo-local skill
tree, and ensures it is available to all supported AI agents (Cursor, Codex,
Antigravity, Claude-compatible tooling, and GitHub Copilot).

> [!IMPORTANT] Read `docs/agents/skills.md` for the current repo-local skills
> architecture before proceeding.

> [!CAUTION] Canonical skills live in `.agents/skills/`. Do not install new
> skills into `~/.skills/` or any other machine-local directory if the goal is
> to ship them with this repository or make them available to GitHub coding
> agents.

---

## 0. Scope The Skill

Ask the user for:

1. **Skill name** (kebab-case, e.g. `vue-testing`)
2. **One-line description** (shown in agent skill lists)
3. **Optional subdirectories**: `scripts/`, `examples/`, `references/`,
   `resources/`

All shipped skills belong in `.agents/skills/<skill-name>/`.

---

## 1. Check For Duplicates

// turbo

```bash
ls .agents/skills/ 2>/dev/null
```

If a similar skill already exists, ask whether to extend it instead of creating
a new one.

---

## 2. Scaffold The Skill

```bash
mkdir -p .agents/skills/<skill-name>
```

Create `.agents/skills/<skill-name>/SKILL.md`:

```markdown
---
name: <skill-name>
description: '<one-line description>'
---

# <Skill Title>

<Brief overview of what this skill does and when to use it.>

## When to Use

- <Trigger condition 1>
- <Trigger condition 2>

## When NOT to Use

- <Out-of-scope condition 1>

## Instructions

<Step-by-step guidance, best practices, checklists.>

## Examples

<Concrete usage scenarios.>
```

Optionally create supporting directories:

```bash
mkdir -p .agents/skills/<skill-name>/scripts
mkdir -p .agents/skills/<skill-name>/examples
mkdir -p .agents/skills/<skill-name>/references
mkdir -p .agents/skills/<skill-name>/resources
```

---

## 3. Write The Content

Populate the skill with actionable, agent-readable instructions:

- Keep instructions specific and executable.
- Use numbered steps for procedures.
- Include concrete examples.
- Reference supporting files with relative paths.

---

## 4. Repair Agent Entry Points

// turbo

```bash
pnpm run skills:link
```

Confirm the skill is visible from every agent path:

// turbo

```bash
ls -la .agent/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ Antigravity" || echo "❌ Antigravity"
ls -la .cursor/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ Cursor" || echo "❌ Cursor"
ls -la .codex/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ Codex" || echo "❌ Codex"
ls -la .claude/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ Claude" || echo "❌ Claude"
ls -la .github/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ GitHub Copilot" || echo "❌ GitHub Copilot"
```

All five should pass because those entry points resolve to `.agents/skills/`.

---

## 5. Update Documentation

If the new skill should be called out explicitly, update
`docs/agents/skills.md`.

---

## Summary Checklist

- [ ] Skill created in `.agents/skills/` (repo-local canonical path)
- [ ] `SKILL.md` has valid frontmatter (`name`, `description`)
- [ ] Instructions are actionable and agent-readable
- [ ] No duplicate skill exists
- [ ] `pnpm run skills:link` passes
- [ ] Skill resolves from `.agent`, `.cursor`, `.codex`, `.claude`, and
      `.github`
