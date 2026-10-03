# Installer internals — precise mechanics for modifying the installers

This is the reference for anyone changing [`../../install.sh`](../../install.sh) or
[`../../bin/cli.js`](../../bin/cli.js). The two installers must stay behavior-identical (see
[`architecture.md`](./architecture.md)), so each section below pairs the shell implementation with its
JS counterpart. If you change one, change the other and confirm the harness
([`../../test/install_test.sh`](../../test/install_test.sh)) still passes both runners.

## Source resolution (shell only)

`install.sh` runs in two modes. If `template/.ai` and `agent-instructions.md` sit adjacent to the
script (a local clone), it uses the script directory as `SRC` (the `SCRIPT_DIR` check at the top of `install.sh`). Otherwise — the
`curl … | sh` case — it `mktemp -d`s a temp dir, downloads
`github.com/$REPO/archive/refs/heads/$REF.tar.gz`, and untars with `--strip-components=1`
(the `mktemp`/`curl` branch), cleaning up via an `EXIT` trap (`cleanup`).

`--help` is handled by a pre-scan *before* source resolution (the pre-scan loop) so it never triggers
a download. `--version` is handled *after* resolution (the `--version` check), because the version is read
out of the resolved `SRC/package.json` with `sed`.

`cli.js` has no equivalent: it always runs from its own package, so `ROOT` is just
`path.join(__dirname, '..')` and the version comes from `require('../package.json')`.

## Argument parsing and the contradiction guard

Both parse the same flag set into the same state: tool targets, `global`, `noMd`, `noPlans`,
`dryRun`, and an `anyFlag` sentinel that distinguishes "user passed flags" from "go interactive."
Note that `--no-plans` and `--dry-run` deliberately **do not** set `anyFlag` (`ANY_FLAG` in `install.sh`, `parseFlags` in `cli.js`) — they're modifiers, not targets, so passing only `--dry-run` still triggers the
interactive prompt. Unknown options exit `2` (the `case` fallthrough in `install.sh`, `parseFlags` in `cli.js`).

The contradiction guard: `--no-md` combined with any tool flag or `--global` exits `2` with an
explanation (the `NO_MD` check in `install.sh`, `runInit` in `cli.js`). "Scaffold only" and "do MD work" are mutually
exclusive, and the harness asserts the non-zero exit (`guard_case`).

## Scaffold copy — non-clobber and the gitignore rename

Both walk `template/.ai` and copy each file into `./.ai`, **skipping any destination that already
exists** so edits and prior installs survive (the scaffold loop in `install.sh`, `copyTree` in `src/lib/scaffold.js`). The harness checks
this two ways: a pre-existing file is reported `skip (exists)`, and an edited scaffold file keeps its
edit across a re-run.

The one transformation on copy: a source file named **`gitignore`** (no dot) is written to the
destination as **`.gitignore`** (`install.sh` via the `*/gitignore` case;
`copyTree` via `entry.name === 'gitignore' ? '.gitignore' : entry.name`). This exists because npm
renames `.gitignore` to `.npmignore` during pack *and* install, so the template must ship its ignore
files undotted and restore the dot here. This is the single most important packaging detail in the
project — full explanation in [`npm-packaging-gotchas.md`](./npm-packaging-gotchas.md). The harness
guards both halves: the template must contain no dotted ignore file (`template_ignore_naming_case`),
and the installed project must contain `.ai/.gitignore` but never a leaked `.ai/gitignore`.

Under `--no-md`, the scaffold is copied and then the installer stops (the `NO_MD` branch in `install.sh`; the early return in `init.run`, `src/commands/init.js`) — no config, no settings.

## Block injection — the trickiest parity point

Both build the same block: `BEGIN` marker, the contents of `agent-instructions.md`, `END` marker.

Both sides implement the **same line-based marker state machine**, not a regex against raw text, so
they can't diverge on where a line boundary or `$` falls. Each record (line) is normalized the same
way before comparison — strip a trailing `\r`, strip a leading UTF-8 BOM on **record 1 only**, then trim
surrounding spaces/tabs — and a marker only counts if the *entire* normalized line equals `BEGIN` or
`END` exactly. The scan requires well-formed, non-nested `BEGIN`/`END` pairs: an `END` before its
matching `BEGIN`, a `BEGIN` nested inside an already-open block, an unterminated `BEGIN`, or zero pairs
are all **malformed** — the file is left untouched and a warning is printed, never partially
rewritten. `LC_ALL=C` guards the shell side of this comparison (see below).

