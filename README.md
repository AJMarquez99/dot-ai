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

# Node / cross-platform
npx github:AJMarquez99/dot-ai
```

The installer:
1. Drops a clean `.ai/` into your project (never overwriting existing files).
2. Asks which agents you use and wires the convention into your `CLAUDE.md` / `GEMINI.md` /
   `AGENTS.md` — appending, never clobbering, and idempotent on re-run.

Non-interactive? Pass targets explicitly: `... | sh -s -- --all` (or `--claude --gemini --codex`).

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

`dot-ai` was built using its own convention: this repo kept an `.ai/` workspace of design docs and
plans throughout. Because the repo is public, that workspace is **gitignored** rather than committed —
the convention shaped the work without putting it on display.

If you adopt `.ai/` in a public repo and some of it isn't meant for the world, do the same: gitignore
the whole `.ai/` directory, or just the subdirectories you want to keep private (e.g. `plans/`,
`notes/`). It works the same either way.

## License

[MIT](./LICENSE) © 2026 Alejandro Marquez
