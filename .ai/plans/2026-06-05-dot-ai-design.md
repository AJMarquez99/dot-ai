# Design: `dot-ai` — a public repo promoting the `.ai/` convention

**Date:** 2026-06-05
**Status:** Approved (brainstorming) → ready for implementation plan

## Context

The `.ai/` convention (an agent-agnostic project directory for storing project-scoped
intelligence) currently exists only as prose inside the user's global `~/.claude/CLAUDE.md`.
The goal is to publish it as a public GitHub repo under the personal account `AJMarquez99` so that
agentic-coding users across tools (Claude, Gemini, Codex) can discover and adopt it. Adoption is the
explicit objective — the repo is a promotion vehicle, not just storage.

This project directory (`ContextManagementConvention/`) already contains the scaffolded `.ai/`
structure built earlier; that scaffold becomes the shipped template.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Repo name | `dot-ai` (public, under `AJMarquez99`) |
| Artifact | Spec + copyable template + install script (full package) |
| Installer | Canonical POSIX `install.sh` **and** a thin cross-platform `npx` wrapper |
| Agent wiring | One canonical snippet; installer places it into the user's chosen config file(s) |
| Multi-tool | User selects one/several/all of `CLAUDE.md`, `GEMINI.md`, `AGENTS.md` |
| Write behavior | **Append, never overwrite**; idempotent via sentinel markers |
| License | MIT, `Copyright (c) 2026 Alejandro Marquez` |

## Source-of-truth model

- **`agent-instructions.md`** — the single source of truth. Terse, operative rules an LLM acts on
  (session-startup loading, where each artifact goes, the inbox→processed lifecycle, VC policy,
  archive policy). The injected config block and the template's folder READMEs derive from this; a
  given rule is stated **once**.
- **`SPEC.md`** — human-readable companion that explains and pitches `agent-instructions.md`
  (rationale, folder-semantics table, the "why"). It documents the rules; it does not redefine them.
- **`README.md`** — repo landing/promotion only: problem statement, 30-second quickstart, install
  one-liners, links to `SPEC.md` for depth. Deliberately short to avoid restating `SPEC.md`.

## Repo structure

```
dot-ai/
├── README.md              # pitch: problem, quickstart, install one-liners, links to SPEC
├── LICENSE                # MIT, Copyright (c) 2026 Alejandro Marquez
├── SPEC.md                # human-readable standard: folder semantics, lifecycle, VC + archive policy
├── agent-instructions.md  # canonical operative snippet (content of the BEGIN/END block)
├── install.sh             # canonical POSIX installer (curl | sh)
├── package.json           # npx wrapper metadata; bin → bin/cli.js
├── bin/
│   └── cli.js             # thin cross-platform npx entry, same install logic
└── template/
    └── .ai/               # the shipped scaffold (12 folders + purpose READMEs + context/.gitignore)
        ├── README.md
        ├── knowledge/ guidelines/ runbooks/ scripts/ templates/ data/
        ├── plans/ audits/ lessons/ notes/ archive/
        └── context/{README.md, .gitignore}
```

The optional `skills/` and `agents/` extension folders are **not** shipped in the template (created
only when a project needs them), matching the convention.

## Install flow (identical for `install.sh` and `npx`)

1. **Copy `template/.ai/` into the target project (cwd).** Never clobbers: if `.ai/` already exists,
   add only missing folders/READMEs and leave every existing file untouched.
2. **Select agent config targets** — multi-select among `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`.
   Interactive prompt when run in a TTY (reading from `/dev/tty` so it works under `curl | sh`);
   `--claude --gemini --codex --all` flags for the non-interactive path.
3. **Append-or-replace the convention block** in each chosen file, wrapped in
   `<!-- BEGIN .ai-convention -->` … `<!-- END .ai-convention -->`, sourced from
   `agent-instructions.md`. Create the file if missing; append if no markers present; replace only
   the marked block if markers exist (idempotent — re-running upgrades in place, never duplicates,
   never touches the user's other instructions).

## Quickstart (README)

```sh
# POSIX
curl -fsSL https://raw.githubusercontent.com/AJMarquez99/dot-ai/main/install.sh | sh

# npx
npx dot-ai            # falls back to @ajmarquez99/dot-ai if the unscoped name is taken
```

## Open implementation sub-decisions

- **npm name:** plan for the scoped `@ajmarquez99/dot-ai`; attempt to claim unscoped `dot-ai`.
- **Two installer code paths:** `install.sh` (POSIX) and `bin/cli.js` (Node, cross-platform incl.
  Windows) both implement the same three steps. Keep each small; the shared inputs are
  `template/.ai/` and `agent-instructions.md`, so behavior stays consistent.
- **Repo's own `.ai/` vs shipped `template/.ai/`:** during implementation, separate the repo's own
  working files (this design doc, dev notes) from the clean template that ships. This design doc is a
  dev artifact, not part of the shipped template.

## Verification (for the eventual implementation)

- **Template copy:** run installer in an empty dir → `.ai/` appears with all 12 folders + READMEs;
  re-run → no changes, existing files untouched.
- **Idempotency:** run twice against a `CLAUDE.md` that has pre-existing content → convention block
  appears exactly once, original content intact; edit `agent-instructions.md`, re-run → block updates
  in place.
- **Multi-tool:** `--all` writes the block to all three config files; single flag writes only one.
- **Both paths:** `sh install.sh` and `node bin/cli.js` produce byte-identical results on the same
  input.
- **License/landing:** GitHub shows the MIT badge; README quickstart commands run as written.

## Out of scope (follow-ups)

- Pointing the user's global `~/.claude/CLAUDE.md` at the published repo instead of holding the full
  prose.
- CI, tests-as-code, marketing beyond the README.
