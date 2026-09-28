# Tiered startup loading + folder indexes — design

**Date:** 2026-09-27 · **Status:** draft, awaiting review · **Branch:** `chore/community-readiness`
(move to its own branch before implementation) · **Target release:** `1.1.0`

## Problem

The shipped convention block tells agents, at session start, to read `knowledge/`, `guidelines/`,
`lessons/` and `context/` in full — in **every** `.ai/` layer from the working directory up to `~/.ai/`.
Measured from this repo (five layers), that is **~490 KB (~120K+ tokens) before the agent does any
work**; half of it is `~/.ai/context/` (246 KB, 42 files of other sessions' handoff state). Daedabyte
client repos add 13–24 guideline files each, read in full, every session.

The rule treats every folder and every layer as equally important. They are not.

## Goals

1. Bound startup cost: load what matters for the session, discover the rest through indexes.
2. Keep the convention instruction-first ("plain Markdown any agent reads directly") — the CLI helps,
   it is never required.
3. Give every folder a standard, machine-maintainable index, kept current by agents as they work.
4. Let convention changes reach existing repos' folder READMEs (today `sync` skips existing READMEs,
   which is why they still say "Auto-loaded at session start").

## Non-goals (follow-up: "index rollout")

- Backfilling indexes across existing repos on this machine (~30 layers).
- Converting existing bullet-style indexes (`~/.ai`, `dot-ai/.ai`) to the table format.
- A `doctor` index-drift check (would flag ~30 layers before the rollout).
- A `context --digest` command, `--json` output (see `notes/json-output-and-mcp-followup.md`).

## Design

### 1. Loading tiers (replaces "Session-startup behavior" in `agent-instructions.md`)

Ordered by importance, as decided in design review:

| Tier | What | When |
|---|---|---|
| 1 | **Nearest** layer's `knowledge/` + `guidelines/` | Read at session start (follow an index's reading order if it gives one) |
| 2 | **Global** `~/.ai/` `knowledge/` + `guidelines/` | Read the **indexes** at start; open entries relevant to the task |
| 3 | **Intermediate** layers (between nearest and global) | Not loaded; consult their indexes when the task reaches that scope |
| 4 | `context/` — nearest layer only | Only when the session continues prior work; skipped on a fresh start |
| 5 | `lessons/` — nearest, then global | Only when stuck (error, correction, repeated failure). **If a lesson applies, propose promoting it** into its `guidelines/`/`knowledge/` home, then delete it |
| — | `runbooks/`, `plans/`, `audits/`, `notes/`, `templates/`, `scripts/`, `data/`, `archive/` | Unchanged: on-task, via index |

Structure validation and "offer to scaffold" are unchanged.

Tier 5 deliberately couples lesson promotion to the moment a lesson proves relevant: the round-1 eval
audit measured a **3% promotion rate** (1/30) because promotion is clean-up nobody schedules.

**Nested cascade section** changes from "Read every `.ai/` … up to `~/.ai/`" to: every layer up to
`~/.ai/` is **available**; the tiers decide what is **loaded**; nearest-wins precedence still applies to
whatever is read.

### 2. Folder indexes

**Format (standard):** a `## Index` section in each folder's `README.md`, as a table:

```markdown
## Index

| File | Answers |
|---|---|
| [architecture.md](architecture.md) | How the system is put together and why |
| [design/](design/README.md) | Routed sub-index — read its README, not its files |
```

- One row per top-level, non-`_` entry of the folder (files and subfolders), excluding `README.md`,
  `_README.md`, `.gitignore`, `.gitkeep`.
- **`_` entries never appear in `README.md`.** The README is committed and may be public; listing a
  private file there leaks its existence and subject even though its contents are gitignored.
- **Private index — `_README.md` (optional, on request).** When the user wants private files indexed,
  the folder gets a `_README.md` holding the same `## Index` table for its `_` entries only. It is
  gitignored by the existing `_*` rule — no new mechanism. It is created only when the user asks for it
  (or `dot-ai index --private`), never automatically. Agents that read a folder's index also read its
  `_README.md` if present.
