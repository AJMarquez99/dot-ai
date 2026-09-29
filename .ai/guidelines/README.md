<!-- BEGIN .ai-folder -->
# guidelines/

**Answers: what rules we follow.** Standing rules — conventions, coding standards, style guides.
Distinct from `lessons/` (a rule not yet crystallized).

**Loading:** the nearest layer is read at session start; other layers are consulted via this index.
A `lesson/` graduates into a guideline here, then the lesson is deleted.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
| [parity.md](./parity.md) | The core rule: `install.sh` and `bin/cli.js` must behave identically, and every change lands in both. |
| [contributing.md](./contributing.md) | POSIX-sh and Node conventions, the `_`-prefix and ship-as-`gitignore` rules, line endings, and commit/PR expectations. |
| [testing.md](./testing.md) | The testing bar: TDD against both runners, the three test layers, and a green CI matrix before merge. |
