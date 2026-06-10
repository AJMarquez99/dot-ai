# .ai/ Project Directory

Agent-agnostic project directory used across tools (Claude, Gemini, Codex, etc.) to store
project-scoped intelligence. It is **not** specific to any single agent.

## Layout

| Folder | Answers | Distinct from |
|---|---|---|
| `knowledge/` | What is true / why | `context/` (live state, not durable truth) |
| `guidelines/` | What rules we follow | `lessons/` (a rule not yet crystallized) |
| `runbooks/` | **How** a task is performed (with judgment) | `scripts/` (runs) & `skills/` (LLM-invoked) |
| `scripts/` | How, **automated** (deterministic, no judgment) | `runbooks/` (the non-automatable steps) |
| `templates/` | What to start from (a blank to fill) | `data/` (concrete values consumed as-is) |
| `data/` | What raw inputs exist | `templates/` (scaffolds, not values) |
| `plans/` | What we intend to do | `audits/` (a point-in-time finding) |
| `audits/` | What was true at time T | `knowledge/` (durable, not a dated snapshot) |
| `lessons/` | What we just learned (→ becomes a guideline) | `notes/` (lessons are actionable rules) |
| `notes/` | What might be worth a look later | `lessons/` (notes aren't actionable yet) |
| `context/` | The live working state / handoff | `knowledge/` (context is disposable) |
| `archive/` | Historical records (date-stamped, 90-day retention) | — |

**The how-triangle:** `scripts/` *runs*, `runbooks/` is *followed*, the optional `skills/` is
*invoked by the LLM*. A runbook commonly references a script for its automatable steps.

**Inbox → processed lifecycle:** `notes/` is the rawest inbox — a thought graduates into a
`plan/`, `knowledge/`, a `lesson/`, or a `runbook/` (or is discarded). A `lesson/` graduates
into a `guideline/` and is then deleted. `context/` is distilled at the end of work — keepers
promote to `knowledge/` or `lessons/`; the rest is disposable.

## Version control

One test: **is the content regenerable?**
- **Non-regenerable** (human intent / derived truth) → **fully tracked.** Everything except `context/`.
  Transient ≠ untracked: `lessons/` and `notes/` are committed so they survive a fresh clone.
- **Regenerable** (machine-derived session state) → track the folder + `README`, gitignore the
  contents. This is `context/` only.
- Also gitignore anything with **sensitive data** (keys, credentials, drafts) regardless of folder.
- **Local-only files:** anything whose name starts with `_` is gitignored by this folder's
  `.gitignore` — keep personal notes, secrets, or drafts local (e.g. `knowledge/_secrets.md`, or a
  whole `_scratch/` dir) even when `.ai/` is committed to a public repo. Don't prefix a file you
  intend to share.

## Archive policy

- **When:** move completed plans, outdated knowledge, superseded guidelines to `archive/` immediately.
- **Naming:** prefix with archive date — `YYYY-MM-DD_original-name.md`.
- **Retention:** deleted after 90 days unless the filename includes `_retain`.

## Optional extension folders

Scaffold only when the project needs LLM-agnostic, reimplemented-per-tool workflows:
- `skills/` — LLM-agnostic codified workflows (reimplemented per tool, e.g. `.claude/skills/`)
- `agents/` — LLM-agnostic agent definitions (reimplemented per tool, e.g. `.claude/agents/`)
