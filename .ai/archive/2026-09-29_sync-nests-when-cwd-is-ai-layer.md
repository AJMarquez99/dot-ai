# Note: `dot-ai sync` nests `.ai/.ai/` when cwd *is* the `.ai` layer

**Status:** confirmed bug, 2026-08-21. Idea inbox — promote to a plan/fix when picked up.

## What happened
Running `dot-ai sync` from inside `~/.ai` (the machine-global layer) scaffolded a **nested
`~/.ai/.ai/`** instead of populating the layer itself. The CLI treats cwd as a project root
and always creates `./.ai/` under it.

`dot-ai doctor` then made it worse-looking: it validated the *nested* copy and printed a
bogus cascade (`~/.ai` → `~/.ai/.ai`), reporting "no problems found" while the real layer
was still incomplete.

## Repro
```sh
cd ~/.ai && dot-ai sync   # → creates ~/.ai/.ai/ with the full scaffold
```

## Gap
There is no global-scaffold mode: `--global` only affects config wiring (`~/.claude` etc.),
not where the scaffold lands. So there's no correct way to (re)scaffold `~/.ai` itself.

## Fix ideas
- Detect when cwd basename is `.ai` (or cwd == `~/.ai`) and scaffold **in place** instead
  of nesting — probably the right default for `sync` and `doctor` alike.
- And/or add an explicit `dot-ai sync --here` (or make `--global` imply `~/.ai` as the
  scaffold target for `sync`/`init`).
- `doctor` should flag a nested `.ai/.ai/` as a problem, never validate it.

## Workaround used (2026-08-21)
```sh
cd ~/.ai && rsync -a --ignore-existing .ai/ ./ && rm -rf .ai
```
(`--ignore-existing` preserves real files, e.g. a populated `runbooks/README.md` index,
while filling in missing scaffold.)
