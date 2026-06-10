# Installer internals — precise mechanics for modifying the installers

This is the reference for anyone changing [`../../install.sh`](../../install.sh) or
[`../../bin/cli.js`](../../bin/cli.js). The two installers must stay behavior-identical (see
[`architecture.md`](./architecture.md)), so each section below pairs the shell implementation with its
JS counterpart. If you change one, change the other and confirm the harness
([`../../test/install_test.sh`](../../test/install_test.sh)) still passes both runners.

References below cite `install.sh` and `bin/cli.js` line numbers as of writing; treat them as
signposts, not guarantees.

## Source resolution (shell only)

`install.sh` runs in two modes. If `template/.ai` and `agent-instructions.md` sit adjacent to the
script (a local clone), it uses the script directory as `SRC` (install.sh:43–46). Otherwise — the
`curl … | sh` case — it `mktemp -d`s a temp dir, downloads
`github.com/$REPO/archive/refs/heads/$REF.tar.gz`, and untars with `--strip-components=1`
(install.sh:47–53), cleaning up via an `EXIT` trap (install.sh:54–55).

`--help` is handled by a pre-scan *before* source resolution (install.sh:37–39) so it never triggers
a download. `--version` is handled *after* resolution (install.sh:57–61), because the version is read
out of the resolved `SRC/package.json` with `sed` (install.sh:58).

`cli.js` has no equivalent: it always runs from its own package, so `ROOT` is just
`path.join(__dirname, '..')` (cli.js:30) and the version comes from `require('../package.json')`
(cli.js:7, 139).

## Argument parsing and the contradiction guard

Both parse the same flag set into the same state: tool targets, `global`, `noMd`, `noPlans`,
`dryRun`, and an `anyFlag` sentinel that distinguishes "user passed flags" from "go interactive."
Note that `--no-plans` and `--dry-run` deliberately **do not** set `anyFlag` (install.sh:73–74,
cli.js:147–148) — they're modifiers, not targets, so passing only `--dry-run` still triggers the
interactive prompt. Unknown options exit `2` (install.sh:79, cli.js:150).

The contradiction guard: `--no-md` combined with any tool flag or `--global` exits `2` with an
explanation (install.sh:84–87, cli.js:154–157). "Scaffold only" and "do MD work" are mutually
exclusive, and the harness asserts the non-zero exit (`guard_case`).

## Scaffold copy — non-clobber and the gitignore rename

Both walk `template/.ai` and copy each file into `./.ai`, **skipping any destination that already
exists** so edits and prior installs survive (install.sh:91–108, cli.js:34–54). The harness checks
this two ways: a pre-existing file is reported `skip (exists)`, and an edited scaffold file keeps its
edit across a re-run.

The one transformation on copy: a source file named **`gitignore`** (no dot) is written to the
destination as **`.gitignore`** (install.sh:94–96 via the `*/gitignore` case;
cli.js:39 via `entry.name === 'gitignore' ? '.gitignore' : entry.name`). This exists because npm
renames `.gitignore` to `.npmignore` during pack *and* install, so the template must ship its ignore
files undotted and restore the dot here. This is the single most important packaging detail in the
project — full explanation in [`npm-packaging-gotchas.md`](./npm-packaging-gotchas.md). The harness
guards both halves: the template must contain no dotted ignore file (`template_ignore_naming_case`),
and the installed project must contain `.ai/.gitignore` but never a leaked `.ai/gitignore`.

Under `--no-md`, the scaffold is copied and then the installer stops (install.sh:111–115,
cli.js:162–166) — no config, no settings.

## Block injection — the trickiest parity point

Both build the same block: `BEGIN` marker, the contents of `agent-instructions.md`, `END` marker.

**Shell (`inject`, install.sh:172–204).** The block is written to a temp file and read back via `awk`
`getline` (install.sh:183–187). This is deliberate: BSD/macOS `awk` rejects a multi-line value passed
with `-v`, and `getline` from a file also correctly handles a block that isn't at end-of-file. The
`awk` program replaces the lines from `BEGIN` to `END` inclusive when the marker is already present;
otherwise the file is appended to.

**JS (`inject`, cli.js:56–72).** When the marker is present, it does a single regex replace —
`new RegExp(BEGIN…[\s\S]*?…END)` (non-greedy, `escapeRe`-escaped markers, cli.js:62) — substituting
the new block. Otherwise it appends.

**The newline-separation parity** is the subtle part and has its own regression guard
(`inject_newline_parity_case`, which diffs the two installers byte-for-byte). The agreed behavior:

- Appending to a **non-empty** existing file: ensure the file ends in exactly one newline, then add a
  blank separator line, then the block. In shell this is the explicit `tail -c1` check
  (install.sh:195–199); in JS it's `cur.replace(/\n?$/, '\n') + '\n' + block + '\n'` (cli.js:67).
