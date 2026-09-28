# Tiered Startup Loading + Folder Indexes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "read everything in every layer" startup loading with importance tiers, backed by
standardized, convention-managed folder indexes and a `dot-ai index` command.

**Architecture:** Folder READMEs become a `<!-- BEGIN .ai-folder -->` managed block (refreshed by
`dot-ai sync`, with exact-match migration from v1.0.0 READMEs) plus a user-owned `## Index` table. A
pure library (`src/lib/folder-readme.js`) handles blocks; a second (`src/lib/index-section.js`)
parses/extends index sections; `src/commands/index.js` wires the latter into a CLI subcommand. The
convention text (`agent-instructions.md`) gains the tiers and the autonomous index-maintenance rule.

**Tech Stack:** Node ≥14, zero dependencies, CommonJS; tests are plain Node scripts using the repo's
`check(name, fn)` idiom; POSIX `sh` harness for installer parity.

**Spec:** `.ai/plans/2026-09-27-tiered-startup-loading-design.md`

## Global Constraints

- Node `>=14`, **zero runtime dependencies** (`package.json` has none; keep it so).
- CommonJS, `'use strict';`, first line comment `// src/.../file.js` matching existing files.
- All human output goes to **stderr** (`console.error`), matching every other command.
- Exit codes: `0` ok, `2` user error (no `.ai/`, unknown folder/option).
- Managed-block markers are exactly `<!-- BEGIN .ai-folder -->` / `<!-- END .ai-folder -->`.
- Index table header is exactly `| File | Answers |` then `|---|---|`; placeholder is exactly `TODO: describe`.
- `_`-prefixed entries **never** written to `README.md`; only to `_README.md`.
- `context/` and `archive/` have no index.
- Migration source is only the v1.0.0 template READMEs (`git show v1.0.0:template/.ai/<f>/README.md`) — exact-prefix match, never heuristic.
- Installer parity: `install.sh` and `bin/cli.js init` must still produce byte-identical scaffolds (`npm test`).
- Branch: `feat/tiered-startup-loading` (already created from `origin/staging`, no upstream). **Do not push** — pushing is gated on the user (public repo).
- Every commit ends with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **CRLF files (Windows checkouts)** — a v1.0.0 README with `\r\n` must still migrate; covered in Task 1.
2. **Hidden files (`.DS_Store`, `.gitkeep`)** in a folder must never become index rows; covered in Task 4.
3. **`dot-ai index ../..` or an absolute path** must exit 2 and write nothing outside `.ai/`; covered in Task 4.
4. **Running `dot-ai index` from a project subdirectory** must act on the nearest `.ai/`; covered in Task 4.
5. **An `## Index` followed by another `## ` section** — new rows land inside Index, never in the later section; covered in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/legacy-readmes/<folder>.md` (12, create) | Verbatim v1.0.0 folder READMEs — migration source only |
| `src/lib/folder-readme.js` (create) | Managed-block extract / refresh / migrate (pure `planRefresh` + fs `refreshReadme`) |
| `src/lib/structure.js` (modify) | Add `UNINDEXED` |
| `template/.ai/*/README.md` (12, modify) | Block + index form, new loading lines |
| `template/.ai/templates/folder-README.md` (create) | Base README for new folders |
| `src/commands/sync.js` (modify) | Call `refreshReadme` for each template folder |
| `src/lib/index-section.js` (create) | Parse/extend `## Index` sections, list folder entries |
| `src/commands/index.js` (create) | `dot-ai index` command |
| `bin/cli.js` (modify) | Register `index`, flags, help |
| `agent-instructions.md`, `README.md`, `SPEC.md` (modify) | Tiers, indexes, cascade wording |
| `test/folder-readme.test.js`, `test/template.test.js`, `test/index.test.js` (create), `test/sync.test.js` (modify), `package.json` (modify `unit`) | Tests |

---

### Task 1: Legacy snapshots + folder-readme library

**Files:**
- Create: `src/lib/legacy-readmes/{knowledge,guidelines,runbooks,scripts,templates,data,plans,audits,lessons,notes,context,archive}.md`
- Create: `src/lib/folder-readme.js`
- Test: `test/folder-readme.test.js`
- Modify: `package.json` (`unit` script)

**Interfaces:**
- Consumes: `escapeRe` from `src/lib/wiring.js`; `FOLDERS` from `src/lib/structure.js`.
- Produces: `FOLDER_BEGIN`, `FOLDER_END` (strings); `extractBlock(text) → string|null`;
  `legacyText(folder) → string|null`; `planRefresh(current, template, legacy) → { action: 'updated'|'migrated'|'unchanged'|'customized', text }`;
  `refreshReadme(readmePath, templatePath, folder, dry) → action|'missing'`.

- [ ] **Step 1: Snapshot the v1.0.0 READMEs (must happen before Task 2 edits templates)**

```sh
mkdir -p src/lib/legacy-readmes
for f in knowledge guidelines runbooks scripts templates data plans audits lessons notes context archive; do
  git show v1.0.0:template/.ai/$f/README.md > src/lib/legacy-readmes/$f.md
done
ls src/lib/legacy-readmes | wc -l   # expect 12
```

- [ ] **Step 2: Write the failing test** — `test/folder-readme.test.js`

```js
// test/folder-readme.test.js
'use strict';
const assert = require('assert');
const fr = require('../src/lib/folder-readme');
const { FOLDERS } = require('../src/lib/structure');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
const B = fr.FOLDER_BEGIN, E = fr.FOLDER_END;
const TPL = `${B}\n# knowledge/\n\nNEW convention text\n${E}\n\n## Index\n\n| File | Answers |\n|---|---|\n`;
const LEGACY = '# knowledge/\n\nOLD convention text\n';

check('extractBlock returns null when there are no markers', () => {
  assert.strictEqual(fr.extractBlock('# plain\n'), null);
});
check('extractBlock returns the block including markers', () => {
  assert.strictEqual(fr.extractBlock(`pre\n${B}\nx\n${E}\npost`), `${B}\nx\n${E}`);
});
check('stale block is replaced; content outside markers survives', () => {
  const cur = `${B}\nOLD\n${E}\n\n## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | mine |\n`;
  const r = fr.planRefresh(cur, TPL, LEGACY);
  assert.strictEqual(r.action, 'updated');
  assert.ok(r.text.includes('NEW convention text') && !r.text.includes('OLD'));
  assert.ok(r.text.includes('| [a.md](a.md) | mine |'), 'index row must survive');
  assert.strictEqual(r.text.split(B).length - 1, 1, 'exactly one block');
});
check('current block is left unchanged', () => {
  const cur = `${fr.extractBlock(TPL)}\n\nmine\n`;
  assert.strictEqual(fr.planRefresh(cur, TPL, LEGACY).action, 'unchanged');
});
check('pristine legacy README migrates to the full template', () => {
  const r = fr.planRefresh(LEGACY, TPL, LEGACY);
  assert.strictEqual(r.action, 'migrated');
  assert.strictEqual(r.text, TPL);
});
check('legacy README with appended content keeps the remainder after the block', () => {
  const r = fr.planRefresh(`${LEGACY}\n## In this folder\n\n- [a.md](a.md) — mine\n`, TPL, LEGACY);
  assert.strictEqual(r.action, 'migrated');
  assert.strictEqual(r.text, `${fr.extractBlock(TPL)}\n\n## In this folder\n\n- [a.md](a.md) — mine\n`);
});
check('CRLF legacy README still migrates', () => {
  assert.strictEqual(fr.planRefresh(LEGACY.replace(/\n/g, '\r\n'), TPL, LEGACY).action, 'migrated');
});
check('customized README without markers is left untouched', () => {
  const cur = '# knowledge/\n\nMy own intro.\n';
  const r = fr.planRefresh(cur, TPL, LEGACY);
  assert.strictEqual(r.action, 'customized');
  assert.strictEqual(r.text, cur);
});
check('no legacy text available -> customized, not migrated', () => {
  assert.strictEqual(fr.planRefresh(LEGACY, TPL, null).action, 'customized');
});
check('$ sequences in the template block are written literally', () => {
  const tpl = `${B}\ncost: $& and $1\n${E}\n`;
  const r = fr.planRefresh(`${B}\nOLD\n${E}\n`, tpl, null);
  assert.ok(r.text.includes('cost: $& and $1'), r.text);
});
check('a v1.0.0 legacy snapshot exists for every canonical folder', () => {
  for (const f of FOLDERS) {
    const t = fr.legacyText(f);
    assert.ok(t && t.startsWith(`# ${f}/`), `missing/odd legacy snapshot for ${f}`);
  }
  assert.strictEqual(fr.legacyText('nope'), null);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nFOLDER-README OK');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node test/folder-readme.test.js`
Expected: crash with `Cannot find module '../src/lib/folder-readme'`.

- [ ] **Step 4: Implement** — `src/lib/folder-readme.js`

```js
// src/lib/folder-readme.js
'use strict';
const fs = require('fs');
const path = require('path');
const { escapeRe } = require('./wiring');

// Folder READMEs = a convention-managed block (refreshed by `sync`) + user-owned
// remainder (the ## Index and any project prose). Same idea as the .ai-convention
// block in CLAUDE.md, with its own markers.
const FOLDER_BEGIN = '<!-- BEGIN .ai-folder -->';
const FOLDER_END = '<!-- END .ai-folder -->';
const BLOCK_RE = new RegExp(`${escapeRe(FOLDER_BEGIN)}[\\s\\S]*?${escapeRe(FOLDER_END)}`);
const LEGACY_DIR = path.join(__dirname, 'legacy-readmes');

const lf = (s) => s.replace(/\r\n/g, '\n');

// The managed block (markers included) in `text`, or null.
function extractBlock(text) {
  const m = lf(text).match(BLOCK_RE);
  return m ? m[0] : null;
}

// The v1.0.0 README shipped for `folder` (the only migration source), or null.
function legacyText(folder) {
  const f = path.join(LEGACY_DIR, `${folder}.md`);
  return fs.existsSync(f) ? lf(fs.readFileSync(f, 'utf8')) : null;
}

// Pure: decide how a README should change. Never guesses — a block-less README is
// migrated only when it starts with the exact legacy text; anything else is left alone.
function planRefresh(current, template, legacy) {
  const cur = lf(current);
  const tpl = lf(template);
  const block = extractBlock(tpl);
  if (!block) throw new Error('template README has no .ai-folder block');
  if (extractBlock(cur) !== null) {
    const next = cur.replace(BLOCK_RE, () => block); // fn: no $-pattern expansion
    return { action: next === cur ? 'unchanged' : 'updated', text: next };
  }
  if (legacy && cur.startsWith(legacy)) {
    const rest = cur.slice(legacy.length).trim();
    return { action: 'migrated', text: rest ? `${block}\n\n${rest}\n` : tpl };
  }
  return { action: 'customized', text: cur };
}

// Apply planRefresh to a README on disk. Returns the action (or 'missing').
function refreshReadme(readmePath, templatePath, folder, dry) {
  if (!fs.existsSync(readmePath)) return 'missing';
  const { action, text } = planRefresh(
    fs.readFileSync(readmePath, 'utf8'), fs.readFileSync(templatePath, 'utf8'), legacyText(folder));
  const rel = path.relative(process.cwd(), readmePath);
  if (action === 'customized') {
    console.error(`  skip (customized README, no managed block): ${rel}`);
  } else if (action !== 'unchanged') {
    const verb = action === 'migrated' ? 'migrate' : 'update';
    if (dry) { console.error(`  would ${verb} README block: ${rel}`); return action; }
    fs.writeFileSync(readmePath, text);
    console.error(`  ${action} README block: ${rel}`);
  }
  return action;
}

module.exports = { FOLDER_BEGIN, FOLDER_END, extractBlock, legacyText, planRefresh, refreshReadme };
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test/folder-readme.test.js`
Expected: every line `ok: …`, ends `FOLDER-README OK`, exit 0.

- [ ] **Step 6: Register in `unit`** — in `package.json`, append ` && node test/folder-readme.test.js` to the end of the `"unit"` script string. Run `npm run unit`; expect all suites OK.

- [ ] **Step 7: Commit**

```bash
git add src/lib/legacy-readmes src/lib/folder-readme.js test/folder-readme.test.js package.json
git commit -m "feat(lib): managed .ai-folder README blocks with v1.0.0 migration

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Template READMEs in block + index form

**Files:**
- Modify: `src/lib/structure.js`
- Modify: all 12 `template/.ai/<folder>/README.md`
- Create: `template/.ai/templates/folder-README.md`
- Test: `test/template.test.js`; `package.json` (`unit`)

**Interfaces:**
- Consumes: `FOLDER_BEGIN`, `FOLDER_END`, `extractBlock`, `legacyText`, `planRefresh` (Task 1).
- Produces: `UNINDEXED = ['context', 'archive']` exported from `src/lib/structure.js`; template READMEs every later task reads.

- [ ] **Step 1: Add `UNINDEXED`** to `src/lib/structure.js`, after `PROJECT_BOUND`:

```js
// Folders with no ## Index: context/ is disposable session state, archive/ is
// date-stamped and pruned (its filenames are the index).
const UNINDEXED = ['context', 'archive'];
```

and change the export to `module.exports = { FOLDERS, OPTIONAL_FOLDERS, PROJECT_BOUND, UNINDEXED, isCanonical };`

- [ ] **Step 2: Write the failing test** — `test/template.test.js`

```js
// test/template.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fr = require('../src/lib/folder-readme');
const { FOLDERS, UNINDEXED } = require('../src/lib/structure');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
const TPL = path.join(__dirname, '..', 'template', '.ai');
const read = (...p) => fs.readFileSync(path.join(TPL, ...p), 'utf8');
const INDEX_HEADER = '## Index\n\n| File | Answers |\n|---|---|\n';

for (const f of FOLDERS) {
  check(`${f}/README.md opens with exactly one managed block`, () => {
    const t = read(f, 'README.md');
    assert.ok(t.startsWith(`${fr.FOLDER_BEGIN}\n# ${f}/\n`), 'must start with BEGIN marker then heading');
    assert.strictEqual(t.split(fr.FOLDER_BEGIN).length - 1, 1);
    assert.strictEqual(t.split(fr.FOLDER_END).length - 1, 1);
    assert.ok(fr.extractBlock(t).includes('**Loading:**'), 'block must state its loading tier');
    assert.ok(!t.includes('Auto-loaded at session start'), 'old wording must be gone');
  });
  check(`${f}/README.md has an index iff it is not UNINDEXED`, () => {
    assert.strictEqual(read(f, 'README.md').includes(INDEX_HEADER), !UNINDEXED.includes(f));
  });
  check(`pristine v1.0.0 ${f}/README.md migrates to exactly the new template`, () => {
    const legacy = fr.legacyText(f);
    assert.strictEqual(fr.planRefresh(legacy, read(f, 'README.md'), legacy).text, read(f, 'README.md'));
  });
}
check('templates/folder-README.md is a managed block plus an empty index', () => {
  const t = read('templates', 'folder-README.md');
  assert.ok(t.startsWith(fr.FOLDER_BEGIN));
  assert.ok(fr.extractBlock(t).includes('**Loading:**'));
  assert.ok(t.endsWith(`${fr.FOLDER_END}\n\n${INDEX_HEADER}`));
});
check('templates/README.md indexes folder-README.md', () => {
  assert.ok(read('templates', 'README.md').includes('| [folder-README.md](folder-README.md) |'));
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nTEMPLATE OK');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test/template.test.js`
Expected: `FAIL: knowledge/README.md opens with exactly one managed block` (and similar for all folders).

- [ ] **Step 4: Rewrite the 12 template READMEs.** Write each file with exactly this content (each ends with a single trailing newline).

`template/.ai/knowledge/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# knowledge/

**Answers: what is true / why.** Durable truth — domain knowledge, architecture, the "why it is
this way." Distinct from `context/` (live, disposable session state) and `audits/` (dated snapshots).

**Loading:** the nearest layer is read at session start; other layers are consulted via this index.
Promote keepers here from `context/`.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

`template/.ai/guidelines/README.md`:
```markdown
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
```

`template/.ai/lessons/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# lessons/

**Answers: what we just learned (→ becomes a guideline).** Corrections learned, staged to promote
into `guidelines/`. Transient lifecycle but **committed** (gitignored content vanishes on fresh clone).
Distinct from `notes/` (lessons are already actionable rules).

**Loading:** consulted when stuck (an error, a correction, a repeated failure) — not at session
start. A lesson that applies should be promoted into its `guidelines/` or `knowledge/` home, then
deleted.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

`template/.ai/context/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# context/

**Answers: the live working state / handoff.** Cross-session/LLM coordination & handoff state.
Regenerable — if it disappears, the next session rebuilds working state from the code and git history.

Distinct from `knowledge/` (durable truth, not disposable session state).

**Loading:** nearest layer only, and only when continuing prior work — skipped on a fresh start.
Not indexed.

## Version control

This is the **only** folder whose contents are gitignored by default (see `.gitignore` here).
The folder + this README are tracked; the working-state files inside are not. Distill at the end of
work — promote keepers to `knowledge/` or `lessons/`; the rest is disposable.
<!-- END .ai-folder -->
```

`template/.ai/archive/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# archive/

**Historical records.** Completed plans, outdated knowledge, superseded guidelines.

- **Naming:** prefix with archive date — `YYYY-MM-DD_original-name.md`.
- **Retention:** permanently deleted after 90 days unless the filename includes `_retain`
  (e.g. `2026-04-01_auth-migration-plan_retain.md`).
- Review periodically and purge expired items.

**Loading:** not auto-loaded and not indexed — the date-stamped filenames are the index.
<!-- END .ai-folder -->
```

`template/.ai/runbooks/README.md`:
```markdown
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
```

`template/.ai/scripts/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# scripts/

**Answers: how, automated.** Deterministic automation that RUNS — executable tooling, no judgment.

Distinct from `runbooks/` (followed by a human/agent, documents the non-automatable steps).

**Loading:** consulted on-task via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

`template/.ai/templates/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# templates/

**Answers: what to start from.** Blank scaffolds to copy & fill — PRs, issues, docs, code.

Distinct from `data/` (concrete values consumed as-is, not scaffolds).

**Loading:** consulted on-task via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
| [folder-README.md](folder-README.md) | Base README for a new `.ai/` folder or routed subfolder — managed block + empty index |
```

`template/.ai/data/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# data/

**Answers: what raw inputs exist.** Concrete reference data consumed as-is — datasets, fixtures,
lookup tables.

Distinct from `templates/` (blank scaffolds to fill, not values).

**Loading:** consulted on-task via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

`template/.ai/plans/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# plans/

**Answers: what we intend to do.** Implementation plans, roadmaps, design docs. Plan-mode output
lands here (configured via `plansDirectory`), as do manually authored plans.

Distinct from `audits/` (a point-in-time finding, not intent). Archive when done.

**Loading:** consulted on-task via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

`template/.ai/audits/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# audits/

**Answers: what was true at time T.** Point-in-time assessments — SEO, a11y, performance, security,
code quality.

Distinct from `knowledge/` (durable truth, not a dated snapshot).

**Loading:** consulted on-task via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

`template/.ai/notes/README.md`:
```markdown
<!-- BEGIN .ai-folder -->
# notes/

**Answers: what might be worth a look later.** The user's undeveloped thoughts to revisit — an idea
inbox. The rawest inbox. Transient but **committed**.

Distinct from `lessons/` (notes aren't actionable yet). A thought graduates into a `plan/`,
`knowledge/`, a `lesson/`, or a `runbook/` — or is discarded.

**Loading:** surfaced only when relevant to the task, via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

- [ ] **Step 5: Create** `template/.ai/templates/folder-README.md`:

```markdown
<!-- BEGIN .ai-folder -->
# <folder>/

**Answers: <the one question this folder answers>.** <What belongs here.> Distinct from
`<neighbor>/` (<why it is different>).

**Loading:** consulted on-task via this index — not auto-loaded.
<!-- END .ai-folder -->

## Index

| File | Answers |
|---|---|
```

- [ ] **Step 6: Run to verify it passes**

Run: `node test/template.test.js && node test/folder-readme.test.js`
Expected: `TEMPLATE OK`, `FOLDER-README OK`.

- [ ] **Step 7: Register + regression.** Append ` && node test/template.test.js` to `unit` in `package.json`. Run `npm run unit && npm test && npm run smoke`. Expected: all green (the harness's non-clobber case appends to `knowledge/README.md`, unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/lib/structure.js template/.ai test/template.test.js package.json
git commit -m "feat(template): folder READMEs as managed block + ## Index; add folder-README base

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `sync` refreshes folder README blocks

**Files:**
- Modify: `src/commands/sync.js`
- Test: `test/sync.test.js`

**Interfaces:**
- Consumes: `refreshReadme(readmePath, templatePath, folder, dry)` (Task 1); template READMEs (Task 2).
- Produces: `sync` behaviour only.

- [ ] **Step 1: Write the failing tests** — in `test/sync.test.js`, change the `child_process` import to
`const { execFileSync, spawnSync } = require('child_process');`, then insert before the final
`console.log(failures ? …)` line:

```js
// Folder README managed blocks.
const TPL_DIR = path.join(__dirname, '..', 'template', '.ai');
const tplReadme = (f) => fs.readFileSync(path.join(TPL_DIR, f, 'README.md'), 'utf8');
const legacyReadme = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'legacy-readmes', `${f}.md`), 'utf8');
const readme = (dir, f) => path.join(dir, '.ai', f, 'README.md');
const seed = (dir, f, text) => {
  fs.mkdirSync(path.join(dir, '.ai', f), { recursive: true });
  fs.writeFileSync(readme(dir, f), text);
};

d = tmp();
runSync(d);
check('fresh sync writes the current template READMEs', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'knowledge'), 'utf8'), tplReadme('knowledge'));
});

d = tmp();
seed(d, 'knowledge', legacyReadme('knowledge'));
runSync(d);
check('sync migrates a pristine v1.0.0 README to the managed template', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'knowledge'), 'utf8'), tplReadme('knowledge'));
});

d = tmp();
seed(d, 'knowledge', `${legacyReadme('knowledge')}\n## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | mine |\n`);
runSync(d);
check('migration keeps an existing index below the block', () => {
  const t = fs.readFileSync(readme(d, 'knowledge'), 'utf8');
  assert.ok(t.startsWith('<!-- BEGIN .ai-folder -->'), t);
  assert.ok(t.includes('| [a.md](a.md) | mine |'));
  assert.ok(!t.includes('Auto-loaded at session start'));
});

d = tmp();
runSync(d);
fs.writeFileSync(readme(d, 'guidelines'),
  fs.readFileSync(readme(d, 'guidelines'), 'utf8').replace('**Loading:**', 'STALE') + '| [g.md](g.md) | mine |\n');
runSync(d);
check('sync refreshes a stale block and keeps rows outside it', () => {
  const t = fs.readFileSync(readme(d, 'guidelines'), 'utf8');
  assert.ok(!t.includes('STALE') && t.includes('**Loading:**'));
  assert.ok(t.includes('| [g.md](g.md) | mine |'));
});

d = tmp();
const custom = '# guidelines/\n\nMy own intro — hand-written.\n';
seed(d, 'guidelines', custom);
const res = spawnSync(process.execPath, [CLI, 'sync'], { cwd: d, encoding: 'utf8' });
check('sync leaves a customized README untouched and reports it', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'guidelines'), 'utf8'), custom);
  assert.ok(res.stderr.includes('skip (customized README, no managed block)'), res.stderr);
});

d = tmp();
seed(d, 'knowledge', legacyReadme('knowledge'));
runSync(d);
const snap = (dir) => fs.readdirSync(path.join(dir, '.ai')).filter((f) => fs.existsSync(readme(dir, f)))
  .map((f) => fs.readFileSync(readme(dir, f), 'utf8')).join('\0');
const first = snap(d);
runSync(d);
check('second sync is a no-op for READMEs (idempotent)', () => {
  assert.strictEqual(snap(d), first);
});

d = tmp();
seed(d, 'knowledge', legacyReadme('knowledge'));
runSync(d, ['--dry-run']);
check('sync --dry-run does not rewrite READMEs', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'knowledge'), 'utf8'), legacyReadme('knowledge'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/sync.test.js`
Expected: `FAIL: sync migrates a pristine v1.0.0 README to the managed template` (and the refresh/customized cases).

- [ ] **Step 3: Implement** — in `src/commands/sync.js`, add the import under the existing requires:

```js
const { refreshReadme } = require('../lib/folder-readme');
```

add this function above `run`:

```js
// Refresh the .ai-folder block in each existing folder README from the template
// (migrating unmodified v1.0.0 READMEs; customized ones are reported and skipped).
function refreshFolderReadmes(templateAiDir, aiDir, dry) {
  for (const entry of fs.readdirSync(templateAiDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tpl = path.join(templateAiDir, entry.name, 'README.md');
    if (!fs.existsSync(tpl)) continue;
    refreshReadme(path.join(aiDir, entry.name, 'README.md'), tpl, entry.name, dry);
  }
}
```

and in `run`, between `copyTree(...)` and `pruneStaleFolders(...)`:

```js
  refreshFolderReadmes(templateAiDir, aiDir, dry); // managed README blocks
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/sync.test.js && npm run unit && npm test`
Expected: `SYNC OK`, all unit suites OK, harness green.

- [ ] **Step 5: Commit**

```bash
git add src/commands/sync.js test/sync.test.js
git commit -m "feat(sync): refresh managed folder README blocks, migrating v1.0.0 READMEs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `dot-ai index` (library + command + CLI)

**Files:**
- Create: `src/lib/index-section.js`, `src/commands/index.js`
- Modify: `bin/cli.js`
- Test: `test/index.test.js`; `package.json` (`unit`)

**Interfaces:**
- Consumes: `findRoot(start) → string|null` (`src/lib/root.js`); `FOLDERS`, `OPTIONAL_FOLDERS`, `UNINDEXED` (`src/lib/structure.js`); template READMEs incl. `templates/folder-README.md` (Task 2).
- Produces: `listEntries(dir) → { pub: string[], priv: string[] }` (dirs carry a trailing `/`); `listedRefs(text) → string[]`; `addEntries(text, names) → string`; `privateSeed() → string`; `PLACEHOLDER`, `TABLE_HEADER`; command `run({ cwd, templateAiDir, folder, private, dry })`.

- [ ] **Step 1: Write the failing test** — `test/index.test.js`

```js
// test/index.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-idx-'))); }
function scaffold(d) { execFileSync(process.execPath, [CLI, 'sync'], { cwd: d, stdio: 'ignore' }); }
function index(cwd, args = []) {
  const r = spawnSync(process.execPath, [CLI, 'index', ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, err: r.stderr };
}
const K = (d, ...p) => path.join(d, '.ai', 'knowledge', ...p);
const put = (f, s = 'x\n') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = (f) => fs.readFileSync(f, 'utf8');

// --- table-style index, public/private split
let d = tmp(); scaffold(d);
put(K(d, 'arch.md')); put(K(d, 'design', 'README.md')); put(K(d, '_secret.md')); put(K(d, '.DS_Store'));
put(K(d, 'my notes.md'));
let r = index(d);
check('index exits 0', () => assert.strictEqual(r.code, 0, r.err));
check('adds a table row for an unlisted file', () => {
  assert.ok(read(K(d, 'README.md')).includes('| [arch.md](arch.md) | TODO: describe |'));
});
check('subfolders link to their README', () => {
  assert.ok(read(K(d, 'README.md')).includes('| [design/](design/README.md) | TODO: describe |'));
});
check('file names with spaces get an encoded link', () => {
  assert.ok(read(K(d, 'README.md')).includes('| [my notes.md](my%20notes.md) | TODO: describe |'));
});
check('_ files never land in README.md', () => assert.ok(!read(K(d, 'README.md')).includes('_secret')));
check('no _README.md is created without --private', () => assert.ok(!fs.existsSync(K(d, '_README.md'))));
check('hidden files are not indexed', () => assert.ok(!read(K(d, 'README.md')).includes('.DS_Store')));
check('rows land inside the ## Index table', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.indexOf('| File | Answers |') < t.indexOf('arch.md'));
});
check('re-running adds nothing (idempotent)', () => {
  const before = read(K(d, 'README.md')); index(d);
  assert.strictEqual(read(K(d, 'README.md')), before);
});
check('never alters an existing row', () => {
  const t = read(K(d, 'README.md'))
    .replace('| [arch.md](arch.md) | TODO: describe |', '| [arch.md](arch.md) | Hand-written. |');
  fs.writeFileSync(K(d, 'README.md'), t); index(d);
  assert.strictEqual(read(K(d, 'README.md')), t);
});

r = index(d, ['--private']);
check('--private creates _README.md holding only _ entries', () => {
  const t = read(K(d, '_README.md'));
  assert.ok(t.includes('| [_secret.md](_secret.md) | TODO: describe |'), t);
  assert.ok(!t.includes('arch.md'), 'public files stay out of _README.md');
});
put(K(d, '_more.md'));
index(d);
check('an existing _README.md receives new _ entries without --private', () => {
  assert.ok(read(K(d, '_README.md')).includes('_more.md'));
});

fs.writeFileSync(K(d, 'README.md'), `${read(K(d, 'README.md'))}| [gone.md](gone.md) | old |\n| \`_leak.md\` | oops |\n`);
r = index(d);
check('reports a stale entry without removing it', () => {
  assert.ok(r.err.includes('stale index entry: gone.md'), r.err);
  assert.ok(read(K(d, 'README.md')).includes('gone.md'));
});
check('reports a _ entry in the public index without removing it', () => {
  assert.ok(r.err.includes('private entry in public index: _leak.md'), r.err);
  assert.ok(read(K(d, 'README.md')).includes('_leak.md'));
});

// --- subdirectory cwd resolves the nearest .ai/
fs.mkdirSync(path.join(d, 'src', 'deep'), { recursive: true });
put(K(d, 'c.md'));
r = index(path.join(d, 'src', 'deep'));
check('works from a project subdirectory (nearest .ai/)', () => {
  assert.strictEqual(r.code, 0, r.err);
  assert.ok(read(K(d, 'README.md')).includes('[c.md](c.md)'));
});

// --- dry run
put(K(d, 'dry.md'));
const beforeDry = read(K(d, 'README.md'));
r = index(d, ['--dry-run']);
check('--dry-run writes nothing and says what it would do', () => {
  assert.strictEqual(read(K(d, 'README.md')), beforeDry);
  assert.ok(r.err.includes('would add'), r.err);
});

// --- context/ and archive/ skipped in a full run
put(path.join(d, '.ai', 'context', 'state.md'));
put(path.join(d, '.ai', 'archive', '2026-01-01_x.md'));
index(d);
check('context/ and archive/ are never indexed', () => {
  assert.ok(!read(path.join(d, '.ai', 'context', 'README.md')).includes('state.md'));
  assert.ok(!read(path.join(d, '.ai', 'archive', 'README.md')).includes('2026-01-01_x.md'));
});

// --- bullet style, followed by another section
d = tmp(); scaffold(d);
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\n## Index\n\n- [a.md](a.md) — first\n  continued line\n\n## Notes\n\nprose\n');
put(K(d, 'a.md')); put(K(d, 'b.md'));
index(d, ['knowledge']);
check('bullet-style index gets a bullet inside the Index section', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.includes('- [b.md](b.md) — TODO: describe'), t);
  assert.ok(t.indexOf('b.md') < t.indexOf('## Notes'), 'must not land in a later section');
  assert.ok(t.indexOf('continued line') < t.indexOf('[b.md]'), 'goes after the previous item, not inside it');
});

// --- README without an Index section / heading without a table / missing README
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\nIntro.\n');
index(d, ['knowledge']);
check('README without ## Index gets a table appended', () => {
  assert.ok(read(K(d, 'README.md')).endsWith(
    '## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | TODO: describe |\n| [b.md](b.md) | TODO: describe |\n'),
  read(K(d, 'README.md')));
});
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\n## Index\n\nNothing yet.\n');
index(d, ['knowledge']);
check('an Index heading with no entries gets a table under the heading', () => {
  assert.ok(read(K(d, 'README.md')).includes(
    '## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | TODO: describe |\n| [b.md](b.md) | TODO: describe |\n\nNothing yet.'),
  read(K(d, 'README.md')));
});
fs.rmSync(K(d, 'README.md'));
index(d, ['knowledge']);
check('a missing README is seeded from the template, then indexed', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.startsWith('<!-- BEGIN .ai-folder -->\n# knowledge/'), t);
  assert.ok(t.includes('| [a.md](a.md) | TODO: describe |'));
});

// --- errors
check('exit 2 when no .ai/ exists', () => assert.strictEqual(index(tmp()).code, 2));
check('exit 2 for an unknown folder', () => assert.strictEqual(index(d, ['nope']).code, 2));
check('exit 2 for context/ and archive/', () => {
  assert.strictEqual(index(d, ['context']).code, 2);
  assert.strictEqual(index(d, ['archive']).code, 2);
});
check('exit 2 for a path that escapes .ai/', () => {
  assert.strictEqual(index(d, ['../..']).code, 2);
  assert.strictEqual(index(d, [path.join(d, '.ai', 'knowledge')]).code, 2);
});
check('exit 2 for an unknown option', () => assert.strictEqual(index(d, ['--bogus']).code, 2));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nINDEX OK');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/index.test.js`
Expected: `FAIL: index exits 0` (CLI prints `Unknown command: index`, exit 2) and most checks fail.

- [ ] **Step 3: Implement the library** — `src/lib/index-section.js`

```js
// src/lib/index-section.js
'use strict';
const fs = require('fs');

// A folder's "## Index" section in its README: a `| File | Answers |` table (the
// standard) or, in hand-written READMEs, a bullet list. We only ever ADD entries.
const HEADING_RE = /^## Index[ \t]*$/m;
const SEP_RE = /^\|[\s:|-]+$/;
const LINK_RE = /\]\(([^)\s]+)\)/;
const TICK_RE = /`([^`]+)`/;
const TABLE_HEADER = '| File | Answers |\n|---|---|';
const PLACEHOLDER = 'TODO: describe';
const SKIP = new Set(['README.md', '_README.md']);

// Top-level entries of a folder split by visibility; dirs carry a trailing '/'.
// Hidden entries (.gitignore, .DS_Store, …) are never indexed.
function listEntries(dir) {
  const pub = [], priv = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const name = e.isDirectory() ? `${e.name}/` : e.name;
    (e.name.startsWith('_') ? priv : pub).push(name);
  }
  return { pub: pub.sort(), priv: priv.sort() };
}

// Offsets of the Index section: heading start, body start (after the heading
// text), and end (next "## " heading or EOF). null if absent.
function findSection(text) {
  const m = HEADING_RE.exec(text);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const next = text.slice(bodyStart).search(/^## /m);
  return { start: m.index, bodyStart, end: next === -1 ? text.length : bodyStart + next };
}

function normalizeRef(ref) {
  let r = ref.replace(/^\.\//, '').replace(/#.*$/, '');
  try { r = decodeURIComponent(r); } catch { /* keep as written */ }
  if (r.endsWith('/README.md')) r = r.slice(0, -'README.md'.length);
  return r;
}

