# The `.ai/` Convention — Specification

> The authoritative, agent-facing ruleset lives in
> [`agent-instructions.md`](./agent-instructions.md). This document explains it for humans: what each
> piece is for and why it's shaped this way. Where the two could ever disagree,
> `agent-instructions.md` wins.

## Why this exists

Coding agents start every session blind. The context that makes a project legible — its hard-won
domain knowledge, the conventions a reviewer would enforce, the lesson learned the last time someone
touched the auth flow — lives in people's heads, scattered chat logs, or one tool's proprietary
memory. Switch tools and it's gone. `.ai/` is a tiny, boring, version-controlled directory that gives
that context one home, in plain Markdown, that any agent can read.

## The one rule that makes it work

**Every folder answers a distinct question.** If you can't say which question a file answers, it's in
the wrong folder. That single discipline is what keeps the directory from rotting into a junk drawer.
See the folder table in [`agent-instructions.md`](./agent-instructions.md#what-each-folder-answers).

## The lifecycle

Information has a direction of flow. A raw thought lands in `notes/`, graduates into a `plan/`,
`knowledge/`, a `lesson/`, or a `runbook/`, or is discarded. A `lesson/` hardens into a `guideline/`
and is deleted. Live working state lives in `context/` and is distilled at the end of work — keepers
promote up, the rest is thrown away. Nothing is meant to sit still.

## Version control in one test

Is the content regenerable? If a fresh clone could rebuild it from the code and git history, it's
session state — track the folder, gitignore the contents (this is `context/` only). Everything else
is human intent or derived truth: commit it. Transient does not mean untracked — `lessons/` and
`notes/` are committed precisely so they survive a clone.

Public repository? Favor sharing over hiding. The convention assumes `.ai/` is committed and legible
to anyone who clones the repo, so commit the shareable folders (`knowledge/`, `guidelines/`,
`runbooks/`) and write them for that audience. Keep personal or sensitive files local by prefixing
the file or folder with `_` — the shipped `.ai/.gitignore` ignores anything starting with `_` (e.g.
`knowledge/_secrets.md`, or a whole `_scratch/` dir). Gitignoring the whole `.ai/` directory is the
fallback for repos that are private by default. This repo dogfoods exactly that: its `.ai/` is
committed, with in-flight scratch kept local via `_`.

## Adopting it

- **One command:** see the [README](./README.md) quickstart — the installer drops `.ai/` into your
  project and wires the convention into your agent's config file(s).
- **By hand:** copy [`template/.ai/`](./template/.ai) into your project and paste
  [`agent-instructions.md`](./agent-instructions.md) into your `CLAUDE.md` / `GEMINI.md` / `AGENTS.md`.

## Nested cascade & global `~/.ai/`

`.ai/` directories compose. When an agent works in a directory, the **effective context**
is the chain of every `.ai/` from the current directory up to and including `~/.ai/`
(the machine-global layer). The chain is **additive** — outer layers are broad, inner
layers are specific — and on a collision (same folder + same filename) the **nearest
layer wins**.

```
~/.ai/                  # machine-global: you, everywhere
…/workspace/.ai/        # workspace-wide
…/project/.ai/          # this project (most specific)
```

`~/.ai/` is not special: it is simply `.ai/` scaffolded in your home directory
(`cd ~ && dot-ai init`). Project-bound folders (`context/`, `plans/`, `audits/`) are
inherently per-project and are unusual at broader levels.

Inspect the effective chain with `dot-ai context`; move a file between layers with
`dot-ai promote`.
