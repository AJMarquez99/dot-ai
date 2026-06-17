// src/commands/sync.js
'use strict';
const path = require('path');
const { copyTree } = require('../lib/scaffold');

// opts: { cwd, templateAiDir, dry }
// For now: additive scaffold of the .ai/ tree (= today's --no-md behavior).
function run(opts) {
  const { templateAiDir, dry, cwd } = opts;
  console.error('Syncing .ai/ scaffold…');
  copyTree(templateAiDir, path.join(cwd, '.ai'), dry);
}

module.exports = { run };