function refOf(s) {
  const m = s.match(LINK_RE) || s.match(TICK_RE);
  return m ? normalizeRef(m[1]) : null;
}

// Style ('table' | 'bullets' | 'empty') and the entry each row/bullet names.
// Table header rows (the row above a separator) and separators are skipped.
function parseSection(body) {
  const lines = body.split('\n');
  const refs = [];
  let style = 'empty';
  lines.forEach((line, i) => {
    if (line.startsWith('|')) {
      style = 'table';
      if (SEP_RE.test(line.trim()) || SEP_RE.test((lines[i + 1] || '').trim())) return;
      const r = refOf(line.split('|')[1] || '');
      if (r) refs.push(r);
    } else if (/^[-*] /.test(line)) {
      if (style === 'empty') style = 'bullets';
      const r = refOf(line);
      if (r) refs.push(r);
    }
  });
  return { style, refs };
}

function listedRefs(text) {
  const sec = findSection(text);
  return sec ? parseSection(text.slice(sec.bodyStart, sec.end)).refs : [];
}

function row(name, style) {
  const target = (name.endsWith('/') ? `${name}README.md` : name).replace(/ /g, '%20');
  const link = `[${name}](${target})`;
  return style === 'bullets' ? `- ${link} — ${PLACEHOLDER}` : `| ${link} | ${PLACEHOLDER} |`;
}

