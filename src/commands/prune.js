// src/commands/prune.js
'use strict';
const fs = require('fs');
const path = require('path');
const { findRoot } = require('../lib/root');
const { today, daysBetween } = require('../lib/dates');

const DATED = /^(\d{4}-\d{2}-\d{2})_/;
const DEFAULT_DAYS = 90;

// opts: { cwd, force, days, dry }  — prune is dry unless force is set.
function run(opts) {
  const { cwd, force } = opts;
  const days = (opts.days != null) ? opts.days : DEFAULT_DAYS;

  const aiDir = findRoot(cwd);
  if (!aiDir) { console.error('prune: no .ai/ directory found at or above the current directory.'); process.exit(2); }
  const archiveDir = path.join(aiDir, 'archive');
  if (!fs.existsSync(archiveDir)) { console.error('prune: no archive/ directory; nothing to do.'); return; }

  const now = today();
  let count = 0;
  for (const name of fs.readdirSync(archiveDir)) {
    if (name === 'README.md') continue;
    const m = DATED.exec(name);
    if (!m) continue;                       // undated -> ignore
    if (name.includes('_retain')) continue; // exempt
    const age = daysBetween(now, m[1]);
    if (age <= days) continue;              // within retention window -> keep
    const full = path.join(archiveDir, name);
    if (!force) { console.error(`  would prune (${age}d old): ${name}`); count++; continue; }
    fs.rmSync(full, { recursive: true, force: true });
    console.error(`  pruned (${age}d old): ${name}`);
    count++;
  }
  if (force) console.error(`\nPruned ${count} item(s).`);
  else if (count) console.error(`\n${count} item(s) past the ${days}-day window. Re-run with --force to delete.`);
  else console.error('Nothing to prune.');
}

module.exports = { run, DATED, DEFAULT_DAYS };
