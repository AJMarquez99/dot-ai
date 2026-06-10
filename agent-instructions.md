# The `.ai/` Project Directory Convention

The `.ai/` directory is an agent-agnostic project directory for storing project-scoped intelligence,
shared across tools (Claude, Gemini, Codex, etc.). It is not specific to any one agent.

## Structure

```
.ai/
├── knowledge/    # Durable truth: domain knowledge, architecture, "why it is this way"
├── guidelines/   # Standing rules: conventions, coding standards, style guides
├── runbooks/     # HOW operational tasks are done — procedures with judgment (indexed, not auto-loaded)
├── scripts/      # Deterministic automation that RUNS (executable tooling)
├── templates/    # Blank scaffolds to copy & fill (PRs, issues, docs, code)
├── data/         # Concrete reference data consumed as-is (datasets, fixtures, lookup tables)
├── plans/        # Implementation plans, roadmaps, design docs (→ archive when done)
├── audits/       # Point-in-time assessments (SEO, a11y, performance, security, code quality)
├── lessons/      # Corrections learned, staged to promote into guidelines (transient lifecycle)
├── notes/        # Undeveloped thoughts to revisit later (idea inbox)
├── context/      # Cross-session/agent coordination & handoff state (regenerable)
└── archive/      # Historical records (date-stamped, 90-day retention)
```

**Optional extension** — scaffold only when the project needs agent-agnostic, reimplemented-per-tool
workflows: `skills/` (codified workflows) and `agents/` (agent definitions).

## What each folder answers

Every folder answers a distinct question. If you can't say which question a file answers, it's
probably in the wrong place.

| Folder | Answers | Distinct from |
|---|---|---|
| `knowledge/` | What is true / why | `context/` (live state, not durable truth) |
| `guidelines/` | What rules we follow | `lessons/` (a rule not yet crystallized) |
| `runbooks/` | **How** a task is performed (with judgment) | `scripts/` (runs), `skills/` (agent-invoked) |
| `scripts/` | How, **automated** (deterministic, no judgment) | `runbooks/` (the non-automatable steps) |
| `templates/` | What to start from (a blank to fill) | `data/` (concrete values consumed as-is) |
| `data/` | What raw inputs exist | `templates/` (scaffolds, not values) |
| `plans/` | What we intend to do | `audits/` (a point-in-time finding) |
| `audits/` | What was true at time T | `knowledge/` (durable, not a dated snapshot) |
| `lessons/` | What we just learned (→ becomes a guideline) | `notes/` (lessons are actionable rules) |
| `notes/` | What might be worth a look later | `lessons/` (notes aren't actionable yet) |
| `context/` | The live working state / handoff | `knowledge/` (context is disposable) |

**The how-triangle:** `scripts/` *runs*, `runbooks/` is *followed* (includes "if X looks wrong,
stop"), and the optional `skills/` is *invoked by the agent*. A runbook commonly references a script
for its automatable steps.

**Inbox → processed lifecycle:** `notes/` is the rawest inbox — a thought graduates into a `plan/`,
`knowledge/`, a `lesson/`, or a `runbook/` (or is discarded). A `lesson/` graduates into a
`guideline/` and is then deleted. `context/` is distilled at the end of work — keepers promote to
`knowledge/` or `lessons/`; the rest is disposable.

## Version control

One test: **is the content regenerable?**
- **Non-regenerable** (human intent / derived truth) → **fully tracked.** Everything except
  `context/`. Transient ≠ untracked: `lessons/` and `notes/` are committed so they survive a fresh
  clone.
- **Regenerable** (machine-derived session state) → **track the folder + a `README`, gitignore the
  contents.** This is `context/` only.
- Additionally gitignore anything containing **sensitive data** (keys, credentials, drafts).
- **Public repository?** If some `.ai/` content isn't meant for the world, gitignore the whole
  directory or just the specific subdirectories that hold it (e.g. `plans/`, `notes/`). The
  convention works the same whether or not `.ai/` is committed.
- **Keep individual files local.** Anything whose name starts with `_` is gitignored by the shipped
  `.ai/.gitignore` — so you can commit the scaffold and shared files in a public repo while keeping
  personal notes, secrets, or drafts on your machine (e.g. `knowledge/_secrets.md`, or a whole
  `_scratch/` dir). Don't prefix a file you intend to share.

## Archive policy

- **When:** move completed plans, outdated knowledge, and superseded guidelines to `archive/`
  immediately upon completion or replacement.
- **Naming:** prefix with the archive date — `YYYY-MM-DD_original-name.md`.
- **Retention:** deleted after 90 days unless the filename includes `_retain`.

## Session-startup behavior

At the start of every session, check whether `.ai/` exists in the working directory:
- **If it exists:** read `knowledge/`, `guidelines/`, `lessons/`, and `context/` before proceeding.
  Do NOT auto-load `runbooks/` (consult on-task via their index), `scripts/`, `templates/`, `data/`,
  `plans/`, `audits/`, or `archive/`. Surface `notes/` only if relevant to the task.
- **Validate the structure:** compare the layout to this canonical structure. If folders are missing,
  misnamed, or files sit in the wrong category, offer to restructure — never restructure silently.
- **If it does not exist:** offer to scaffold it (omit the optional extension folders until needed).