- Optional free text after the table (e.g. interlock's "Reading order for a new session:").
- **Folders without an index:** `context/` (disposable, gitignored) and `archive/` (date-stamped,
  pruned). Their READMEs carry no `## Index` section.

**Maintenance — autonomous, in the instructions:** a new "Indexes" paragraph in the convention block:

> Maintain folder indexes as you work, without being asked. When you create, rename, move, promote,
> or archive a file under `.ai/`, update that folder's `## Index` in the same change. If a folder has
> files but no index, add one. Never list `_` files in `README.md`; index them in the folder's
> `_README.md` only if one exists or the user asks for one. When reading an index, also read
> `_README.md` if present. The user may also ask you to reindex a folder or layer — do it the same
> way. `dot-ai index` can add missing rows for you; you write the "Answers" text.

### 3. Managed blocks in folder READMEs

Every shipped folder README becomes a **managed block + user-owned remainder**, reusing the existing
`<!-- BEGIN … -->`/`<!-- END … -->` mechanism from `src/lib/wiring.js`:

```markdown
<!-- BEGIN .ai-folder -->
# knowledge/

**Answers: what is true / why.** … Distinct from `context/` …

**Loading:** nearest layer read at session start; other layers consulted via this index.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

- The block holds everything the convention owns: heading, "Answers:" description, distinct-from,
  **loading tier**, and folder-specific policy (e.g. `context/`'s version-control section).
- Everything outside the markers — the index and any project prose — is user-owned; no command edits
  it except `dot-ai index` (§4), which touches only the `## Index` section.
- Markers: `<!-- BEGIN .ai-folder -->` / `<!-- END .ai-folder -->` (distinct from `.ai-convention`).

**Per-folder loading line** (the only substantive wording change inside the blocks):

| Folder | Loading line |
|---|---|
| `knowledge/`, `guidelines/` | Nearest layer read at session start; other layers consulted via this index. |
| `lessons/` | Consulted when stuck, not at session start. An applicable lesson should be promoted, then deleted. |
| `context/` | Nearest layer only, and only when continuing prior work. |
| all others | Consulted on-task via this index — not auto-loaded. (`runbooks/` keeps its existing wording.) |

**`dot-ai sync` — folder README handling** (new step, after `copyTree`):

| README state | Action |
|---|---|
| Missing | Created from template (existing `copyTree` behaviour) |
| Has `.ai-folder` markers | Replace the block with the template's block; rest untouched |
| No markers, **starts with the exact v1.0.0 template text** for that folder | Replace that prefix with the block; keep the remainder (e.g. an existing `## Index`) |
| No markers, anything else (customized intro) | **Leave untouched**; print `skip (customized README, no managed block): <path>` |

- Exact-prefix match only (after normalizing CRLF→LF). The v1.0.0 template READMEs have a single
  version in git history (`caef32b`), so they are the only migration source. Never heuristic.
- Idempotent: a second `sync` changes nothing. `--dry-run` previews every action.
- `init` on a fresh `.ai/` gets the new READMEs via `copyTree`; `install.sh` copies the same template
  bytes, so installer parity holds with no `install.sh` logic change (verify byte-identical output).

**Base template for new folders:** ship `template/.ai/templates/folder-README.md` — a generic block
(placeholder heading/description/loading line) plus an empty index table. Agents copy it when creating
a new folder or routed subfolder (e.g. `guidelines/design/`). It lives in `templates/` because that
folder answers "what to start from".

### 4. `dot-ai index [folder] [--private] [--dry-run]`

Adds missing index rows for those who prefer to hand-tailor with commands. Node-only (like all v1.0
lifecycle subcommands; not an installer flag, so no `install.sh` parity requirement).

- **Scope:** nearest `.ai/` (via `findRoot`). With `folder` (a folder name, e.g. `knowledge`), that
  folder only; without, every folder that has an index (all canonical folders except `context/`,
  `archive/`, plus present optional ones).
- **Detects listed entries** by link target or backticked name anywhere in the `## Index` section, so
  it works on bullet-style indexes too.
- **Adds** a row for each unlisted entry with the placeholder `TODO: describe` (greppable; agents and a
  future `doctor` check can find it). New entries match the section's style: table row if the section
  is a table, bullet `- [x](x) — TODO: describe` if it is a bullet list. Missing `## Index` section →
  appended as a table (or the full block+index if the README is missing).
- **`_` entries:** skipped for `README.md`. If the folder already has `_README.md`, unlisted `_`
  entries are added there. `--private` creates `_README.md` (from the base template's index table) when
  missing, then does the same. Without either, `_` entries are ignored silently.
- **Never** rewrites or removes existing rows. Rows pointing at missing files are **reported**
  (`stale index entry: <name>`), not deleted. A `_` entry found in `README.md`'s index is **reported**
  (`private entry in public index: <name>`) so the user can move it — also not auto-removed. (Existing
  `~/.ai` READMEs will trigger this; the rollout follow-up moves them.)
- Output to stderr, matching the other commands. Exit `0` ok, `2` no `.ai/` found / unknown folder /
  unknown option.
- `--help` text and `README.md` command table gain the `index` line.

### 5. Docs and dogfooding

- `README.md` / `SPEC.md`: update any description of startup loading; document indexes, managed blocks,
  and `dot-ai index`.
- This repo's `.ai/` folder READMEs migrate via `dot-ai sync` from source (proves the migration path);
  its existing bullet indexes stay bullets (conversion is the rollout follow-up).
- After release, the user runs `dot-ai sync --global` to refresh `~/.claude/CLAUDE.md`. Not done by the
  agent.

## Testing / verification

- **Unit (Node, existing `check()` idiom):**
  - `test/index.test.js`: adds rows for unlisted files; `_` files never written to `README.md`; `_`
    rows go to an existing `_README.md`; `--private` creates `_README.md`; no `_README.md` and no
    `--private` → `_` entries ignored; `_` entry already in `README.md` reported, not removed;
    subfolders link to their README; bullet-style section gets bullets; never alters existing rows;
    reports stale entries;
    `--dry-run` writes nothing; exit 2 on no `.ai/` and on unknown folder; `context/`/`archive/`
    excluded.
  - `test/sync.test.js` additions: each row of the README-state table above; idempotency (second run
    is a no-op); dry-run writes nothing; customized README untouched and reported.
- **Installer parity:** `npm test` (`install_test.sh`) and `npm run smoke` pass; scaffold output of
  `install.sh` and `cli.js init` is byte-identical.
- **Packaging:** `npm run pack-test` — the new `templates/folder-README.md` ships in the tarball.
- **Cost check:** re-run the per-layer byte measurement from this repo and record startup bytes under
  the new tiers (expected: ~41 KB nearest + ~3 KB global indexes, vs ~490 KB).
- **Diff against `main`** before PR to catch unintended changes.

## Acceptance criteria

1. The shipped convention block states the five tiers, the index format, and autonomous index
   maintenance; no remaining instruction says to read every layer's folders in full.
2. No shipped README says "Auto-loaded at session start" for `lessons/` or `context/`.
3. `dot-ai sync` migrates unmodified v1.0.0 READMEs to managed blocks, refreshes existing blocks, and
   leaves customized READMEs untouched — idempotently.
4. `dot-ai index` adds `TODO: describe` rows for unlisted entries without altering existing ones, and
   never writes a `_` entry into `README.md`.
5. All test suites pass; installer parity holds; the tarball contains the new template.

## Open risks

- **The tiers are still "a sentence."** Per the eval audit's rule, a behaviour that matters needs a
  mechanism. `dot-ai index` + a future `doctor` drift check are the mechanism for index freshness; tier
  compliance itself remains unmeasured until Unit C (controlled harness) runs.
- **Tier 1 is unbounded by construction** — a repo with 24 guideline files still loads all of them.
  The index "reading order" line is the escape hatch; revisit if rollout data shows large nearest layers.
