# dot-ai

**A tiny, tool-agnostic convention for the context you give your coding agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Coding agents start every session blind. Your project's domain knowledge, conventions, and
hard-won lessons live in your head or get locked inside one tool's proprietary memory — switch agents
and it's gone. `dot-ai` gives that context one home: a small, version-controlled `.ai/` directory in
plain Markdown that **any** agent (Claude, Gemini, Codex, …) can read.

## Quickstart

```sh
# POSIX (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/AJMarquez99/dot-ai/main/install.sh | sh
```

```sh
# Node / cross-platform (works on Windows, no git required)
npx @ajmarquez99/dot-ai
```

> Want the latest unreleased version straight from source? `npx github:AJMarquez99/dot-ai`.

The installer:
1. Drops a clean `.ai/` into your project (never overwriting existing files).
2. Asks which agents you use and where to wire the convention — appending a marked block to
   `CLAUDE.md` / `GEMINI.md` / `AGENTS.md`, never clobbering, and idempotent on re-run.
3. Offers to point each selected tool's plan mode at `.ai/plans` via its **project-local**
   settings — Claude (`.claude/settings.local.json` → `plansDirectory`) and Gemini
   (`.gemini/settings.json` → `general.plan.directory`). Existing settings are merged, never
   overwritten (needs `jq`, `node`, or `python3`). Codex has no equivalent setting, so it's
   skipped. Gemini also needs a `~/.gemini/policies` rule to permit writes there — the installer
   prints a reminder rather than touching your global config.

**Local vs global.** By default the convention block goes into a project-local MD file. Pass
`--global` to write it into your user-level config instead:

| Tool | Local (default) | Global (`--global`) |
|---|---|---|
| Claude | `./CLAUDE.md` | `~/.claude/CLAUDE.md` |
| Gemini | `./GEMINI.md` | `~/.gemini/GEMINI.md` |
| Codex  | `./AGENTS.md` | `~/.codex/AGENTS.md` |

`--global` needs at least one tool flag (it only changes *where* the block goes). Codex honors
`$CODEX_HOME` if set (defaulting to `~/.codex`). The plans-directory setting always stays
**project-local** even with `--global`, because `.ai/plans` is a per-project path.

**Scaffold only.** Already have the convention wired in globally? Pass `--no-md` to create just
the `.ai/` tree and its READMEs — no MD files, no settings touched. (`--no-md` can't be combined
with a tool flag — `--claude`/`--gemini`/`--codex`/`--all` — or `--global`.)

Non-interactive? Pass targets explicitly: `... | sh -s -- --all` (or `--claude --gemini --codex`),
add `--global` to target user-level config. The plans setting defaults to on; add `--no-plans` to
skip it.

Run `dot-ai --help` for all flags, `--version` for the version, and `--dry-run` to preview the
changes without writing anything.

## What you get

```
.ai/
├── knowledge/    # What is true / why
├── guidelines/   # What rules we follow
├── runbooks/     # How a task is done (with judgment)
├── scripts/      # How, automated (deterministic)
├── templates/    # What to start from (blanks to fill)
├── data/         # What raw inputs exist
├── plans/        # What we intend to do
├── audits/       # What was true at time T
├── lessons/      # What we just learned (→ a guideline)
├── notes/        # What might be worth a look later
├── context/      # The live working state / handoff (gitignored)
└── archive/      # Historical records (date-stamped)
```

Each folder answers a distinct question — that's the whole trick. Full semantics, lifecycle, and
version-control rules are in **[SPEC.md](./SPEC.md)**; the exact text your agent reads is
**[agent-instructions.md](./agent-instructions.md)**.

**Sharing `.ai/` in a public repo?** Commit the scaffold and the files worth sharing; keep personal
files local by prefixing them with `_` (the shipped `.ai/.gitignore` ignores `_*`). This repo's own
[`.ai/`](./.ai) is committed exactly this way — browse it as a worked example.

## How it wires into your agent

The installer appends a marked block to your agent's config file:

```markdown
<!-- BEGIN .ai-convention -->
…contents of agent-instructions.md…
<!-- END .ai-convention -->
```

Re-running the installer updates just that block — your other instructions are never touched.

## Why adopt it

- **Portable.** Plain Markdown in your repo, not a vendor's memory store. Works across every agent.
- **Legible.** A reviewer (human or agent) can tell at a glance where a fact belongs.
- **Self-cleaning.** The notes → plan/knowledge/lesson → guideline lifecycle keeps it from rotting.

## A note on privacy (and dogfooding)

`dot-ai` dogfoods its own convention: this repo's [`.ai/`](./.ai) is committed — curated
`knowledge/`, `guidelines/`, and `runbooks/` that a contributor (or their agent) can read — while
personal and in-flight files (design scratch, working notes) stay local via the `_` prefix, and
`context/` ignores its own contents. It's the convention working on itself.

Adopting `.ai/` in a public repo? Favor sharing over hiding. The whole point is that your project's
context is legible to anyone — human or agent — who clones it. So commit the parts a contributor
would benefit from and write them *for* that audience. Keep what's genuinely personal or sensitive —
scratch notes, secrets, half-formed drafts — local by prefixing the file or folder with `_` (the
shipped `.ai/.gitignore` ignores anything starting with `_`). Gitignoring the entire `.ai/`
directory is the fallback for repos that are private by default — not the default move.

## License

[MIT](./LICENSE) © 2026 Alejandro Marquez
