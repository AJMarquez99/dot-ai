# dot-ai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the `.ai/` convention as a public `AJMarquez99/dot-ai` repo — a spec, a copyable template, and one-command installers — to drive cross-tool adoption.

**Architecture:** A single repo where `agent-instructions.md` is the canonical operative ruleset, `SPEC.md` is its human-readable companion, and `README.md` is the landing/pitch. `template/.ai/` is the shippable scaffold; the repo's own top-level `.ai/` dogfoods the convention. Two installers (`install.sh`, `bin/cli.js`) share identical behavior: copy the template (non-clobbering) and append-or-replace a marker-wrapped instruction block into the user's chosen agent config files.

**Tech Stack:** POSIX sh, Node.js (no deps), git, `gh` CLI. MIT licensed.

---

## File Structure

| Path | Responsibility |
|---|---|
| `README.md` | Landing/pitch: problem, quickstart, folder table, links to SPEC |
| `LICENSE` | MIT |
| `SPEC.md` | Human-readable standard (documents `agent-instructions.md`) |
| `agent-instructions.md` | **Canonical** operative ruleset (the injected block) |
| `install.sh` | POSIX installer (source-aware: local clone or remote tarball) |
| `package.json` | npx metadata; `bin` → `bin/cli.js` |
| `bin/cli.js` | Cross-platform Node installer, same behavior as `install.sh` |
| `template/.ai/**` | Shippable clean scaffold (12 folders + READMEs + `context/.gitignore`) |
| `test/install_test.sh` | Behavioral test harness for both installers |
| `.ai/**` | Repo's own dev workspace (this plan + design); not shipped |
| `.gitignore` | Ignores `node_modules`, `.ai/context/*` per convention |

**Marker contract (used by both installers):** the injected block is wrapped exactly in
`<!-- BEGIN .ai-convention -->` and `<!-- END .ai-convention -->`, on their own lines, with the
content of `agent-instructions.md` between them.

**Tool→file map (used by both installers):** `--claude`→`CLAUDE.md`, `--gemini`→`GEMINI.md`,
`--codex`→`AGENTS.md`, `--all`→all three.

---

## Task 1: Restructure into the repo layout

**Files:**
- Create: `template/.ai/` (clean scaffold)
- Keep: top-level `.ai/` (dev workspace — design + this plan)
- Create: `.gitignore`

- [ ] **Step 1: Build the clean shipped template from the existing scaffold**

The current top-level `.ai/` holds the scaffold plus dev artifacts in `plans/`. Copy the structure to
`template/.ai/`, then strip dev artifacts so the template ships clean (only `plans/README.md` remains
under `plans/`).

```bash
mkdir -p template
cp -R .ai template/.ai
# Strip dev artifacts — template ships an empty plans/ (README only)
find template/.ai/plans -type f ! -name 'README.md' -delete
ls template/.ai/plans   # expect: README.md only
```

- [ ] **Step 2: Verify the template is complete and clean**

