// src/commands/doctor.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { findRoot } = require('../lib/root');
const { FOLDERS, isCanonical } = require('../lib/structure');
const { cascadeChain } = require('../lib/cascade');

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
    if (name.startsWith('_') || isCanonical(name)) continue;
    const entries = fs.readdirSync(full);
    if (entries.every((e) => e === 'README.md' || e === '.gitignore')) {
      problems.push(`stale folder (sync-removable): ${name}/`);
    }
  }

  return problems;
}

// opts: { cwd }
function run(opts) {
  const { cwd } = opts;
  const aiDir = findRoot(cwd);
  if (!aiDir) { console.error('doctor: no .ai/ directory found at or above the current directory.'); process.exit(2); }

  const problems = diagnose(aiDir);
  const ignore = diagnoseIgnore(aiDir);
  problems.push(...ignore.problems);
  console.error(`dot-ai doctor — ${path.relative(cwd, aiDir) || '.ai'}`);
  const chain = cascadeChain(cwd);
  if (chain.length > 1) {
    console.error('  cascade (broad → specific):');
    [...chain].reverse().forEach((ai) => console.error(`    - ${ai}`));
  }
  for (const n of ignore.notes) console.error(`  · ${n}`);
  if (problems.length === 0) {
    console.error('  ✓ no problems found');
    process.exit(0);
  }
  for (const p of problems) console.error(`  ✗ ${p}`);
  const hint = ignore.problems.length
    ? "Run 'dot-ai sync' to restore folders, READMEs, and the .gitignore rule; ignore problems above need a git fix (e.g. 'git rm --cached <path>')."
    : "Run 'dot-ai sync' to restore folders, READMEs, and the .gitignore rule.";
  console.error(`\n${problems.length} problem(s) found. ${hint}`);
  process.exit(1);
}

// Run git, tolerating its absence. status null means git could not be executed.
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error) return { ok: false, status: null, out: '' };
  return { ok: true, status: r.status, out: (r.stdout || '').trim() };
}

// Verify the _* local-prefix rule is actually IN FORCE, rather than merely
// present as a line in .ai/.gitignore. Reading the line answers "is the rule
// written down"; the convention's promise is "is this path ignored", and those
// differ whenever there is no repo, a parent .gitignore negates the rule, or a
// _-prefixed file was force-added before the rule existed.
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
  if (inside.status !== 0 || inside.out !== 'true') {
    notes.push('not a git repository — the _* rule is inert here (nothing can be committed either)');
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
      + '(check for a negating rule in a parent .gitignore, or a missing .ai/.gitignore)');
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
      problems.push(`_-prefixed path is already tracked by git, so the rule cannot protect it: ${t}`);
    }
    if (tracked.length > 5) {
      problems.push(`...and ${tracked.length - 5} more tracked _-prefixed path(s)`);
    }
  }

  return { problems, notes };
}

module.exports = { run, diagnose, diagnoseIgnore };
