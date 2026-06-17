// src/commands/wire.js
'use strict';
const fs = require('fs');
const path = require('path');
const {
  BEGIN, END, inject, homeDir, globalConfigFile, conventionInstalled, writePlansSetting,
} = require('../lib/wiring');

// opts: { want:{claude,gemini,codex,global}, instructionsPath, dry, noPlans, wantPlans }
// Injects the convention block into the selected tools at the chosen scope.
function run(opts) {
  const { want, instructionsPath, dry } = opts;
  const instructions = fs.readFileSync(instructionsPath, 'utf8').trimEnd();
  const block = `${BEGIN}\n${instructions}\n${END}`;

  const mdTarget = (file, subdir) => want.global ? path.join(homeDir(), subdir, file) : file;
  const codexHome = () => process.env.CODEX_HOME || path.join(homeDir(), '.codex');
  const codexTarget = () => want.global ? path.join(codexHome(), 'AGENTS.md') : 'AGENTS.md';

  if (want.claude) inject(mdTarget('CLAUDE.md', '.claude'), block, dry);
  if (want.gemini) inject(mdTarget('GEMINI.md', '.gemini'), block, dry);
  if (want.codex)  inject(codexTarget(), block, dry);

  if (opts.wantPlans && (want.claude || want.gemini || want.codex)) {
    writePlansSetting(want, dry);
  }
}

module.exports = { run, conventionInstalled, globalConfigFile };
