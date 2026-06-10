# Adding an installer flag (at parity)

How to add a new command-line flag to the `dot-ai` installer. The hard rule: **every installer
change must land in BOTH installers** — `install.sh` (POSIX sh) and `bin/cli.js` (Node) — with
identical messages and exit codes, and must be covered by a harness case registered for both
runners. The two installers are kept byte-compatible on purpose; CI and the harness enforce it.

Existing flags for reference: `--claude` / `--gemini` / `--codex` / `--all`, `--global`,
`--no-md`, `--no-plans`, `--dry-run`, `-h`/`--help`, `-V`/`--version`. The block markers are
`<!-- BEGIN .ai-convention -->` … `<!-- END .ai-convention -->`.

## 1. Write the failing harness case first (TDD)

Before touching either installer, add a case to `test/install_test.sh` that exercises the new
flag, and register it for **both** runners at the bottom of the file:

```sh
my_flag_case "install.sh" "sh $REPO_ROOT/install.sh"
my_flag_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
```

Follow the existing case shape: take `name` and `runner`, `work=$(mktemp -d); cd "$work"`, invoke
`$runner --my-flag`, assert with `[ ... ] || fail "$name: ..."`, clean up with `cd /; rm -rf
"$work"`, and end with `pass "$name (...)"`. Run `npm test` and confirm the new case **fails**
(`FAIL: ...`) for both runners. A test that passes before you've implemented anything is testing
the wrong thing. See [testing.md](./testing.md) for reading harness output.

## 2. Implement in `install.sh`

Two edits in the POSIX installer:

1. Add the option to the arg-parse `case` loop (around the `for arg in "$@"` block). Initialize
   its variable in the `DO_CLAUDE=0; ...` defaults line, then add an arm:
   ```sh
   --my-flag) MY_FLAG=1 ;;
   ```
   Decide whether the flag should set `ANY_FLAG=1` — flags that change *what gets wired* (like
   `--claude`, `--global`, `--no-md`) do; flags that only modify behavior (like `--no-plans`,
   `--dry-run`) do not. Match the closest existing flag.
2. Add the same arm to the redundant pre-scan only if your flag must short-circuit before source
   resolution (only `-h`/`--help` and `-V`/`--version` do that today).

Keep the unknown-option fall-through (`*) log "Unknown option: $arg"; exit 2 ;;`) intact.

## 3. Implement in `bin/cli.js` — identically

Mirror the same logic in the Node parse loop in `main()`:

```js
else if (a === '--my-flag') { myFlag = true; }
```

Declare its variable alongside `noPlans` / `noMd` / `dryRun`, and set `anyFlag = true` if and
only if you did so in `install.sh`. **Messages and exit codes must be identical** between the two
— any error string, any `exit 2` / `process.exit(2)`, any `log`/`console.error` text must match
byte-for-byte. The harness diffs behavior between the installers; divergence is a failure.

## 4. Update `--help` in BOTH — keep them byte-identical

Add the flag to the usage text in **both** `usage()` in `install.sh` (the `cat <<'EOF'` heredoc)
and `usage()` in `bin/cli.js` (the template literal). These two help texts must stay identical.
The harness's `help_case` runs `--help` through both installers and asserts the same content, and
`smoke.js` checks `cli.js --help` independently.

**Stop if the two installers' `--help` diverge.** If `help_case` fails for only one runner, you
edited one usage block and not the other (or worded them differently). Fix both.

## 5. Thread it through the write sites (if it changes output)

If the flag affects what gets written:
- Add the logic at the relevant write site — the scaffold copy (`copyTree` / the `find .ai`
  loop), `inject()`, or `merge_json` / `mergeJsonSetting` — in **both** files.
- **Honor `--dry-run`.** Every write site already short-circuits on dry-run by printing a
  `would ...` preview instead of writing. Your new behavior must do the same so
  `--my-flag --dry-run` writes nothing. Add/extend a dry-run assertion in your harness case.
- If the flag is mutually exclusive with another (the way `--no-md` rejects tool flags), add the
  guard in both installers with the **same error message and `exit 2`**, and add a guard case.

## 6. Update the docs (if user-facing)

- `README.md` — document the flag in the relevant section and any flag tables.
- `agent-instructions.md` — only if the flag changes what an agent should know about the
  convention (most installer flags do not; this file is the block injected into agent configs).

## 7. Verify

```sh
npm test          # harness — must end with ALL PASS, your new case green for BOTH runners
npm run smoke     # cross-platform cli.js check — must end with SMOKE OK
shellcheck install.sh test/install_test.sh
```

Run `npm run pack-test` too if your flag touched how files are shipped or copied.

## Guardrails — stop if

- **The `--help` texts differ** between `install.sh` and `bin/cli.js`. They are a parity contract.
- **A harness case passes for one runner but fails for the other** — the installers have
  diverged. Both must behave identically.
- **You implemented the flag in only one installer.** Parity is non-negotiable: ship it in both
  or ship neither.
- **A new write path ignores `--dry-run`.** Dry-run must remain a true no-op.
- **You changed an existing error message or exit code on one side only.** Mirror it.