- Appending to an **empty** existing file: still gets the leading newlines, so the two installers
  produce identical bytes (the shell `[ ! -s "$target" ]` branch, install.sh:195).
- Creating a **new** file: just `block + '\n'` (cli.js:69); in shell the file doesn't exist so the
  append path runs against an absent file (`cat "$bf" >> "$target"`, install.sh:200).

If you touch newline handling on either side, run the parity case — it's the canary.

Note the shell reads `agent-instructions.md` inline per-inject via `cat` inside the block-file
construction (install.sh:180); JS reads it once into `instructions` with `.trimEnd()` and reuses it
(cli.js:199–200). The `.trimEnd()` plus the shell's `printf '%s\n'` framing are what keep the marker
lines aligned.

## Path resolution and `--global`

Local is the default; `--global` redirects the MD target to the user home.

**Shell.** `md_target` takes a filename and a global subdir and returns either the bare filename or
`$HOME/<subdir>/<file>` (install.sh:160–162). Codex is special-cased in `codex_target`
(install.sh:165–167) because its global home honors `$CODEX_HOME`, defaulting to `~/.codex`. Targets
are selected at install.sh:206–208.

**JS.** The equivalents are `mdTarget(file, subdir)` (cli.js:195), `homeDir()` (cli.js:77, which
prefers `$HOME` so tests can redirect it and falls back to `os.homedir()` since Windows has no
`$HOME`), `codexHome()` (cli.js:196, `$CODEX_HOME || ~/.codex`), and `codexTarget()` (cli.js:197).
Targets are injected at cli.js:201–203. The `$CODEX_HOME` behavior is asserted by `codex_home_case`
and a smoke check.

`--global` with no tool selected prints the "no effect without a tool flag" hint and continues
(install.sh:141–144, cli.js:190–193) — scaffold still happens, exit stays 0 (`bare_global_case`).

## JSON settings merge — the plans directory

The plan-mode setting is merged into a JSON settings file **without clobbering existing keys**, and
**always project-local even under `--global`** (because `.ai/plans` is a relative per-project path;
see [`architecture.md`](./architecture.md)).

**Shell (`merge_json`, install.sh:219–275).** There is no JSON parser in POSIX `sh`, so it picks an
engine at runtime: `jq`, else `node`, else `python3` (install.sh:213–217). If none is available it
**skips** rather than risk corrupting the file with naive text edits (install.sh:271–273). All three
engines do the same thing: read (treating empty/missing as `{}`), set a possibly-nested dot-delimited
key creating parents, write back pretty-printed with a trailing newline; invalid JSON is reported and
skipped, not overwritten.

**JS (`mergeJsonSetting` + `setDeep`, cli.js:80–105).** Pure JS, no external engine. Same contract:
empty/missing → `{}`, invalid JSON → `skip (invalid JSON)` and return, nested key via `setDeep`,
write `JSON.stringify(data, null, 2) + '\n'`.

Per-tool wiring (install.sh:278–288, cli.js:110–124, `writePlansSetting`):

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

- Scaffold copy: `would add` per file (install.sh:101–102, cli.js:46–47).
- Inject: `would inject convention block -> <target>` (install.sh:174–177, cli.js:57).
- JSON merge: `would set <key>=<val> in: <file>` (install.sh:221–224, cli.js:92).

The harness asserts dry-run creates no `.ai`, `CLAUDE.md`, `.claude`, or `.gemini`, and prints `would`
previews — including combinations (`dryrun_combo_case`: `--no-md --dry-run` previews only the
scaffold; `--claude --no-plans --dry-run` previews the inject but no plans write). When adding a new
write, add the dry-run branch and a dry-run assertion in the same change.

## Interactive prompt flow and gating

Triggered only when `anyFlag` is false **and** a TTY is available (install.sh:118–138 via
`/dev/tty`; cli.js:168–187 via `process.stdin.isTTY` and `readline`). The flow, identical on both:

1. Ask which tools (`1`/`2`/`3`/`a`/`n`). Parsed permissively — any `a` selects all, any `1`/`2`/`3`
   toggles the matching tool, so `"1 3"` works.
2. **Only if at least one tool was selected**, ask local vs global.
3. **Only if at least one tool was selected** (and `--no-plans` wasn't passed), ask whether to set the
   plans directory (default yes).

The gating matters: local/global and plans are meaningless with no tool selected, so those prompts
never appear in that case. For flagged or non-interactive runs the plans setting defaults to **on**
(use `--no-plans` to skip) — see install.sh:148–156 and cli.js:206–214. With no flags and no TTY, the
installer scaffolds and prints "re-run with a target flag" guidance instead of prompting
(install.sh:134–137, cli.js:183–186).