// Add placeholder entries for `names`, matching the section's style. Creates the
// section (as a table) if absent. Never touches existing entries.
function addEntries(text, names) {
  if (names.length === 0) return text;
  const sec = findSection(text);
  if (!sec) {
    const rows = names.map((n) => row(n, 'table')).join('\n');
    return `${text.replace(/\s*$/, '')}\n\n## Index\n\n${TABLE_HEADER}\n${rows}\n`;
  }
  const lines = text.slice(sec.bodyStart, sec.end).split('\n');
  const { style } = parseSection(lines.join('\n'));
  let at = 0; // insert after lines[at]; lines[0] is the rest of the heading line
  let block;
  if (style === 'empty') {
    block = ['', TABLE_HEADER, ...names.map((n) => row(n, 'table'))];
  } else {
    const isEntry = style === 'table' ? (l) => l.startsWith('|') : (l) => /^[-*] /.test(l);
    lines.forEach((l, i) => { if (isEntry(l)) at = i; });
    if (style === 'bullets') while (at + 1 < lines.length && /^\s+\S/.test(lines[at + 1])) at++;
    block = names.map((n) => row(n, style));
  }
  if (at + 1 < lines.length && lines[at + 1].trim() !== '') block.push('');
  lines.splice(at + 1, 0, ...block);
  return text.slice(0, sec.bodyStart) + lines.join('\n') + text.slice(sec.end);
}

