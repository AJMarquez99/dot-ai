# knowledge/

**Answers: what is true / why.** Durable truth — domain knowledge, architecture, the "why it is
this way." Distinct from `context/` (live, disposable session state) and `audits/` (dated snapshots).

Auto-loaded at session start. Promote keepers here from `context/`.

## In this folder

- [`architecture.md`](./architecture.md) — what `dot-ai` is and why it's shaped this way: the
  convention + installer, the two-installers-at-parity design, the marked-block injection model, the
  flag surface, and the cross-platform stance.
- [`installer-internals.md`](./installer-internals.md) — byte-level mechanics for modifying the
  installers: scaffold copy, block injection and newline parity, JSON settings merge, path
  resolution, dry-run threading, and the interactive prompt flow, with `install.sh`/`cli.js` pairings.
- [`npm-packaging-gotchas.md`](./npm-packaging-gotchas.md) — the hard-won packaging truths: npm's
  `.gitignore` → `.npmignore` rename, scoped-package publish access, the Node-14 floor, LF locking,
  and why you must verify the packaged artifact, not just from-source.
