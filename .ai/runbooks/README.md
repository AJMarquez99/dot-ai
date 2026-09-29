<!-- BEGIN .ai-folder -->
# runbooks/

**Answers: HOW an operational task is performed (with judgment).** Procedures that include judgment
calls ("if X looks wrong, stop").

Distinct from `scripts/` (deterministic automation that runs) and the optional `skills/` (LLM-invoked).
A runbook commonly references a script for its automatable steps.

**Loading:** consulted on-task via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
| [releasing.md](./releasing.md) | When cutting and publishing a new version of `@ajmarquez99/dot-ai` to npm (version bump, tarball inspection, publish with OTP, tag + release). |
| [testing.md](./testing.md) | When running the test suite locally and reading its output (`npm test`, `npm run smoke`, `npm run pack-test`, shellcheck) or debugging a failing case. |
| [add-a-flag.md](./add-a-flag.md) | When adding a new installer flag at parity across `install.sh` and `bin/cli.js` (TDD case first, both installers, matching `--help`, verify). |