function privateSeed() {
  return '# Private index\n\nLocal-only — gitignored by the `_*` rule. Indexes this folder\'s `_` files so they\n' +
    'never appear in the committed `README.md`.\n\n## Index\n\n' + TABLE_HEADER + '\n';
}

module.exports = { TABLE_HEADER, PLACEHOLDER, listEntries, findSection, parseSection, listedRefs, addEntries, privateSeed };
```

- [ ] **Step 4: Implement the command** — `src/commands/index.js`

```js
// src/commands/index.js
'use strict';
const fs = require('fs');
const path = require('path');
const { findRoot } = require('../lib/root');
const { FOLDERS, OPTIONAL_FOLDERS, UNINDEXED } = require('../lib/structure');
const idx = require('../lib/index-section');

const topOf = (ref) => ref.replace(/\/+$/, '').split('/')[0];

// Report stale / leaked entries, then add rows for unlisted `entries`.
function updateIndexFile(dir, file, seed, entries, publicFile, dry) {
  const rel = path.relative(process.cwd(), file);
  const exists = fs.existsSync(file);
  const cur = exists ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : seed;
  const refs = idx.listedRefs(cur);
  for (const r of refs) {
    if (r.includes('://') || !topOf(r)) continue;
    if (publicFile && topOf(r).startsWith('_')) console.error(`  private entry in public index: ${r} (${rel})`);
    else if (!fs.existsSync(path.join(dir, topOf(r)))) console.error(`  stale index entry: ${r} (${rel})`);
  }
  const listed = new Set(refs.map(topOf));
  const missing = entries.filter((n) => !listed.has(topOf(n)));
  if (exists && missing.length === 0) return;
  const next = idx.addEntries(cur, missing);
  const what = exists ? `add ${missing.length} index row(s) to` : `create (${missing.length} row(s))`;
  if (dry) { console.error(`  would ${what}: ${rel}`); return; }
  fs.writeFileSync(file, next);
  console.error(`  ${exists ? `added ${missing.length} index row(s) to` : `created (${missing.length} row(s))`}: ${rel}`);
}