```bash
find template/.ai -type f | sort
```
Expected: 13 files — `template/.ai/README.md`, one `README.md` in each of the 12 folders, and
`template/.ai/context/.gitignore`. No design/plan files anywhere under `template/`.

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
# context/ holds regenerable session state — track folder + README, ignore contents
.ai/context/*
!.ai/context/.gitignore
!.ai/context/README.md
template/.ai/context/*
!template/.ai/context/.gitignore
!template/.ai/context/README.md
```

- [ ] **Step 4: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold dot-ai repo layout with shipped template/.ai"
```

---

## Task 2: LICENSE (MIT)

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Write the MIT license**

```
MIT License

Copyright (c) 2026 Alejandro Marquez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "docs: add MIT license"
```

---

## Task 3: `agent-instructions.md` (canonical ruleset)

**Files:**
- Create: `agent-instructions.md`

This is the single source of truth — the exact text installers inject between the markers. It is the
`.ai/` section of the convention, phrased tool-agnostically (no Claude-specific wording).

- [ ] **Step 1: Write `agent-instructions.md`**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add agent-instructions.md
git commit -m "feat: add canonical agent-instructions ruleset (single source of truth)"
```

---

## Task 4: `SPEC.md` (human-readable companion)

**Files:**
- Create: `SPEC.md`

`SPEC.md` documents and frames `agent-instructions.md` for a human deciding to adopt. It must NOT
restate the operative rules verbatim — it links to `agent-instructions.md` for the authoritative
text and adds rationale.

- [ ] **Step 1: Write `SPEC.md`**

```markdown
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

## Adopting it

- **One command:** see the [README](./README.md) quickstart — the installer drops `.ai/` into your
  project and wires the convention into your agent's config file(s).
- **By hand:** copy [`template/.ai/`](./template/.ai) into your project and paste
  [`agent-instructions.md`](./agent-instructions.md) into your `CLAUDE.md` / `GEMINI.md` / `AGENTS.md`.

## This repo dogfoods the convention

`dot-ai` uses `.ai/` on itself — its own design docs and plans live in `.ai/plans/`. The shipped,
clean scaffold is `template/.ai/`.
```

- [ ] **Step 2: Commit**

```bash
git add SPEC.md
git commit -m "docs: add human-readable SPEC companion"
```

---

## Task 5: `README.md` (landing / pitch)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
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

## License

[MIT](./LICENSE) © 2026 Alejandro Marquez
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README pitch and quickstart"
```

---

## Task 6: `install.sh` (POSIX installer)

**Files:**
- Create: `install.sh`
- Test: `test/install_test.sh` (added in Task 8)

- [ ] **Step 1: Write `install.sh`**

```sh
#!/bin/sh
# dot-ai installer — copies template/.ai into the current project (non-clobbering)
# and appends/updates a marked convention block in chosen agent config files.
set -eu

REPO="AJMarquez99/dot-ai"
REF="main"
BEGIN="<!-- BEGIN .ai-convention -->"
END="<!-- END .ai-convention -->"

log() { printf '%s\n' "$*" >&2; }

# Resolve source: local clone if template/ is adjacent, else download tarball.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -d "$SCRIPT_DIR/template/.ai" ] && [ -f "$SCRIPT_DIR/agent-instructions.md" ]; then
  SRC="$SCRIPT_DIR"
  CLEANUP=""
else
  SRC=$(mktemp -d)
  CLEANUP="$SRC"
  log "Fetching dot-ai template…"
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/$REF.tar.gz" \
    | tar xz -C "$SRC" --strip-components=1
fi
cleanup() { [ -n "$CLEANUP" ] && rm -rf "$CLEANUP"; }
trap cleanup EXIT

# Parse tool flags.
DO_CLAUDE=0; DO_GEMINI=0; DO_CODEX=0; ANY_FLAG=0
for arg in "$@"; do
  case "$arg" in
    --all) DO_CLAUDE=1; DO_GEMINI=1; DO_CODEX=1; ANY_FLAG=1 ;;
    --claude) DO_CLAUDE=1; ANY_FLAG=1 ;;
    --gemini) DO_GEMINI=1; ANY_FLAG=1 ;;
    --codex) DO_CODEX=1; ANY_FLAG=1 ;;
    *) log "Unknown option: $arg"; exit 2 ;;
  esac
done

# 1) Copy template/.ai into cwd, never clobbering existing files.
log "Installing .ai/ scaffold…"
( cd "$SRC/template" && find .ai -type f -print ) | while IFS= read -r rel; do
  dest="./$rel"
  if [ -e "$dest" ]; then
    log "  skip (exists): $rel"
  else
    mkdir -p "$(dirname -- "$dest")"
    cp "$SRC/template/$rel" "$dest"
    log "  add: $rel"
  fi
done

# Interactive selection if no flags and a tty is available.
if [ "$ANY_FLAG" -eq 0 ]; then
  if [ -r /dev/tty ]; then
    log ""
    log "Wire the convention into which agent config files?"
    log "  [1] CLAUDE.md  [2] GEMINI.md  [3] AGENTS.md  [a] all  [n] none"
    printf 'Select (e.g. "1 3" or "a"): ' >&2
    read ans </dev/tty || ans="n"
    case "$ans" in *a*|*A*) DO_CLAUDE=1; DO_GEMINI=1; DO_CODEX=1 ;; esac
    case "$ans" in *1*) DO_CLAUDE=1 ;; esac
    case "$ans" in *2*) DO_GEMINI=1 ;; esac
    case "$ans" in *3*) DO_CODEX=1 ;; esac
  else
    log "No tty and no flags — skipping agent wiring."
    log "Re-run with --claude / --gemini / --codex / --all to wire config files."
  fi
fi

# 2) Inject the block into a single file (append, or replace existing block).
inject() {
  target="$1"
  block=$(printf '%s\n%s\n%s\n' "$BEGIN" "$(cat "$SRC/agent-instructions.md")" "$END")
  if [ -f "$target" ] && grep -qF "$BEGIN" "$target"; then
    # Replace existing marked block.
    tmp=$(mktemp)
    awk -v b="$BEGIN" -v e="$END" -v repl="$block" '
      $0==b {print repl; skip=1; next}
      $0==e {skip=0; next}
      skip!=1 {print}
    ' "$target" > "$tmp"
    mv "$tmp" "$target"
    log "  updated block in: $target"
  else
    [ -f "$target" ] && printf '\n' >> "$target"
    printf '%s\n' "$block" >> "$target"
    log "  appended block to: $target"
  fi
}

[ "$DO_CLAUDE" -eq 1 ] && inject "CLAUDE.md"
[ "$DO_GEMINI" -eq 1 ] && inject "GEMINI.md"
[ "$DO_CODEX" -eq 1 ] && inject "AGENTS.md"

log "Done."
```

- [ ] **Step 2: Make it executable and commit**

```bash
chmod +x install.sh
git add install.sh
git commit -m "feat: add POSIX install.sh (template copy + idempotent block injection)"
```

---

## Task 7: `package.json` + `bin/cli.js` (npx installer)

**Files:**
- Create: `package.json`
- Create: `bin/cli.js`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@ajmarquez99/dot-ai",
  "version": "0.1.0",
  "description": "A tiny, tool-agnostic convention for the context you give your coding agents.",
  "bin": { "dot-ai": "bin/cli.js" },
  "files": ["bin/", "template/", "agent-instructions.md", "SPEC.md", "LICENSE", "README.md"],
  "license": "MIT",
  "author": "Alejandro Marquez",
  "repository": { "type": "git", "url": "https://github.com/AJMarquez99/dot-ai.git" },
  "keywords": ["ai", "agents", "claude", "gemini", "codex", "context", "convention"]
}
```

- [ ] **Step 2: Write `bin/cli.js`**

The package ships `template/` and `agent-instructions.md`, so cli.js reads them locally (no download).

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const BEGIN = '<!-- BEGIN .ai-convention -->';
const END = '<!-- END .ai-convention -->';

function copyTree(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else if (fs.existsSync(d)) {
      console.error(`  skip (exists): ${path.relative(process.cwd(), d)}`);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      console.error(`  add: ${path.relative(process.cwd(), d)}`);
    }
  }
}

function inject(target, block) {
  if (fs.existsSync(target)) {
    const cur = fs.readFileSync(target, 'utf8');
    if (cur.includes(BEGIN)) {
      const re = new RegExp(`${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`);
      fs.writeFileSync(target, cur.replace(re, block));
      console.error(`  updated block in: ${target}`);
      return;
    }
    fs.writeFileSync(target, cur.replace(/\n?$/, '\n') + '\n' + block + '\n');
  } else {
    fs.writeFileSync(target, block + '\n');
  }
  console.error(`  appended block to: ${target}`);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

async function main() {
  const args = process.argv.slice(2);
  const want = { claude: false, gemini: false, codex: false };
  let anyFlag = false;
  for (const a of args) {
    if (a === '--all') { want.claude = want.gemini = want.codex = true; anyFlag = true; }
    else if (a === '--claude') { want.claude = true; anyFlag = true; }
    else if (a === '--gemini') { want.gemini = true; anyFlag = true; }
    else if (a === '--codex') { want.codex = true; anyFlag = true; }
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }

  console.error('Installing .ai/ scaffold…');
  copyTree(path.join(ROOT, 'template', '.ai'), path.join(process.cwd(), '.ai'));

  if (!anyFlag) {
    if (process.stdin.isTTY) {
      const ans = await ask(
        '\nWire the convention into which agent config files?\n' +
        '  [1] CLAUDE.md  [2] GEMINI.md  [3] AGENTS.md  [a] all  [n] none\n' +
        'Select (e.g. "1 3" or "a"): '
      );
      if (/a/i.test(ans)) { want.claude = want.gemini = want.codex = true; }
      if (/1/.test(ans)) want.claude = true;
      if (/2/.test(ans)) want.gemini = true;
      if (/3/.test(ans)) want.codex = true;
    } else {
      console.error('No tty and no flags — skipping agent wiring.');
      console.error('Re-run with --claude / --gemini / --codex / --all to wire config files.');
    }
  }

  const instructions = fs.readFileSync(path.join(ROOT, 'agent-instructions.md'), 'utf8').trimEnd();
  const block = `${BEGIN}\n${instructions}\n${END}`;
  if (want.claude) inject('CLAUDE.md', block);
  if (want.gemini) inject('GEMINI.md', block);
  if (want.codex) inject('AGENTS.md', block);
  console.error('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Make executable and commit**

```bash
chmod +x bin/cli.js
git add package.json bin/cli.js
git commit -m "feat: add npx installer (bin/cli.js) mirroring install.sh behavior"
```

---

## Task 8: Behavioral verification (both installers)

**Files:**
- Create: `test/install_test.sh`

- [ ] **Step 1: Write the test harness**

```sh
#!/bin/sh
# Verifies both installers: scaffold copy, non-clobber, block append + idempotent replace.
set -eu
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'ok: %s\n' "$*"; }

run_case() {
  name="$1"; shift
  runner="$1"; shift   # command prefix, e.g. "sh $REPO_ROOT/install.sh" or "node $REPO_ROOT/bin/cli.js"
  work=$(mktemp -d); cd "$work"

  # Pre-existing CLAUDE.md with user content + a sentinel that must survive.
  printf '# My instructions\nKEEP-ME\n' > CLAUDE.md

  $runner --claude
  [ -f .ai/README.md ] || fail "$name: .ai/README.md not created"
  [ "$(find .ai -type d | wc -l | tr -d ' ')" -ge 12 ] || fail "$name: missing folders"
  grep -qF 'KEEP-ME' CLAUDE.md || fail "$name: clobbered existing content"
  grep -qF '<!-- BEGIN .ai-convention -->' CLAUDE.md || fail "$name: block not appended"

  # Idempotency: second run must not duplicate the block.
  $runner --claude
  count=$(grep -cF '<!-- BEGIN .ai-convention -->' CLAUDE.md)
  [ "$count" -eq 1 ] || fail "$name: block duplicated ($count)"

  # Non-clobber: editing a scaffold file then re-running leaves the edit intact.
  echo "EDITED" >> .ai/knowledge/README.md
  $runner --claude
  grep -qF 'EDITED' .ai/knowledge/README.md || fail "$name: scaffold file clobbered"

  cd /; rm -rf "$work"
  pass "$name"
}

run_case "install.sh" "sh $REPO_ROOT/install.sh"
run_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
printf 'ALL PASS\n'
```

- [ ] **Step 2: Run the test harness — expect it to drive any fixes**

```bash
chmod +x test/install_test.sh
sh test/install_test.sh
```
Expected output ends with `ALL PASS`. If anything fails, fix the relevant installer (Task 6/7) and
re-run until green. (This is the TDD loop for installer behavior — the harness is the failing test.)

- [ ] **Step 3: Commit**

```bash
git add test/install_test.sh
git commit -m "test: add installer behavioral harness (copy, non-clobber, idempotency)"
```

---

## Task 9: Publish the repo to GitHub

**Files:** none (git/gh operations)

> `gh` is authorized for `AJMarquez99/*`. Creating a public repo and pushing is publishing — this is
> the explicitly requested outcome.

- [ ] **Step 1: Confirm clean state**

```bash
git status --porcelain   # expect empty
git log --oneline        # expect the Task 1–8 commits
```

- [ ] **Step 2: Create the public repo and push**

```bash
gh repo create AJMarquez99/dot-ai --public --source=. --remote=origin --push \
  --description "A tiny, tool-agnostic convention for the context you give your coding agents."
gh repo set-default AJMarquez99/dot-ai
```

- [ ] **Step 3: Verify the published result**

```bash
gh repo view AJMarquez99/dot-ai --web   # license badge (MIT) visible, README renders
# Smoke-test the public one-liner in a throwaway dir:
d=$(mktemp -d); cd "$d"
curl -fsSL https://raw.githubusercontent.com/AJMarquez99/dot-ai/main/install.sh | sh -s -- --all
[ -f .ai/README.md ] && grep -qF '.ai-convention' CLAUDE.md && echo "PUBLIC INSTALL OK"
cd /; rm -rf "$d"
```
Expected: `PUBLIC INSTALL OK`, GitHub shows the MIT badge and rendered README.

---

## Self-Review

**Spec coverage:** repo shape (Task 1, 5), template (Task 1), `agent-instructions.md` canonical
source (Task 3), `SPEC.md` companion (Task 4), MIT license (Task 2), `install.sh` (Task 6), npx
wrapper (Task 7), append-not-overwrite + markers + idempotency + multi-tool (Tasks 6–8), verification
(Task 8), publish (Task 9). All spec decisions mapped.

**Marker/flag consistency:** `<!-- BEGIN .ai-convention -->` / `<!-- END .ai-convention -->` and the
`--claude/--gemini/--codex/--all` → `CLAUDE.md/GEMINI.md/AGENTS.md` map are identical across
`install.sh`, `bin/cli.js`, and the test harness.

**No placeholders:** every file's full content is inline; no TBDs.

## Out of scope (follow-ups)

- Publishing `@ajmarquez99/dot-ai` (and/or unscoped `dot-ai`) to the npm registry for the short
  `npx dot-ai`. Until then the README uses `npx github:AJMarquez99/dot-ai`, which needs no registry.
- Pointing the user's global `~/.claude/CLAUDE.md` at the published repo instead of holding the prose.
- CI to run `test/install_test.sh` on push.
```
