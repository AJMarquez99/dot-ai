// src/lib/root.js
'use strict';
const fs = require('fs');
const path = require('path');

// Nearest directory at or above `start` that contains a `.ai/` directory; returns
// the absolute path to that `.ai/` dir, or null if none is found up to the
// filesystem root. (Plan 3's cascade enumeration builds on this same walk-up.)
function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    const ai = path.join(dir, '.ai');
    try {
      if (fs.statSync(ai).isDirectory()) return ai;
    } catch { /* no .ai here */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

module.exports = { findRoot };
