'use strict';
const fs = require('fs');
const path = require('path');

// Recursively copy a template tree into a destination, never clobbering existing
// files. npm renames any shipped `.gitignore` to `.npmignore`, so the template
// ships ignore files as `gitignore` (no dot); restore the dot here.
function copyTree(srcDir, destDir, dry) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const destName = entry.name === 'gitignore' ? '.gitignore' : entry.name;
    const d = path.join(destDir, destName);
    if (entry.isDirectory()) {
      if (!dry) fs.mkdirSync(d, { recursive: true });
      copyTree(s, d, dry);
    } else if (fs.existsSync(d)) {
      console.error(`  skip (exists): ${path.relative(process.cwd(), d)}`);
    } else if (dry) {
      console.error(`  would add: ${path.relative(process.cwd(), d)}`);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      console.error(`  add: ${path.relative(process.cwd(), d)}`);
    }
  }
}

module.exports = { copyTree };
