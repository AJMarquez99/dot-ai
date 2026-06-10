# runbooks/

**Answers: HOW an operational task is performed (with judgment).** Procedures that include judgment
calls ("if X looks wrong, stop"). Indexed and consulted on-task — **not** auto-loaded.

Distinct from `scripts/` (deterministic automation that runs) and the optional `skills/` (LLM-invoked).
A runbook commonly references a script for its automatable steps.

## Index

Runbooks are consulted on-task by this index, not auto-loaded.

- **[releasing.md](./releasing.md)** — when cutting and publishing a new version of
  `@ajmarquez99/dot-ai` to npm (version bump, tarball inspection, publish with OTP, tag + release).
- **[testing.md](./testing.md)** — when running the test suite locally and reading its output
  (`npm test`, `npm run smoke`, `npm run pack-test`, shellcheck) or debugging a failing case.
- **[add-a-flag.md](./add-a-flag.md)** — when adding a new installer flag at parity across
  `install.sh` and `bin/cli.js` (TDD case first, both installers, matching `--help`, verify).
