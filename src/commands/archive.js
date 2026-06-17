// src/commands/archive.js
'use strict';
const fs = require('fs');
const path = require('path');
const { findRoot } = require('../lib/root');
const { today } = require('../lib/dates');

const DATED = /^\d{4}-\d{2}-\d{2}_/;

// opts: { cwd, target, retain, dry }
function run(opts) {
  const { cwd, target, retain, dry } = opts;
  if (!target) { console.error('archive: missing <path> to archive.'); process.exit(2); }

  const aiDir = findRoot(cwd);
  if (!aiDir) { console.error('archive: no .ai/ directory found at or above the current directory.'); process.exit(2); }

  const abs = path.resolve(cwd, target);
  let st;
  try { st = fs.statSync(abs); } catch { console.error(`archive: not found: ${target}`); process.exit(2); }
  if (!st.isFile()) { console.error(`archive: not a file: ${target}`); process.exit(2); }

  const rel = path.relative(aiDir, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    console.error(`archive: ${target} is outside ${path.relative(cwd, aiDir) || '.ai'}/`); process.exit(2);
  }

  const base = path.basename(abs);
  if (DATED.test(base)) { console.error(`archive: ${base} already has a YYYY-MM-DD_ prefix.`); process.exit(2); }

  let name = `${today()}_${base}`;
  if (retain) {
    const ext = path.extname(name);
    name = ext ? `${name.slice(0, -ext.length)}_retain${ext}` : `${name}_retain`;
  }
  const dest = path.join(aiDir, 'archive', name);
  const show = (p) => path.relative(cwd, p) || p;

  if (dry) { console.error(`  would archive: ${show(abs)} -> ${show(dest)}`); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(abs, dest);
  console.error(`  archived: ${show(abs)} -> ${show(dest)}`);
}

module.exports = { run, DATED };
