// test/root.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findRoot } = require('../src/lib/root');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-root-'))); }

check('finds .ai/ in the start dir', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, '.ai'));
  assert.strictEqual(findRoot(d), path.join(d, '.ai'));
});
check('walks up to an ancestor .ai/', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, '.ai'));
  const deep = path.join(d, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  assert.strictEqual(findRoot(deep), path.join(d, '.ai'));
});
check('returns the NEAREST .ai/ when nested', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, '.ai'));
  const mid = path.join(d, 'child');
  fs.mkdirSync(path.join(mid, '.ai'), { recursive: true });
  assert.strictEqual(findRoot(mid), path.join(mid, '.ai'));
});
check('returns null when no .ai/ above', () => {
  const d = tmp();
  assert.strictEqual(findRoot(d), null);
});
check('ignores a .ai FILE (must be a directory)', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, '.ai'), 'not a dir');
  assert.strictEqual(findRoot(d), null);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nROOT OK');
process.exit(failures ? 1 : 0);
