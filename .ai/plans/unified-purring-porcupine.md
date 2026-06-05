# Implement the `.ai/` Project Directory

## Context

`ContextManagementConvention/` is an empty, non-git directory. The goal is to scaffold the
canonical agent-agnostic `.ai/` structure defined in the user's global `CLAUDE.md` so the project
has a place for project-scoped intelligence (knowledge, guidelines, runbooks, plans, etc.) that any
tool (Claude, Gemini, Codex) can consume.

The optional extension folders (`skills/`, `agents/`) are intentionally omitted until the project
actually needs LLM-agnostic, reimplemented-per-tool workflows.

## Status — scaffold already written

The directory tree and a purpose `README.md` in every folder are already created on disk:

```
.ai/
├── README.md          # overview, folder table, VC + archive policy
├── knowledge/README.md
├── guidelines/README.md
├── runbooks/README.md
├── scripts/README.md
├── templates/README.md
├── data/README.md
├── plans/README.md     # ← this plan lives here
├── audits/README.md
├── lessons/README.md
├── notes/README.md
├── archive/README.md
└── context/
    ├── README.md
    └── .gitignore       # ignores contents, keeps folder + README + .gitignore
```

Each `README.md` states the question that folder answers and what it's distinct from, drawn directly
from the convention. `context/.gitignore` implements the "regenerable → track folder, ignore
contents" rule.

## Remaining decision: git

The version-control policy in the convention (track everything except `context/` contents) only
takes effect under git, and this project isn't a repo yet. Options:

1. **`git init` + initial commit** of the `.ai/` scaffold — makes the convention's VC policy live and
   demonstrable. Recommended for a repo whose purpose is the convention itself.
2. **Leave as plain files** — no git, scaffold stands on its own.

## Verification

- `tree .ai` (or `ls -R .ai`) shows all 12 folders, each with a `README.md`.
- `cat .ai/context/.gitignore` confirms the ignore rule.
- If git is initialized: `git status --porcelain` shows every `README.md` staged-able and
  `.ai/context/` contents (if any are later added) ignored, with the folder retained via its README.
