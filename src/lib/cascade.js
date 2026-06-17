// src/lib/cascade.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Prefer $HOME so tests can redirect it; fall back to os.homedir().
function homeDir() { return process.env.HOME || os.homedir(); }

// All `.ai/` directories from `start` walking up to and INCLUDING ~/.ai/, nearest
// first. The walk stops at the home directory (so ~/.ai is the outermost layer and
// nothing above home is collected); if `start` is not under home, it walks to the
// filesystem root. Returns absolute `.ai/` paths.
function cascadeChain(start) {
  const home = path.resolve(homeDir());
  const chain = [];
  let dir = path.resolve(start);
  for (;;) {
    const ai = path.join(dir, '.ai');
    try { if (fs.statSync(ai).isDirectory()) chain.push(ai); } catch { /* none here */ }
    if (dir === home) break;            // include ~/.ai (if present), then stop
    const parent = path.dirname(dir);
    if (parent === dir) break;          // filesystem root (start not under home)
    dir = parent;
  }
  return chain; // nearest-first
}

module.exports = { cascadeChain, homeDir };
