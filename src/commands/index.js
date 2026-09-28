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
  const usingOwn = fs.existsSync(own);
  const seedPath = usingOwn ? own : path.join(templateAiDir, 'templates', 'folder-README.md');
  let seed = fs.readFileSync(seedPath, 'utf8');
  if (!usingOwn) seed = seed.replace('# <folder>/', `# ${name}/`);
  updateIndexFile(dir, path.join(dir, 'README.md'), seed, pub, true, opts.dry);
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
    if (f === '' || f === '.' || /[\\/]/.test(f) || f.split(/[\\/]/).includes('..')) {
      fail(`folder must be a single folder name inside .ai/: ${opts.folder}`);
    }
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
