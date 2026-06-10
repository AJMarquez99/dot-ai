# Installer Parity

`dot-ai` ships **two installers that must behave identically**:

- `install.sh` — POSIX `sh`, for the `curl … | sh` path.
- `bin/cli.js` — Node, zero dependencies, for the `npx` / Windows path.

They exist because no single runtime reaches every user: shell can't run natively on Windows, and we
won't make `curl | sh` users install Node. The cost of two runners is one hard rule.

## The rule

**Every observable behavior is identical between the two installers, and every change lands in both
in the same commit.** "Observable" means everything a user or a test can see:

- the **flags** accepted and their meaning (`--claude/--gemini/--codex/--all`, `--global`, `--no-md`,
  `--no-plans`, `--dry-run`, `-h/--help`, `-V/--version`);
- **exit codes** — `0` success, `2` for unknown option / `--no-md` + MD-target contradiction, non-zero
  on failure;
- the **`--help` text** (`usage()` in both) and the `--version` value (read from `package.json`);
- every **log line and prompt** string the user reads;
- the **bytes written to disk** — scaffold layout, the injected convention block, and merged JSON.

If you change one runner and not the other, you have introduced a bug, not a feature.

## Where the implementations *necessarily* diverge

The two are written in different languages, so the *mechanism* differs even though the *result* must
not. Known divergences, all of which still produce identical output:

| Concern | `install.sh` | `bin/cli.js` | Shared contract |
|---|---|---|---|
| Block replace | `awk` matching `BEGIN`/`END`, body read via `getline` from a temp file | `String.replace` with a regex `BEGIN[\s\S]*?END` | Same replaced bytes, idempotent |
| JSON merge | `jq`, else `node`, else `python3`; skip if none | pure-JS `JSON.parse`/`setDeep`/`JSON.stringify` | Same key set, 2-space indent, trailing `\n` |
| Home dir | `$HOME` | `process.env.HOME \|\| os.homedir()` | Same global target path |
| Block source | `printf` wraps `cat agent-instructions.md` | template-literal wraps `readFileSync(...).trimEnd()` | Byte-identical block |

The temp-file `getline` in `install.sh` is **not** an optional style choice — BSD/macOS `awk` rejects
a multi-line value passed via `-v`, so the block cannot be inlined. See
[`contributing.md`](./contributing.md) for the full POSIX/Node constraint list.

## Byte-for-byte hazards (already regression-guarded)

Newline handling on append is the subtle one. Both runners must, when appending the block to an
existing file, normalize to exactly one trailing newline then add one blank separator line — and an
**empty** existing file must come out the same as a no-trailing-newline file. `install.sh` does this
with an explicit `tail -c1` check plus two `printf '\n'`; `cli.js` does it with
`cur.replace(/\n?$/, '\n') + '\n' + block`. The `inject_newline_parity_case` in
[`test/install_test.sh`](../../test/install_test.sh) diffs the two outputs for both the
no-trailing-newline and empty-file cases. Touch append logic in one runner → re-check that diff.

## Do / Don't

**Do**

- Make the change in `install.sh` *and* `bin/cli.js` in the same commit, with the same strings.
- Copy log/prompt text verbatim between the two — don't paraphrase ("Done." is "Done." in both).
- Add or extend a harness case that runs against **both** runners (see below) before you commit.

**Don't**

- Don't add a flag, message, or behavior to one runner "for now."
- Don't reword a prompt in `cli.js` because JS string escaping is easier — the harness greps for
  exact substrings (e.g. `no effect without a tool flag`, `would set`, `would inject`).
- Don't let the JSON output drift: both emit `JSON.stringify(data, null, 2) + '\n'` semantics. The
  `node`/`python3` branches in `install.sh` exist precisely to match `cli.js`'s formatting.

## How parity is enforced

[`test/install_test.sh`](../../test/install_test.sh) is parametrized on a `runner` prefix and every
case is invoked twice:

```sh
run_case "install.sh" "sh $REPO_ROOT/install.sh"
run_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
```

A new behavior is not "done" until it has a case exercised against both prefixes (plus the dedicated
`inject_newline_parity_case` for byte-level output). See [`testing.md`](./testing.md) for the testing
policy and [`../runbooks/testing.md`](../runbooks/testing.md) for the step-by-step.
