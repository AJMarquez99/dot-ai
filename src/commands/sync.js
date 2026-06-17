// src/commands/sync.js
'use strict';
const fs = require('fs');
const path = require('path');
const { copyTree } = require('../lib/scaffold');
const { isCanonical } = require('../lib/structure');
const { BEGIN, END, inject, globalConfigFile, conventionInstalled } = require('../lib/wiring');

// True if a folder has no user content — it holds at most README.md and/or .gitignore
// (an empty folder also qualifies). Such folders are safe to prune.
function onlyScaffoldFiles(dir) {
  const entries = fs.readdirSync(dir);
  return entries.every((e) => e === 'README.md' || e === '.gitignore');
}

// Remove non-manifest, non-_ folders that the template no longer defines and that
// contain no user content. Never touches canonical or _-prefixed folders.
function pruneStaleFolders(aiDir, dry) {
  if (!fs.existsSync(aiDir)) return;
  for (const name of fs.readdirSync(aiDir)) {
    const full = path.join(aiDir, name);
    if (!fs.statSync(full).isDirectory()) continue;
    if (name.startsWith('_')) continue;          // user-owned
    if (isCanonical(name)) continue;             // template-defined
    if (!onlyScaffoldFiles(full)) continue;      // has user content
    if (dry) { console.error(`  would remove stale folder: ${name}`); continue; }
    fs.rmSync(full, { recursive: true, force: true });
    console.error(`  removed stale folder: ${name}`);
  }
}

// Rewrite an existing convention block (only if present) to the latest instructions.
// The conventionInstalled guard guarantees the file exists AND has the block, so
// inject() takes its in-place replace branch — it never newly-wires a block-less file.
function resyncBlock(file, block, dry) {
  if (!conventionInstalled(file)) return;   // never newly-wires
  inject(file, block, dry);                 // delegates the BEGIN..END replace to wiring.inject
}

// opts: { cwd, templateAiDir, instructionsPath, dry, global }
function run(opts) {
  const { cwd, templateAiDir, instructionsPath, dry, global: isGlobal } = opts;
  const aiDir = path.join(cwd, '.ai');

  console.error('Syncing .ai/ scaffold…');
  copyTree(templateAiDir, aiDir, dry);     // additive
  pruneStaleFolders(aiDir, dry);           // reconcile (safe removals)

  // Resync existing convention blocks to the latest agent-instructions.md.
  const instructions = fs.readFileSync(instructionsPath, 'utf8').trimEnd();
  const block = `${BEGIN}\n${instructions}\n${END}`;
  const local = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md'].map((f) => path.join(cwd, f));
  for (const f of local) resyncBlock(f, block, dry);
  if (isGlobal) {
    for (const tool of ['claude', 'gemini', 'codex']) {
      resyncBlock(globalConfigFile(tool), block, dry);
    }
  }
}

module.exports = { run, pruneStaleFolders, onlyScaffoldFiles, resyncBlock };
