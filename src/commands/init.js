// src/commands/init.js
'use strict';
const path = require('path');
const { copyTree } = require('../lib/scaffold');
const { cascadeChain } = require('../lib/cascade');
const wire = require('./wire');

// opts: {
//   cwd, templateAiDir, instructionsPath, dry, noMd,
//   want:{claude,gemini,codex,global}, wantPlans
// }
function run(opts) {
  const { cwd, templateAiDir, dry, noMd, want } = opts;

  console.error('Installing .ai/ scaffold…');
  copyTree(templateAiDir, path.join(cwd, '.ai'), dry);

  // Heads-up if this new .ai/ nests under an existing ancestor .ai/.
  if (!dry) {
    const ownAi = path.resolve(path.join(cwd, '.ai'));
    const ancestors = cascadeChain(path.dirname(path.resolve(cwd))).filter(
      (ai) => path.resolve(ai) !== ownAi
    );
    if (ancestors.length) {
      console.error(`  note: an ancestor .ai/ already governs this path (${ancestors[0]}).`);
      console.error('        This nested .ai/ overrides it for the more specific scope (see: dot-ai context).');
    }
  }

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
