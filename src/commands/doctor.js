// src/commands/doctor.js
'use strict';
const fs = require('fs');
const path = require('path');
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
  console.error(`dot-ai doctor — ${path.relative(cwd, aiDir) || '.ai'}`);
  const chain = cascadeChain(cwd);
  if (chain.length > 1) {
    console.log('  cascade (broad → specific):');
    [...chain].reverse().forEach((ai) => console.log(`    - ${ai}`));
  }
  if (problems.length === 0) {
    console.error('  ✓ no problems found');
    process.exit(0);
  }
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\n${problems.length} problem(s) found. Run 'dot-ai sync' to restore folders, READMEs, and the .gitignore rule.`);
  process.exit(1);
}

module.exports = { run, diagnose };