function indexFolder(aiDir, name, templateAiDir, opts) {
  const dir = path.join(aiDir, name);
  const { pub, priv } = idx.listEntries(dir);
  const own = path.join(templateAiDir, name, 'README.md');
  const seedPath = fs.existsSync(own) ? own : path.join(templateAiDir, 'templates', 'folder-README.md');
  updateIndexFile(dir, path.join(dir, 'README.md'), fs.readFileSync(seedPath, 'utf8'), pub, true, opts.dry);
  const privFile = path.join(dir, '_README.md');
  if (opts.private || fs.existsSync(privFile)) {
    updateIndexFile(dir, privFile, idx.privateSeed(), priv, false, opts.dry);
  }
}

function fail(msg) { console.error(`index: ${msg}`); process.exit(2); }

// opts: { cwd, templateAiDir, folder, private, dry }
function run(opts) {
  const aiDir = findRoot(opts.cwd);
  if (!aiDir) fail('no .ai/ directory found at or above the current directory.');
  let names;
  if (opts.folder) {
    const f = opts.folder.replace(/[\\/]+$/, '');
    if (path.isAbsolute(f) || f.split(/[\\/]/).includes('..')) fail(`folder must be a name inside .ai/: ${opts.folder}`);
    if (UNINDEXED.includes(f)) fail(`${f}/ is not indexed (disposable or date-stamped).`);
    const full = path.join(aiDir, f);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) fail(`no such folder: ${f}/`);
    names = [f];
  } else {
    names = [...FOLDERS, ...OPTIONAL_FOLDERS]
      .filter((f) => !UNINDEXED.includes(f) && fs.existsSync(path.join(aiDir, f)));
  }
  console.error(`Indexing ${aiDir}…`);
  for (const n of names) indexFolder(aiDir, n, opts.templateAiDir, opts);
}

