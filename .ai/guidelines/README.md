# guidelines/

**Answers: what rules we follow.** Standing rules — conventions, coding standards, style guides.
Distinct from `lessons/` (a rule not yet crystallized).

Auto-loaded at session start. A `lesson/` graduates into a guideline here, then the lesson is deleted.

## In this folder

- [`parity.md`](./parity.md) — the core rule: `install.sh` and `bin/cli.js` must behave identically,
  and every change lands in both.
- [`contributing.md`](./contributing.md) — POSIX-sh and Node conventions, the `_`-prefix and
  ship-as-`gitignore` rules, line endings, and commit/PR expectations.
- [`testing.md`](./testing.md) — the testing bar: TDD against both runners, the three test layers,
  and a green CI matrix before merge.