A BOM on record 1 is stripped only for comparison; when record 1 is itself a replaced marker line, the
BOM is **preserved** as the first bytes of the output on both sides, so a BOM-prefixed file keeps its
BOM.

**Shell (`block_ok` + `inject`).** `block_ok` runs first: an `awk` pass that normalizes each record
(the BOM comes in as `-v bom=`, built once at top level as `BOM=$(printf '\357\273\277')`) and walks
the same state machine purely to validate structure. On success it prints the **pair count**; on
failure it exits non-zero and `inject` warns and returns without touching the file. If the count is
greater than 1, `inject` prints `  warning: <n> convention blocks in <target> — remove the extras by
hand` and still refreshes every block. A second `awk` pass — reading the new block from a
temp file via `getline` (BSD/macOS `awk` rejects a multi-line value passed with `-v`, and `getline` also
correctly handles a block that isn't at end-of-file) — replaces every line from each `BEGIN` through
its matching `END` inclusive, stripping and re-emitting the BOM on record 1. Both `awk` invocations are
prefixed `LC_ALL=C`: macOS BWK `awk` collates in the shell's locale, and under a UTF-8 locale a stray
byte like U+200B sitting next to a marker can be treated as insignificant, making a non-marker line
falsely compare equal to `BEGIN`/`END` — a parity break, since JS string equality never does that.
`LC_ALL=C` forces a byte-exact comparison so both runners agree on which lines are markers.

**JS (`wiring.inject` → `src/lib/markers.js`).** The state machine lives in `src/lib/markers.js`
(`scanBlocks`, `replaceBlocks`, `extractBlock`) and is shared with the folder READMEs
(`folder-readme.planRefresh`), so both use one implementation. `text.split('\n')` reproduces awk's
records (popping the final empty entry when the file ends in `\n`), each record is normalized with the
identical CR-strip + record-1 BOM-strip + trim, and the same structural scan runs before any
replacement. On success, the block's lines replace each `BEGIN…END` run in place and the result is
rejoined with `\n`; on structural failure it warns and returns without writing, and a multi-pair file
gets the same duplicate-block warning as the shell side.

**The newline-separation parity** is the subtle part and has its own regression guard
(`inject_newline_parity_case`, which diffs the two installers byte-for-byte). The agreed behavior:

- Appending to a **non-empty** existing file: ensure the file ends in exactly one newline, then add a
  blank separator line, then the block. In shell this is the explicit `tail -c1` check
  in `inject`; in JS it's `cur.replace(/\n?$/, '\n') + '\n' + block + '\n'` in `wiring.inject`.
- Appending to an **empty** existing file: still gets the leading newlines, so the two installers
  produce identical bytes (the shell `[ ! -s "$target" ]` branch of `inject`).
- Creating a **new** file: just `block + '\n'` (`wiring.inject`); in shell the file doesn't exist so the
  append path runs against an absent file (`cat "$bf" >> "$target"` in `inject`).

If you touch newline handling on either side, run the parity case — it's the canary.

Note the shell reads `agent-instructions.md` inline per-inject via `cat` inside the block-file
construction in `inject`; JS reads it once into `instructions` with `.trimEnd()` and reuses it
(`wire.run` in `src/commands/wire.js`; `sync.js` reads it separately). `runInit`/`runWire` in `cli.js` only build `want` and delegate. The `.trimEnd()` plus the shell's `printf '%s\n'` framing are what keep the marker
lines aligned.

## Path resolution and `--global`

Local is the default; `--global` redirects the MD target to the user home.

**Shell.** `md_target` takes a filename and a global subdir and returns either the bare filename or
`$HOME/<subdir>/<file>` (`md_target`). Codex is special-cased in `codex_target`
because its global home honors `$CODEX_HOME`, defaulting to `~/.codex`. Targets
are selected by the three `inject` calls that follow the `inject` definition, before the `merge_json` section.

**JS.** The equivalents are `mdTarget(file, subdir)` (a closure in `wire.run`, `src/commands/wire.js`), `homeDir()` (`src/lib/cascade.js` / `wiring.js`, which
prefers `$HOME` so tests can redirect it and falls back to `os.homedir()` since Windows has no
`$HOME`), `codexHome()` (`$CODEX_HOME || ~/.codex`), and `codexTarget()` (also closures in `wire.run`).
Targets are injected by `wire.run`, which `init.run` delegates to. The `$CODEX_HOME` behavior is asserted by `codex_home_case`
and a smoke check.

`--global` with no tool selected prints the "no effect without a tool flag" hint and continues
(the bare-`--global` hint in `install.sh` and `runInit`) — scaffold still happens, exit stays 0 (`bare_global_case`).

## JSON settings merge — the plans directory

The plan-mode setting is merged into a JSON settings file **without clobbering existing keys**, and
**always project-local even under `--global`** (because `.ai/plans` is a relative per-project path;
see [`architecture.md`](./architecture.md)).

**Shell (`merge_json`).** There is no JSON parser in POSIX `sh`, so it picks an
engine at runtime: `jq`, else `node`, else `python3` (the engine probe at the top of `merge_json`). If none is available it
**skips** rather than risk corrupting the file with naive text edits (the no-engine branch of `merge_json`). All three
engines do the same thing: read (treating empty/missing as `{}`), set a possibly-nested dot-delimited
key creating parents, write back pretty-printed with a trailing newline; invalid JSON is reported and
skipped, not overwritten.

**JS (`mergeJsonSetting` + `setDeep`, `src/lib/wiring.js`).** Pure JS, no external engine. Same contract:
empty/missing → `{}`, invalid JSON → `skip (invalid JSON)` and return, nested key via `setDeep`,
write `JSON.stringify(data, null, 2) + '\n'`.

Per-tool wiring (`writePlansSetting` in `wiring.js`; the per-tool `merge_json` calls in `install.sh`):

- **Claude** → `.claude/settings.local.json`, key `plansDirectory` = `.ai/plans`.
- **Gemini** → `.gemini/settings.json`, key `general.plan.directory` = `.ai/plans`, plus a printed
  reminder that Gemini also needs a `~/.gemini/policies` rule to permit writes there (the installer
  does **not** touch global policy).
- **Codex** → no plans setting exists; prints a skip note.

The harness checks the merge preserves an existing key, produces valid JSON, sets the right nested
Gemini key, and that `--no-plans` writes no settings file at all.

## `--dry-run` threading

`--dry-run` must reach **every** write site, because a single missed write breaks the "writes
nothing" guarantee. The pattern is: each function that writes takes the dry flag and, when set, logs a
`would …` line and returns before any filesystem effect.

- Scaffold copy: `would add` per file (the scaffold loop in `install.sh`, `copyTree`).
- Inject: a current block that needs no change prints `unchanged: <target>` regardless of `--dry-run`
  (nothing to preview); a stale or absent block previews `would inject convention block -> <target>`
  and writes nothing. A real (non-dry) run instead prints `updated block in: <target>` when replacing
  an existing block or `appended block to: <target>` when adding a new one — never previewed under
  `--dry-run` since no write happens.
- JSON merge: `would set <key>=<val> in: <file>` (`merge_json`, `mergeJsonSetting`).

The harness asserts dry-run creates no `.ai`, `CLAUDE.md`, `.claude`, or `.gemini`, and prints `would`
previews — including combinations (`dryrun_combo_case`: `--no-md --dry-run` previews only the
scaffold; `--claude --no-plans --dry-run` previews the inject but no plans write). When adding a new
write, add the dry-run branch and a dry-run assertion in the same change.

## Interactive prompt flow and gating

Triggered only when `anyFlag` is false **and** a TTY is available (the `/dev/tty` prompt block in
`install.sh`; `promptForWiring` in `cli.js` via `process.stdin.isTTY` and `readline`). The flow, identical on both:

1. Ask which tools (`1`/`2`/`3`/`a`/`n`). Parsed permissively — any `a` selects all, any `1`/`2`/`3`
   toggles the matching tool, so `"1 3"` works.
2. **Only if at least one tool was selected**, ask local vs global.
3. **Only if at least one tool was selected** (and `--no-plans` wasn't passed), ask whether to set the
   plans directory (default yes).

The gating matters: local/global and plans are meaningless with no tool selected, so those prompts
never appear in that case. For flagged or non-interactive runs the plans setting defaults to **on**
(use `--no-plans` to skip) — see the `NO_PLANS` handling in `install.sh` and the `wantPlans` logic in `runInit` (`bin/cli.js`); `writePlansSetting` only writes what it is told. With no flags and no TTY, the
installer scaffolds and prints "re-run with a target flag" guidance instead of prompting
(the non-TTY branch in `install.sh` and `runInit`).
