# Architecture — what `dot-ai` is and why it's shaped this way

This is the durable, high-level picture of the project: what ships, how the pieces fit, and the
reasoning behind the load-bearing design decisions. For the byte-level mechanics see
[`installer-internals.md`](./installer-internals.md); for the packaging pitfalls see
[`npm-packaging-gotchas.md`](./npm-packaging-gotchas.md). The user-facing spec for the convention
itself lives in [`../../SPEC.md`](../../SPEC.md) and the verbatim agent ruleset in
[`../../agent-instructions.md`](../../agent-instructions.md).

## Two things in one repo

`dot-ai` is two artifacts that travel together:

1. **A convention** — a `.ai/` directory of plain-Markdown project intelligence, where every folder
   answers a distinct question (`knowledge/` = what's true, `plans/` = what we intend, `context/` =
   live session state, and so on). The convention is tool-agnostic by design: it's just Markdown in
   your repo, readable by Claude, Gemini, Codex, or a human. The shipped scaffold lives in
   `template/.ai/` — twelve folders, each with a `README.md` explaining what it answers, plus two
   ignore files.

2. **An installer** — a tiny program that scaffolds that directory into a project and wires the
   convention's ruleset into the agent config file(s) the project already uses (`CLAUDE.md`,
   `GEMINI.md`, `AGENTS.md`).

The convention is the product; the installer is just the on-ramp. Everything below is about the
installer, because that's where the engineering decisions live.

## The defining decision: two installers at exact parity

There are **two** installers, and they are deliberately behavior-identical:

- **`install.sh`** — POSIX `sh`, the `curl … | sh` path. Zero runtime dependencies beyond a shell,
  `curl`, `tar`, and standard utilities. This is the natural path for macOS/Linux users.
- **`bin/cli.js`** — Node, zero npm dependencies (only built-in modules: `fs`, `path`, `readline`,
  `os`). This is the `npx @ajmarquez99/dot-ai` path, and crucially the **only** path that works on
  Windows, where `install.sh` can't run natively.

Why two? Reach. A tool-agnostic convention loses its point if installing it assumes a particular
toolchain. The shell script covers the POSIX world with nothing to install; the Node CLI covers
everyone who has Node (which, for a coding-agent audience, is nearly everyone) and is the cross-
platform/Windows story. Neither is a fallback for the other — they're co-equal front doors.

The discipline that makes "two installers" sane rather than a maintenance trap is **enforced
parity**: every behavior must be identical, and the test harness ([`../../test/install_test.sh`](../../test/install_test.sh))
runs every case against *both* runners with the same assertions. One regression-guard case
(`inject_newline_parity_case`) even diffs the two installers' output byte-for-byte on tricky inputs
(a file with no trailing newline, an empty file). If you change one installer, you change the other,
or the suite fails. Treat them as a single program with two implementations.

## How wiring works: the marked block

The installer doesn't generate config — it injects a single, clearly-delimited block into whatever
config file you point it at:

```markdown
<!-- BEGIN .ai-convention -->
…contents of agent-instructions.md…
<!-- END .ai-convention -->
```

The block is idempotent. First run **appends** it (preserving any existing content, with newline
separation). Every later run **replaces in place** the region between the markers, leaving the rest
of the file untouched. This is what lets you re-run the installer to pick up a new
`agent-instructions.md` without disturbing your own instructions, and what makes the operation safe
to run repeatedly in CI or by a script. The convention's ruleset has exactly one home in each config
file, and the installer owns only that region.

The scaffold copy is governed by the same "never clobber" principle: existing files are skipped, not
overwritten, so re-running never destroys edits you've made to a `README.md` or a knowledge doc.

## The flag surface as a coherent design

The flags aren't an ad-hoc pile; they decompose into three orthogonal questions:

- **Which tools? (targets)** — `--claude`, `--gemini`, `--codex`, or `--all`. Picks which config
  file(s) get the block.
