// src/commands/promote.js
'use strict';
const fs = require('fs');
const path = require('path');
const { cascadeChain, homeDir } = require('../lib/cascade');
const { PROJECT_BOUND } = require('../lib/structure');

// Find the .ai/ layer (from `chain`) that contains `absFile`, or -1.
function layerOf(chain, absFile) {
  for (let i = 0; i < chain.length; i++) {
    const rel = path.relative(chain[i], absFile);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return i;
  }
  return -1;
}

// opts: { cwd, file, target, move, overwrite }
function run(opts) {
  const { cwd, file, target, move, overwrite } = opts;
  if (!file || !target) { console.error('promote: usage: dot-ai promote <file> <up|down|global|path> [--move] [--overwrite]'); process.exit(2); }

  const abs = path.resolve(cwd, file);
  let st;
  try { st = fs.statSync(abs); } catch { console.error(`promote: not found: ${file}`); process.exit(2); }
  if (!st.isFile()) { console.error(`promote: not a file: ${file}`); process.exit(2); }

  const chain = cascadeChain(path.dirname(abs));
  const srcIdx = layerOf(chain, abs);
  if (srcIdx === -1) { console.error(`promote: ${file} is not inside a .ai/ directory.`); process.exit(2); }
  const srcAi = chain[srcIdx];

  const relInAi = path.relative(srcAi, abs);
  const topFolder = relInAi.split(path.sep)[0];

  let destAi;
  if (target === 'global' || target === '-g') {
    destAi = path.join(path.resolve(homeDir()), '.ai');
  } else if (target === 'up' || target === '-u') {
    if (srcIdx + 1 >= chain.length) { console.error('promote: already at the outermost layer; nothing above.'); process.exit(2); }
    destAi = chain[srcIdx + 1];
  } else if (target === 'down' || target === '-d') {
    if (srcIdx - 1 < 0) { console.error('promote: already at the nearest layer; nothing below.'); process.exit(2); }
    destAi = chain[srcIdx - 1];
  } else {
    const p = path.resolve(cwd, target);
    if (path.basename(p) === '.ai') destAi = p;
    else if (fs.existsSync(path.join(p, '.ai'))) destAi = path.join(p, '.ai');
    else { console.error(`promote: target is not a .ai/ directory: ${target}`); process.exit(2); }
  }

  if (path.resolve(destAi) === path.resolve(srcAi)) { console.error('promote: source and target layer are the same.'); process.exit(2); }

  const dest = path.join(destAi, relInAi);
  const show = (p) => path.relative(cwd, p) || p;

  if (fs.existsSync(dest) && !overwrite) {
    console.error(`promote: destination already exists: ${show(dest)} (use --overwrite)`); process.exit(2);
  }
  if (PROJECT_BOUND.includes(topFolder)) {
    console.log(`  warning: ${topFolder}/ is project-bound; promoting it to a broader layer is unusual.`);
  }
  const body = fs.readFileSync(abs, 'utf8');
  const links = [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
  if (links.length) {
    console.log(`  note: file references ${links.length} [[link]](s) — verify they resolve from the target layer: ${links.join(', ')}`);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
  if (move) { fs.rmSync(abs); console.error(`  promoted (moved): ${show(abs)} -> ${show(dest)}`); }
  else { console.error(`  promoted (copied): ${show(abs)} -> ${show(dest)}`); }
}

module.exports = { run, layerOf };
