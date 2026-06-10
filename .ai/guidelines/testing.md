# Testing Policy

The bar every change must clear before it merges. This is the *policy* — what must be true and why.
For the step-by-step of running and writing tests, see
[`../runbooks/testing.md`](../runbooks/testing.md).

## Test-driven, red → green

Write the failing test first. For installer work that means adding a case to
[`test/install_test.sh`](../../test/install_test.sh) that fails against the current code, then making
it pass. The harness is the contract; the implementation satisfies it, not the other way around.

## Coverage runs against **both** installers

Because `install.sh` and `bin/cli.js` must behave identically ([`parity.md`](./parity.md)), behavioral
coverage is meaningless unless it runs against both. The harness is parametrized on a `runner` prefix
and every case is invoked twice — once with `sh …/install.sh`, once with `node …/bin/cli.js`. A new
behavior without a case run against both runners is not tested.

## The three layers and what each guards

| Layer | Command | Guards |
|---|---|---|
| **Harness** — [`test/install_test.sh`](../../test/install_test.sh) | `npm test` | Behavior and **parity**: scaffold copy, non-clobber, idempotent block inject, JSON merge, all flags, byte-identical inject output. Runs against both runners. |
| **Smoke** — [`test/smoke.js`](../../test/smoke.js) | `npm run smoke` | Cross-platform `cli.js`, **including Windows**, where `install.sh` can't run. Pure Node, no external tools — the real `npx`/Windows path. |
| **Pack-install** — [`test/pack-install.js`](../../test/pack-install.js) | `npm run pack-test` | The **real published artifact**: `npm pack` → install the tarball → run the installed binary, proving the `.gitignore` → `.npmignore` rename survives end to end. |

Each layer catches what the others can't: the harness proves the two runners agree, the smoke test
proves `cli.js` works where there is no shell, and pack-install proves the thing users actually
download behaves.

## Packaging is verified on a real pack+install — never from source alone

npm renames `.gitignore` → `.npmignore` at pack *and* install. A from-source test reads the working
tree, where the file is still `gitignore`, and so **cannot** observe the mangling that would break a
real install. Therefore any change to the package `files` list, the `template/`, or the copy/rename
logic must be validated with `npm run pack-test`, which exercises the actual tarball. From-source
green is not sufficient evidence here. (Background:
[`../knowledge/npm-packaging-gotchas.md`](../knowledge/npm-packaging-gotchas.md).)

## CI must be green on the full matrix before merge

The [CI workflow](../../.github/workflows/ci.yml) runs three jobs:

- **harness** — `sh test/install_test.sh` + `node test/smoke.js` on `{ubuntu, macos} × node {18, 20}`.
- **package** — `node test/pack-install.js` (Ubuntu, Node 20).
- **windows** — `node test/smoke.js` on `windows-latest` (the native `npx` path).

All three must pass before merge. `prepublishOnly` additionally runs `npm test`, so a broken harness
also blocks publish. Do not merge on a partially-green matrix — `fail-fast` is off precisely so you
see every platform's result.

## Definition of done

- New/changed behavior has a harness case exercised against **both** runners.
- `npm test`, `npm run smoke`, and (for any packaging-affecting change) `npm run pack-test` pass
  locally.
- Byte-level output changes are covered by the inject parity diff.
- CI is green across the entire matrix.
