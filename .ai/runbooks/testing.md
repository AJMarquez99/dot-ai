# Running and reading the tests

How to run the test suite locally and interpret its output. This is the operational how-to; the
quality bar and what must be tested (the policy) live in
[../guidelines/testing.md](../guidelines/testing.md).

There are three test commands plus a lint step. CI mirrors all of them
(`.github/workflows/ci.yml`), so getting these green locally is the same gate CI applies.

## The harness — `npm test`

```sh
npm test
```

This runs `sh test/install_test.sh`, the POSIX harness. It is the primary test: it exercises
**both** installers — `install.sh` and `bin/cli.js` — against the same set of cases, each in a
fresh `mktemp -d` working directory.

**Reading the output:**
- Each passing case prints `ok: <name>` — e.g. `ok: install.sh`, `ok: cli.js (global)`. Most
  cases run twice, once per installer, so you should see paired `ok:` lines.
- The run ends with `ALL PASS` on success.
- A failure prints `FAIL: <message>` and the harness exits non-zero immediately (it runs under
  `set -eu`). The message names the case and the exact assertion that failed, e.g.
  `FAIL: cli.js: plansDirectory not set`.

**What it covers** (cases in `test/install_test.sh`): scaffold copy + folder count + the undotted
`gitignore` → `.gitignore` restore, non-clobbering of existing files, block append + idempotent
re-run, the JSON plans-setting merge (preserving existing keys), `--no-plans`, `--no-md`,
the `--no-md` + tool-flag contradiction guard, `--global` (writes to a fake `$HOME`, leaves
plans setting local), bare `--global`, `--help`, `--version`, `--dry-run`, `--codex --global`
honoring `$CODEX_HOME`, dry-run combos, and a byte-for-byte `inject()` newline-parity diff
between the two installers.

## Cross-platform smoke — `npm run smoke`

```sh
npm run smoke
```

Runs `node test/smoke.js` — a zero-dependency, cross-platform check of `bin/cli.js` only. This
is the path npx and Windows users hit (the sh harness can't run natively on Windows). Each check
prints `ok:` / `FAIL:`; the run ends with `SMOKE OK` or `<n> FAILURE(S)` and a non-zero exit.

## Pack + install round-trip — `npm run pack-test`

```sh
npm run pack-test
```

Runs `node test/pack-install.js`, which does `npm pack`, installs the tarball into a throwaway
project as a real consumer would, runs the installed binary, and checks the shipped ignore file.
Ends with `PACK-INSTALL OK`.

**Why this one matters:** npm renames any shipped `.gitignore` to `.npmignore` on install. The
template works around this by shipping its ignore files **undotted** (`template/.ai/gitignore`),
and the installer restores the dot on the consumer's machine. From-source tests can't see this
rename — only a real pack+install can. If you touch anything about how ignore files are shipped
or copied, this is the test that protects you.

## Lint — shellcheck

```sh
shellcheck install.sh test/install_test.sh
```

Lints the POSIX shell. `bin/cli.js` and `install.sh` are deliberately kept at parity; the shell
side must stay clean. (Install shellcheck with `brew install shellcheck` if missing.)

## Debugging a failing harness case

The harness is `set -eu` and isolates each case in a temp dir, cleaning up with `cd /; rm -rf`
on success. To debug:

1. Read the `FAIL:` line — it names the case function (e.g. `run_case`, `global_case`,
   `plans_case`) and the failed assertion.
2. Open `test/install_test.sh` and find that `fail "..."` string to see exactly what was checked.
3. Reproduce by hand: a failing case left its temp dir behind (cleanup only runs on the success
   path), so the dir is still on disk. Otherwise run the same installer invocation yourself:
   ```sh
   cd "$(mktemp -d)"
   sh /path/to/dot-ai/install.sh --claude        # or: node /path/to/dot-ai/bin/cli.js --claude
   ```
   then inspect `.ai/`, `CLAUDE.md`, and `.claude/settings.local.json`.
4. **If only one installer's case fails** (e.g. `cli.js` fails but `install.sh` passes, or vice
   versa), the two installers have **diverged** — that is a parity bug. Stop and fix both sides;
   see [add-a-flag.md](./add-a-flag.md) for the parity rule.

**Stop if** you find yourself editing a test to make it pass without understanding the failure —
the assertion is almost always right. Find the root cause in the installer first.
