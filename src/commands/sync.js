// src/commands/sync.js
'use strict';
const fs = require('fs');
const path = require('path');
const { copyTree } = require('../lib/scaffold');
const { isCanonical } = require('../lib/structure');
const { BEGIN, END, escapeRe, globalConfigFile, conventionInstalled } = require('../lib/wiring');

// A folder is "empty of user content" if it holds only README.md and/or .gitignore.
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
function resyncBlock(file, block, dry) {
  if (!conventionInstalled(file)) return;        // never newly-wires
  if (dry) { console.error(`  would resync block in: ${file}`); return; }
  const cur = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`);
  fs.writeFileSync(file, cur.replace(re, block));
  console.error(`  resynced block in: ${file}`);
}

// opts: { cwd, templateAiDir, instructionsPath, dry, global }
function run(opts) {
  const { cwd, templateAiDir, instructionsPath, dry, global } = opts;
  const aiDir = path.join(cwd, '.ai');

  console.error('Syncing .ai/ scaffold…');
  copyTree(templateAiDir, aiDir, dry);     // additive
  pruneStaleFolders(aiDir, dry);           // reconcile (safe removals)

  // Resync existing convention blocks to the latest agent-instructions.md.
  const instructions = fs.readFileSync(instructionsPath, 'utf8').trimEnd();
  const block = `${BEGIN}\n${instructions}\n${END}`;
  const local = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md'].map((f) => path.join(cwd, f));
  for (const f of local) resyncBlock(f, block, dry);
  if (global) {
    for (const tool of ['claude', 'gemini', 'codex']) {
      resyncBlock(globalConfigFile(tool), block, dry);
    }
  }
}

module.exports = { run, pruneStaleFolders, onlyScaffoldFiles };