- **Where? (scope)** — local (default) vs `--global`. Local writes `./CLAUDE.md` etc.; `--global`
  writes the user-level config (`~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md`, `~/.codex/AGENTS.md`,
  with Codex honoring `$CODEX_HOME`).
- **Whether to do MD work at all** — `--no-md` scaffolds the `.ai/` tree and its READMEs and stops,
  touching no config and no settings.

Plus two modifiers and the usual meta-flags: `--no-plans` (skip the plan-mode setting), `--dry-run`
(preview every write, change nothing), and `-h/--help` / `-V/--version`.

The combinations that don't make sense are guarded rather than silently ignored:

- `--no-md` with any tool flag or `--global` is a **contradiction** ("scaffold only" vs "do MD work")
  and exits non-zero with an explanation.
- `--global` with no tool flag does nothing useful (it only changes *where* the block goes, and
  there's no block to place), so the installer scaffolds, prints a hint, and exits 0.

With no flags and a TTY, the installer goes **interactive** — and the prompts are gated to follow the
same logic. You're first asked which tools; the local-vs-global prompt and the plans prompt only
appear *after* you've selected at least one tool, because neither question means anything otherwise.
With no flags and no TTY (piped, no terminal), it scaffolds and skips wiring, telling you to re-run
with a target flag.

## Why plans stays project-local even with `--global`

The installer can also point each tool's plan-mode output at `.ai/plans` (Claude's
`plansDirectory` in `.claude/settings.local.json`; Gemini's `general.plan.directory` in
`.gemini/settings.json`; Codex has no such setting and is skipped). This setting is **always written
to the project-local settings file, even under `--global`.**

That isn't an inconsistency — it's a consequence of what the value *is*. `.ai/plans` is a relative,
per-project path. Writing it into your global config would point every project's plan mode at a
`.ai/plans` directory that may not exist, breaking unrelated work. The convention block is a
candidate for global config (you might want the ruleset everywhere); the plans path fundamentally is
not. So `--global` moves the block and leaves the plans setting local. The harness asserts this
explicitly (`global_case` checks the plans setting lands in the work dir, never in the fake home).

## Cross-platform stance

Three deliberate choices keep both installers honest across platforms:

- **Node 14 floor.** `package.json` declares `engines: { node: ">=14" }`, and `cli.js` uses only
  APIs available at that version. CI exercises Node 18 and 20, so the 14 floor is a contract that
  must be upheld by code review, not by tests — see [`npm-packaging-gotchas.md`](./npm-packaging-gotchas.md).
- **LF line endings on the executables.** [`../../.gitattributes`](../../.gitattributes) pins
  `bin/cli.js` and `*.sh` to LF regardless of a contributor's `core.autocrlf`, because a published
  binary with a CRLF shebang silently breaks on Unix.
- **BSD/macOS-safe shell.** `install.sh` avoids GNU-isms; the block injection uses `awk` `getline`
  rather than `-v` with a multi-line value (which BSD/macOS `awk` rejects). Details in
  [`installer-internals.md`](./installer-internals.md).

## How it's verified

Three test layers, wired into CI ([`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml)):

- **`test/install_test.sh`** — the parametrized harness, every case run against both `install.sh`
  and `cli.js`. Covers scaffold copy, non-clobber, append/replace idempotency, JSON merge, the flag
  guards, `--global`, `--dry-run`, `$CODEX_HOME`, and byte-level inject parity.
- **`test/smoke.js`** — a dependency-free cross-platform smoke test of `cli.js` via filesystem
  effects and stdout. This is also the Windows CI job, since the shell harness can't run there.
- **`test/pack-install.js`** — a real `npm pack` + `npm install` round-trip that runs the *installed*
  binary. This is the only layer that catches packaging-time surprises (notably npm's
  `.gitignore` → `.npmignore` rename); from-source tests structurally cannot.

CI matrix: `ubuntu` + `macos` × Node `18`/`20` run the harness and smoke; `windows-latest` runs
smoke; a separate `package` job runs the pack-install round-trip on Node 20.