module.exports = { run };
```

- [ ] **Step 5: Wire the CLI** — in `bin/cli.js`:

1. Under `const promoteCmd = …` add `const indexCmd = require('../src/commands/index');`
2. Add `'index'` to the `SUBCOMMANDS` set.
3. In `usage()`, after the `promote` line add:
   `  index          Add missing rows to folders' ## Index tables (never edits existing rows)`
   and after the `--overwrite` option line add:
   `  --private      (index) Also index _ files into the folder's gitignored _README.md`
4. Add, after `runPromote`:

```js
async function runIndex(args) {
  let dryRun = false, priv = false, folder = null;
  for (const a of args) {
    if (a === '--dry-run') dryRun = true;
    else if (a === '--private') priv = true;
    else if (a.startsWith('-')) { console.error(`Unknown option: ${a}`); process.exit(2); }
    else if (folder === null) folder = a;
    else { console.error(`index: unexpected extra argument: ${a}`); process.exit(2); }
  }
  indexCmd.run({ cwd: process.cwd(), templateAiDir: TEMPLATE_AI, folder, private: priv, dry: dryRun });
}
```

5. In `main()`, after the `promote` dispatch line: `else if (first === 'index') return runIndex(rest);`

Note: the absolute-path test passes `/…/.ai/knowledge`, which starts with `/` and so is treated as a folder positional (not an option) and rejected by `path.isAbsolute`.

