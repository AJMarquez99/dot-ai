// src/commands/doctor.js
'use strict';
const fs = require('fs');
const path = require('path');
const { findRoot } = require('../lib/root');
const { FOLDERS, OPTIONAL_FOLDERS, UNINDEXED, isCanonical } = require('../lib/structure');
const { cascadeChain } = require('../lib/cascade');
const idx = require('../lib/index-section');
const markers = require('../lib/markers');
const { FOLDER_BEGIN, FOLDER_END } = require('../lib/folder-readme');
const { git, publicIgnored } = require('../lib/git-ignore');

// Collect problems with the nearest .ai/ tree (read-only). Returns string[].
function diagnose(aiDir) {
  const problems = [];
  const has = (p) => fs.existsSync(path.join(aiDir, p));

  // 1. Missing canonical folders.
  for (const f of FOLDERS) if (!has(f)) problems.push(`missing folder: ${f}/`);

  // 2. .gitignore + its _* local-prefix rule.
  if (!has('.gitignore')) {
    problems.push('missing .ai/.gitignore');
  } else {
    const lines = fs.readFileSync(path.join(aiDir, '.gitignore'), 'utf8').split(/\r?\n/);
    if (!lines.some((l) => l.trim() === '_*')) problems.push('.ai/.gitignore is missing the _* local-prefix rule');
  }

  // 3. context/ contents should be gitignored.
  if (has('context') && !has(path.join('context', '.gitignore'))) {
    problems.push('context/ has no .gitignore (its contents should be ignored)');
  }

  // 4. Missing per-folder READMEs.
  for (const f of FOLDERS) {
    if (has(f) && !has(path.join(f, 'README.md'))) problems.push(`missing README: ${f}/README.md`);
  }

  // 5. Stale non-canonical folders (sync-removable candidates).
  for (const name of fs.readdirSync(aiDir)) {
    const full = path.join(aiDir, name);
    if (!fs.statSync(full).isDirectory()) continue;
    if (name.startsWith('_') || isCanonical(name) || name === '.ai') continue;
    const entries = fs.readdirSync(full);
    if (entries.every((e) => e === 'README.md' || e === '.gitignore')) {
      problems.push(`stale folder (sync-removable): ${name}/`);
    }
  }

  // 6. A nested .ai/.ai — a dir from running init/sync inside the layer (pre-1.1.2), or a stray file.
  if (has('.ai')) {
    problems.push(fs.statSync(path.join(aiDir, '.ai')).isDirectory()
      ? 'nested .ai/.ai/ found — likely from running init/sync inside .ai/; move its contents up and remove it'
      : 'stray file .ai/.ai inside the layer — remove it');
  }

  return problems;
}

// A layer holding nothing but plans/ — typically created by a relative
// plansDirectory in user-level agent settings when a session starts in a
// directory with no scaffold. Returns null, or { files } in plans/.
function plansOnly(aiDir) {
  let entries;
  try { entries = fs.readdirSync(aiDir).filter((e) => e !== '.DS_Store'); } catch { return null; }
  if (entries.length !== 1 || entries[0] !== 'plans') return null;
  const plans = path.join(aiDir, 'plans');
  if (!fs.statSync(plans).isDirectory()) return null;
  return { files: fs.readdirSync(plans).filter((e) => e !== '.DS_Store').length };
}

function plansOnlyProblem(aiDir, info) {
  const keep = info.files ? ` (plans/ has ${info.files} file(s) — keep them before removing)` : '';
  return `plans-only .ai/ layer: ${aiDir} — likely created by a relative plansDirectory in user-level `
    + `agent settings (e.g. ~/.claude/settings.json); remove it if empty, or scaffold it with 'dot-ai init'${keep}`;
}

// Index health for every indexed folder of the layer (README.md only; _README.md
// is private and not audited). Problems break the committed-index promise;
// warnings are unfinished work.
function diagnoseIndexes(aiDir) {
  const problems = [], warnings = [];
  let unlisted = 0;
  const names = [...FOLDERS, ...OPTIONAL_FOLDERS].filter((f) => !UNINDEXED.includes(f));
  for (const f of names) {
    const dir = path.join(aiDir, f);
    const readme = path.join(dir, 'README.md');
    if (!fs.existsSync(readme) || !fs.statSync(dir).isDirectory()) continue;
    const rel = `${f}/README.md`;
    const text = fs.readFileSync(readme, 'utf8').replace(/\r\n/g, '\n');
    const scan = markers.scanBlocks(text, FOLDER_BEGIN, FOLDER_END);
    if (scan.status === 'ok' && scan.blocks > 1) {
      problems.push(`${scan.blocks} managed blocks in ${rel} — remove the extras by hand`);
    }
    const { pub } = idx.listEntries(dir);
    const a = idx.auditIndex({
      text, entries: pub, ignored: publicIgnored(dir, pub).ignored, isPublic: true,
      exists: (top) => fs.existsSync(path.join(dir, top)),
    });
    for (const r of a.privateEntries) problems.push(`private entry in public index: ${r} (${rel})`);
    for (const r of a.stale) problems.push(`stale index entry: ${r} (${rel})`);
    for (const r of a.linkedIgnored) problems.push(`linked entry is gitignored: ${r} (${rel})`);
    if (a.todo) warnings.push(`${a.todo} TODO: describe row(s) in ${rel}`);
    for (const m of a.missing) warnings.push(`unlisted in index: ${f}/${m}`);
    unlisted += a.missing.length;
  }
  return { problems, warnings, unlisted };
}

