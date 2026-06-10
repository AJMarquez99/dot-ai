# Contributing Conventions

Standing rules for working on `dot-ai`. The single most important one lives in
[`parity.md`](./parity.md): `install.sh` and `bin/cli.js` must behave identically. Everything below is
the language- and packaging-level discipline that keeps both installers correct across the platforms
we support.

## `install.sh` — POSIX shell

- **Target POSIX `sh`, not bash.** The file is `#!/bin/sh` with `set -eu`. No bashisms (no `[[ ]]`, no
  arrays, no `local` outside a function body relying on bash semantics, no `${var,,}`).
- **Stay `shellcheck`-clean.** Run `shellcheck install.sh test/install_test.sh` before committing.
  Where a warning is a deliberate idiom, suppress it inline with a justifying comment — e.g. the
  `# shellcheck disable=SC1007` on the `CDPATH= cd` source-resolution line.
- **BSD/macOS `awk` cannot take a multi-line `-v` value.** The convention block is written to a temp
  file and read in with `awk`'s `getline`, not passed via `-v`. Don't "simplify" this back to an
  inlined value — it works on GNU awk and silently breaks on macOS. `getline` also correctly handles a
  block that isn't at end-of-file.
- **Use `$HOME`, never `~`, inside variables.** Tilde does not expand inside double quotes or variable
  assignments; the global-target helpers build paths as `"$HOME/$2/$1"`.
- **Don't assume a JSON tool exists.** JSON merges try `jq`, then `node`, then `python3`, and **skip
  with a message** if none is present rather than corrupting a settings file with text edits. Keep all
  three branches producing identical output.
- **`cd` in a subshell, or use `CDPATH= cd --`.** Avoid leaking directory changes; mirror the existing
  `( cd "$SRC/template" && … )` and `CDPATH= cd -- "$(dirname -- "$0")"` patterns.

## `bin/cli.js` — Node

- **Zero runtime dependencies.** `package.json` has no `dependencies`. Only Node built-ins
  (`fs`, `path`, `os`, `readline`, `child_process` in tests). Adding a dependency is a design change,
  not a convenience.
- **Use only APIs present in Node 14.** `engines` declares `node >=14`, but CI runs Node 18 and 20 —
  so a newer API will pass CI and still break the declared floor. This is a real trap. Avoid, among
  others:
  - `fs.cpSync` (16.7) — we recurse manually in `copyTree`.
  - `structuredClone` (17).
  - `String.prototype.replaceAll` (15) — use `.replace(/…/g, …)`.
  - `Array.prototype.at` (16.6), `Object.hasOwn` (16.9), `fs.rmSync`'s newer options, top-level await.
  - If unsure, check the API's "Added in" version before using it.
- **Pure-JS JSON handling.** Parse/merge/stringify in-process (`JSON.parse` → `setDeep` →
  `JSON.stringify(data, null, 2) + '\n'`). Never shell out to `jq`/`python3` from `cli.js`.
- **Prefer `process.env.HOME` with an `os.homedir()` fallback** (`homeDir()`), so tests can redirect
  `HOME` and Windows — which has no `$HOME` — still resolves a home directory.

## The `_` prefix and shipping ignore files

- **`_`-prefixed files stay local.** The shipped `.ai/.gitignore` is `_*`. Prefix anything personal,
  secret, or in-flight (`knowledge/_secrets.md`, a `_scratch/` dir) to keep it off git in a public
  repo. Never prefix a file you intend to share. This repo dogfoods the rule on its own `.ai/`.
- **Ship template ignore files as `gitignore`, never `.gitignore`.** npm renames `.gitignore` →
  `.npmignore` at both pack *and* install, so a dotted ignore file inside `template/` would be mangled
  before it ever reached a user. The template therefore ships `template/.ai/gitignore` (no dot) and
  **both installers restore the dot on copy** (`*/gitignore → .gitignore`). A static harness guard,
  `template_ignore_naming_case`, fails if any dotted ignore file appears under `template/`. Full
  background: [`../knowledge/npm-packaging-gotchas.md`](../knowledge/npm-packaging-gotchas.md).

## Line endings

`.gitattributes` pins `bin/cli.js` and `*.sh` to `eol=lf` regardless of a contributor's
`core.autocrlf`. A published binary with CRLF breaks its shebang on Unix. Don't remove those pins, and
don't introduce CRLF into shell or the CLI.

## Commits and PRs

- **Small, single-purpose, tested.** A change that touches installer behavior touches both runners and
  ships its harness coverage in the same commit (see [`parity.md`](./parity.md)).
- **Branch → PR → green CI → merge.** Don't commit installer changes straight to `main`; open a PR and
  let the CI matrix (Ubuntu + macOS × Node 18/20, plus the Windows smoke and the pack-install job) go
  green first. CI must be green on the full matrix before merge — see [`testing.md`](./testing.md).
- **Verify packaging on a real pack+install, not from source.** The npm rename above is invisible to
  from-source runs; `npm run pack-test` is the only thing that proves the published artifact. Run it
  for any change to `files`, the template, or copy logic.