- [ ] **Step 6: Run to verify it passes**

Run: `node test/index.test.js`
Expected: all `ok:`, ends `INDEX OK`.

- [ ] **Step 7: Register + regression.** Append ` && node test/index.test.js` to `unit`. Run `npm run unit && npm test && npm run smoke`. Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/index-section.js src/commands/index.js bin/cli.js test/index.test.js package.json
git commit -m "feat: dot-ai index — add missing ## Index rows (--private for _README.md)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Convention text + docs

**Files:**
- Modify: `agent-instructions.md:78-92`, `README.md` (Commands table, cascade paragraph, new "Folder indexes" subsection), `SPEC.md:51-57`

**Interfaces:** none (text). `npm test` asserts the injected block is byte-identical across both installers.

- [ ] **Step 1: Replace `agent-instructions.md` from `## Session-startup behavior` to end of file** with:

```markdown
## Session-startup behavior

**Load by importance, not everything.** Each folder's `README.md` has an `## Index` — read the
index, then open only the files the task needs.

1. **Nearest `.ai/`:** read `knowledge/` and `guidelines/` (follow an index's reading order if it
   gives one).
2. **Global `~/.ai/`:** read the `knowledge/` and `guidelines/` indexes; open the entries that bear
   on the task.
3. **Intermediate layers:** don't load them at startup — consult their indexes when the task
   reaches that scope.
4. **`context/`:** nearest layer only, and only when continuing prior work; skip it on a fresh start.
5. **`lessons/`:** only when stuck (an error, a correction, a repeated failure) — check the nearest
   layer, then global. When a lesson applies, propose promoting it into its `guidelines/` or
   `knowledge/` home, then delete the lesson.

Everything else — `runbooks/`, `plans/`, `audits/`, `notes/`, `templates/`, `scripts/`, `data/` — is
consulted on-task via its index; `archive/` by filename. Surface `notes/` only if relevant.

- **Validate the structure:** compare the layout to this canonical structure. If folders are missing,
  misnamed, or files sit in the wrong category, offer to restructure — never restructure silently.
- **If it does not exist:** offer to scaffold it (omit the optional extension folders until needed).

## Folder indexes

Every folder except `context/` and `archive/` has an `## Index` in its `README.md`: a
`| File | Answers |` table with one row per top-level file or subfolder. The convention-owned text
above it sits between `<!-- BEGIN .ai-folder -->` markers and is refreshed by `dot-ai sync`; the
index is yours.

- **Maintain indexes as you work, without being asked.** When you create, rename, move, promote, or
  archive a file under `.ai/`, update that folder's index in the same change. If a folder has files
  but no index, add one; start new folders from `templates/folder-README.md`. The user may also ask
  you to reindex a folder or layer — do it the same way.
