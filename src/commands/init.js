// src/commands/init.js
'use strict';
const path = require('path');
const { copyTree } = require('../lib/scaffold');
const wire = require('./wire');

// opts: {
//   cwd, templateAiDir, instructionsPath, dry, noMd,
//   want:{claude,gemini,codex,global}, wantPlans
// }
function run(opts) {
  const { cwd, templateAiDir, dry, noMd, want } = opts;

  console.error('Installing .ai/ scaffold…');
  copyTree(templateAiDir, path.join(cwd, '.ai'), dry);

  if (noMd) {
    console.error('Scaffold only (--no-md) — skipping agent config and settings.');
    console.error('Done.');
    return;
  }

  if (want.claude || want.gemini || want.codex) {
    wire.run(opts);
  }
  console.error('Done.');
}

module.exports = { run };
