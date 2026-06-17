# dot-ai

**A tiny, tool-agnostic convention for the context you give your coding agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Coding agents start every session blind. Your project's domain knowledge, conventions, and
hard-won lessons live in your head or get locked inside one tool's proprietary memory — switch agents
and it's gone. `dot-ai` gives that context one home: a small, version-controlled `.ai/` directory in
plain Markdown that **any** agent (Claude, Gemini, Codex, …) can read.

## Quickstart

Install once, globally, then use `dot-ai` in any project:

```sh
npm install -g @ajmarquez99/dot-ai
dot-ai init        # scaffold .ai/ here (like `git init`)
```

Prefer not to install? Run it one-off with npx (the original installer flow):

```sh
npx @ajmarquez99/dot-ai
```

> Latest unreleased from source: `npm i -g github:AJMarquez99/dot-ai`.

## Commands

`dot-ai` is a small command suite (run `dot-ai --help` for flags):

| Command | Does |
|---|---|
| `init` | Scaffold `.ai/` and optionally wire agent config (the default action) |
| `wire` | Inject/update the convention block in `CLAUDE.md`/`GEMINI.md`/`AGENTS.md` |
| `sync` | Re-apply the latest scaffold, prune stale-empty folders, resync convention blocks |
| `doctor` | Read-only structure/health diagnosis (and the ancestor cascade) |
| `archive <file>` | Move a file into `archive/` with a `YYYY-MM-DD_` prefix (`--retain` to exempt from prune) |
| `prune` | Delete `archive/` entries past the retention window (dry-run by default; `--force` to delete) |
| `context` | Print the effective `.ai/` cascade for the current directory (alias: `resolve`) |
| `promote <file> <up\|down\|global\|path>` | Copy (or `--move`) a file to another cascade layer |

### Nested cascade & global `~/.ai/`

`.ai/` directories compose: the effective context is every `.ai/` from your current directory
up to and including **`~/.ai/`** (the machine-global layer), applied additively — outer is broad,
inner is specific, nearest wins on a collision. `~/.ai/` is just `.ai/` scaffolded in your home
directory (`cd ~ && dot-ai init`). Inspect the chain with `dot-ai context`; move files between
layers with `dot-ai promote`.

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

**Adding your own instructions.** Put anything personal *below* the `<!-- END .ai-convention -->`
marker. The installer only ever rewrites the region between the markers, so content after `END`
survives every reinstall and never gets duplicated:

```markdown
<!-- BEGIN .ai-convention -->
…installer-managed convention…
<!-- END .ai-convention -->

## My instructions
Your personal additions here — preserved across reinstalls.
```

Because the installer recognizes that marked block, a config that already has it (e.g. wired into
your **global** `~/.claude/CLAUDE.md`) is flagged as `(already global)` in the interactive prompt —
a reminder that wiring it into an individual repo is only needed to share the convention with
collaborators. If your global config predates the markers, re-run the installer to resync it to the
canonical block, then keep your personal notes below `END`.

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

## Tools using this convention

`.ai/` is used in the wild by a small family of personal, agent-driven CLIs — handy as real-world
examples of the convention in a shipped project:

- **[gmail-cli](https://github.com/AJMarquez99/gmail-cli)** — a fail-closed Gmail CLI for AI agents
  (send + IMAP read), with its own curated `.ai/`.

## License

[MIT](./LICENSE) © 2026 Alejandro Marquez