// opts: { cwd }
function run(opts) {
  const { cwd } = opts;
  const aiDir = findRoot(cwd);
  if (!aiDir) { console.error('doctor: no .ai/ directory found at or above the current directory.'); process.exit(2); }

  const chain = cascadeChain(cwd);
  const layers = chain.includes(aiDir) ? chain : [aiDir, ...chain];
  const strays = layers.map((ai) => ({ ai, info: plansOnly(ai) })).filter((s) => s.info);
  const nearestStray = strays.some((s) => s.ai === aiDir);
  const problems = nearestStray ? [] : diagnose(aiDir);
  const ignore = nearestStray ? { problems: [], notes: [] } : diagnoseIgnore(aiDir);
  const indexes = nearestStray ? { problems: [], warnings: [], unlisted: 0 } : diagnoseIndexes(aiDir);
  problems.push(...ignore.problems, ...indexes.problems);
  problems.push(...strays.map((s) => plansOnlyProblem(s.ai, s.info)));
  console.error(`dot-ai doctor — ${path.relative(cwd, aiDir) || '.ai'}`);
  if (chain.length > 1) {
    console.error('  cascade (broad → specific):');
    [...chain].reverse().forEach((ai) => console.error(`    - ${ai}`));
  }
  for (const n of ignore.notes) console.error(`  · ${n}`);
  for (const w of indexes.warnings) console.error(`  · ${w}`);
  if (problems.length === 0) {
    console.error('  ✓ no problems found');
    if (indexes.unlisted) console.error("  Run 'dot-ai index' to add missing rows.");
    process.exit(0);
  }
  for (const p of problems) console.error(`  ✗ ${p}`);
  const hint = ignore.problems.length
    ? "Run 'dot-ai sync' to restore folders, READMEs, and the .gitignore rule; ignore problems above need a git fix (e.g. 'git rm --cached <path>')."
    : "Run 'dot-ai sync' to restore folders, READMEs, and the .gitignore rule.";
  console.error(`\n${problems.length} problem(s) found. ${hint}`);
  if (indexes.unlisted) console.error("  Run 'dot-ai index' to add missing rows.");
  process.exit(1);
}

// Verify the _* local-prefix rule is actually IN FORCE, rather than merely
// present as a line in .ai/.gitignore. Reading the line answers "is the rule
// written down"; the convention's promise is "is this path ignored", and those
// differ whenever there is no repo, a later line in .ai/.gitignore negates the
// rule, or a _-prefixed file was force-added before the rule existed.
//
// Returns { problems, notes }: `notes` are states worth reporting that are not
// faults (no repo, no git), `problems` are cases where the promise is broken.
function diagnoseIgnore(aiDir) {
  const problems = [];
  const notes = [];

  const inside = git(['rev-parse', '--is-inside-work-tree'], aiDir);
  if (!inside.ok) {
    notes.push('git not on PATH — could not verify the _* rule is in force');
    return { problems, notes };
  }
  // Only git's own "not a git repository (or any of the parent directories)" (or
  // being inside .git/, where there is no work tree) means no repo. Any other
  // failure — a bad GIT_DIR ("not a git repository: '<path>'"), a safe.directory
  // refusal, a corrupt repo — leaves the question unanswered, and must not be
  // reported as the all-clear "nothing can be committed".
  const noRepo = (inside.status === 0 && inside.out === 'false')
    || (inside.status !== 0 && /not a git repository \(or any (of the )?parent/i.test(inside.err));
  if (noRepo) {
    notes.push('not a git repository — the _* rule is inert here (nothing can be committed either)');
    return { problems, notes };
  }
  if (inside.status !== 0 || inside.out !== 'true') {
    const why = inside.err.split('\n')[0];
    notes.push(`could not verify the _* rule (git rev-parse failed${why ? `: ${why}` : ''})`);
    return { problems, notes };
  }

  // check-ignore matches rules, not files, so the probe need not exist — and a
  // path that does not exist cannot be tracked, keeping this independent of the
  // index check below.
  const probe = path.join(aiDir, 'knowledge', '_dot-ai-doctor-probe.md');
  const ci = git(['check-ignore', '-q', probe], aiDir);
  if (ci.status === 0) {
    notes.push('_* rule verified in force (git ignores _-prefixed paths under .ai/)');
  } else if (ci.status === 1) {
    problems.push('the _* rule is NOT in force — git does not ignore _-prefixed paths under .ai/ '
      + '(check for a later negating line in .ai/.gitignore, or a missing/unreadable .ai/.gitignore)');
  } else {
    notes.push('could not verify the _* rule (git check-ignore did not answer)');
  }

  // A tracked _-prefixed path is ignored by nothing: gitignore does not apply to
  // files already in the index, so the rule silently fails for exactly the files
  // it was added to protect.
  const ls = git(['ls-files', '-z'], aiDir);
  if (ls.ok && ls.status === 0 && ls.out) {
    const tracked = ls.out.split('\0').filter(Boolean)
      .filter((f) => f.split('/').some((seg) => seg.startsWith('_')));
    for (const t of tracked.slice(0, 5)) {
      problems.push(`_-prefixed path is tracked by git, so the _* rule does not apply to it: ${t} — if it should be private, 'git rm --cached' it`);
    }
    if (tracked.length > 5) {
      problems.push(`...and ${tracked.length - 5} more tracked _-prefixed path(s)`);
    }
  }

  return { problems, notes };
}

module.exports = { run, plansOnly, diagnose, diagnoseIgnore, diagnoseIndexes };
