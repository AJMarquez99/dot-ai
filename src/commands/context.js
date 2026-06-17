// src/commands/context.js
'use strict';
const { cascadeChain } = require('../lib/cascade');

// opts: { cwd }
function run(opts) {
  const chain = cascadeChain(opts.cwd);
  if (chain.length === 0) {
    console.error('context: no .ai/ directory found at or above the current directory.');
    process.exit(2);
  }
  console.log('Effective .ai/ cascade (broad → specific):');
  const ordered = [...chain].reverse(); // chain is nearest-first; print broad first
  ordered.forEach((ai, i) => {
    const label = ordered.length === 1 ? 'project'
      : i === 0 ? 'outermost'
      : i === ordered.length - 1 ? 'nearest' : 'ancestor';
    console.log(`  ${i + 1}. ${ai}  [${label}]`);
  });
}

module.exports = { run };
