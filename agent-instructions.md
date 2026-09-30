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
- **Public repository?** Favor sharing over hiding — the convention assumes `.ai/` is committed and
  legible to anyone who clones the repo. Commit the shareable folders (`knowledge/`, `guidelines/`,
  `runbooks/`) and write them *for* that audience. Keep anything personal or sensitive — scratch
  notes, secrets, half-formed drafts — local by prefixing the file or folder with `_`: the shipped
  `.ai/.gitignore` ignores anything starting with `_` (e.g. `knowledge/_secrets.md`, or a whole
  `_scratch/` dir). Don't prefix a file you intend to share. Gitignoring the whole `.ai/` directory
  is the fallback for repos that are private by default — not the default move.

## Archive policy

- **When:** move completed plans, outdated knowledge, and superseded guidelines to `archive/`
  immediately upon completion or replacement.
- **Naming:** prefix with the archive date — `YYYY-MM-DD_original-name.md`.
- **Retention:** deleted after 90 days unless the filename includes `_retain`.

## Session-startup behavior

At the start of every session, check whether `.ai/` exists in the working directory. **If none
exists:** offer to scaffold it (omit the optional extension folders until needed). **If it exists,
load by importance, not everything** — each folder's `README.md` has an `## Index`; below tier 1,
read the index, then open only the files the task needs.

1. **Nearest `.ai/`:** read `knowledge/` and `guidelines/` in full (in the index's reading order if
   it gives one).
2. **Global `~/.ai/`:** read the `knowledge/` and `guidelines/` indexes; open the entries that bear
   on the task.
3. **Intermediate layers:** don't load them at startup — consult their indexes when the task
   reaches that scope.
4. **`context/`:** nearest layer only, and only when continuing prior work; skip it on a fresh start.
5. **`lessons/`:** only when stuck (an error, a correction, a repeated failure) — check the nearest
   layer, then global. When a lesson applies, propose promoting it into its `guidelines/` or
   `knowledge/` home, then delete the lesson.

Everything else — `runbooks/`, `plans/`, `audits/`, `notes/`, `templates/`, `scripts/`, `data/` — is
consulted on-task via its index; `archive/` by filename. Surface `notes/` only if relevant.

- **Validate the structure:** compare the layout to this canonical structure. If folders are missing,
  misnamed, or files sit in the wrong category, offer to restructure — never restructure silently.

## Folder indexes

Every folder except `context/` and `archive/` has an `## Index` in its `README.md`: a
`| File | Answers |` table with one row per top-level file or subfolder. The convention-owned text
above it sits between `<!-- BEGIN .ai-folder -->` markers and is refreshed by `dot-ai sync`; the
index is yours.

- **Maintain indexes as you work, without being asked.** When you create, rename, move, promote, or
  archive a file under `.ai/`, update that folder's index in the same change. If a folder has files
  but no index, add one; start new folders from `templates/folder-README.md`. The user may also ask
  you to reindex a folder or layer — do it the same way.
- **Never list `_` files in `README.md`** — it is committed. Index them in the folder's gitignored
  `_README.md` only if one exists or the user asks for one. When reading an index, also read
  `_README.md` if present. Other gitignored files are listed name-only as `` `name` (local) `` with no
  link, since other clones won't have them. The name itself is still committed — use the `_` prefix
  for anything whose name is sensitive.
- `dot-ai index` adds rows for unlisted files (`TODO: describe`); you write the "Answers" text.

## Nested cascade

**Nested cascade.** Every `.ai/` from the working directory up to and including `~/.ai/` (the
machine-global layer) is available, applied additively — outer is broad, inner is specific, and on
a same-folder/same-filename collision the nearest layer wins. Available is not loaded: the startup
tiers above decide what is read.