- **Never list `_` files in `README.md`** — it is committed. Index them in the folder's gitignored
  `_README.md` only if one exists or the user asks for one. When reading an index, also read
  `_README.md` if present.
- `dot-ai index` adds rows for unlisted files (`TODO: describe`); you write the "Answers" text.

## Nested cascade

**Nested cascade.** Every `.ai/` from the working directory up to and including `~/.ai/` (the
machine-global layer) is available, applied additively — outer is broad, inner is specific, and on
a same-folder/same-filename collision the nearest layer wins. Available is not loaded: the startup
tiers above decide what is read.
```

- [ ] **Step 2: `README.md`**
  - In the Commands table, after the `promote` row add:
    `| \`index [folder]\` | Add missing rows to folders' \`## Index\` tables (\`--private\` for \`_\` files; never edits existing rows) |`
  - Replace the first paragraph under `### Nested cascade & global \`~/.ai/\`` with:

```markdown
`.ai/` directories compose: every `.ai/` from your current directory up to and including
**`~/.ai/`** (the machine-global layer) is available, applied additively — outer is broad, inner is
specific, nearest wins on a collision. Agents don't read it all at startup: they read the nearest
layer's `knowledge/` and `guidelines/`, the global layer's indexes, and consult everything else on
demand (see [agent-instructions.md](./agent-instructions.md)). `~/.ai/` is just `.ai/` scaffolded in
your home directory (`cd ~ && dot-ai init`). Inspect the chain with `dot-ai context`; move files
between layers with `dot-ai promote`.
```

  - After the paragraph ending "…browse it as a worked example." (in "What you get") add:

```markdown
### Folder indexes

Each folder's `README.md` has two parts: a managed block (`<!-- BEGIN .ai-folder -->`) that
`dot-ai sync` keeps current, and an `## Index` table below it that belongs to you — one row per
file, saying what it answers. Agents read indexes first and open files on demand, and keep indexes
current as they work. `dot-ai index` fills in rows for anything unlisted. `_` files stay out of the
committed index; `dot-ai index --private` lists them in a gitignored `_README.md` instead.
```

- [ ] **Step 3: `SPEC.md`** — replace the paragraph beginning "`.ai/` directories compose. When an agent works…" (lines 53-57) with:

```markdown
`.ai/` directories compose. When an agent works in a directory, every `.ai/` from the current
directory up to and including `~/.ai/` (the machine-global layer) is **available**. The chain is
**additive** — outer layers are broad, inner layers are specific — and on a collision (same folder +
same filename) the **nearest layer wins**. Available is not loaded: agents read the nearest layer's
`knowledge/` and `guidelines/` at startup, the global layer through its folder indexes, and
everything else on demand (tiers in [`agent-instructions.md`](./agent-instructions.md)).
```

- [ ] **Step 4: Verify**

```sh
grep -rn "Auto-loaded at session start" agent-instructions.md README.md SPEC.md template/ ; echo "exit=$?"   # expect exit=1 (no matches)
grep -n "Read every" agent-instructions.md ; echo "exit=$?"                                                 # expect exit=1
npm test && npm run smoke && npm run unit
```
Expected: both greps find nothing; all suites green.

- [ ] **Step 5: Commit**

```bash
git add agent-instructions.md README.md SPEC.md
git commit -m "docs: tiered startup loading, folder indexes, available-vs-loaded cascade

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dogfood this repo's `.ai/` + full verification

**Files:**
- Modify: `.ai/*/README.md` (via `sync`), `.ai/knowledge/README.md`, `.ai/guidelines/README.md` (heading rename), `.ai/plans/README.md` (index rows)
- Add: `.ai/templates/folder-README.md` (via `sync`)

**Interfaces:** consumes the finished CLI from source.

- [ ] **Step 1: Preview the migration.** Run `node bin/cli.js sync --dry-run`. Expected: `would migrate README block:` for all 12 folders, **no** `skip (customized …)` lines, `would add: .ai/templates/folder-README.md`. If any README reports customized, STOP and report it — do not hand-edit around it.

- [ ] **Step 2: Apply.** Run `node bin/cli.js sync`, then `git diff --stat .ai/` — expect only `.ai/*/README.md` changes plus the new template file.

- [ ] **Step 3: Rename headings to the standard.** In `.ai/knowledge/README.md` and `.ai/guidelines/README.md`, change `## In this folder` to `## Index` (their bullet lists stay bullets — table conversion is the rollout follow-up).

- [ ] **Step 4: Index.** Run `node bin/cli.js index`. Review stderr: expect rows added to `plans/`, `audits/`, `notes/`, `scripts/`, `data/`, `archive` excluded, `_` files not listed. Replace every `TODO: describe` with a real one-line description (read each file's heading/first paragraph). **Exception:** `.ai/plans/2026-07-02_audit-remediation.md` and `.ai/notes/sync-nests-when-cwd-is-ai-layer.md` are the user's pre-existing **untracked** files — delete their rows (a committed index must not point at uncommitted files) and never `git add` them. Verify: `grep -rn "TODO: describe" .ai/*/README.md; echo "exit=$?"` → `exit=1`.

- [ ] **Step 5: Measure startup cost.** Run and record the output in the PR description:

```sh
nearest=$(cat .ai/knowledge/* .ai/guidelines/* 2>/dev/null | wc -c)
global=$(cat ~/.ai/knowledge/README.md ~/.ai/guidelines/README.md 2>/dev/null | wc -c)
echo "tier1=$nearest bytes  tier2(global indexes)=$global bytes  total=$((nearest+global))"
```
Expected: total ≈ 45 KB (vs ≈ 490 KB under the old rule).

- [ ] **Step 6: Full verification.**

```sh
npm run unit && npm test && npm run smoke && npm run pack-test
node bin/cli.js doctor
git diff origin/staging --stat
```
Expected: all green; `doctor` exits 0; pack-test confirms `template/.ai/templates/folder-README.md` and `src/lib/legacy-readmes/` ship (inspect with `npm pack --dry-run | grep -E "folder-README|legacy-readmes"`); the diff touches only files named in this plan.

- [ ] **Step 7: Commit**

```bash
git add .ai/*/README.md .ai/templates/folder-README.md
git status --short   # the two untracked user files must still show as ??
git commit -m "chore(.ai): dogfood managed folder READMEs and indexes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Hand off.** Do **not** push or open a PR. Report to the user: commits, test results, the Step 5 numbers, and the follow-ups (version bump to 1.1.0 via `.ai/runbooks/releasing.md`; `dot-ai sync --global` on their machine; the index-rollout follow-up).
