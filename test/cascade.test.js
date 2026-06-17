// test/cascade.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cascadeChain } = require('../src/lib/cascade');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-casc-'))); }
const ORIG_HOME = process.env.HOME;
function withHome(h, fn) { process.env.HOME = h; try { return fn(); } finally { process.env.HOME = ORIG_HOME; } }

check('chain is nearest-first up to and including ~/.ai', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, '.ai'));
  const proj = path.join(home, 'work', 'proj');
  fs.mkdirSync(path.join(proj, '.ai'), { recursive: true });
  const sub = path.join(proj, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  withHome(home, () => {
    assert.deepStrictEqual(cascadeChain(sub), [path.join(proj, '.ai'), path.join(home, '.ai')]);
  });
});

check('omits layers that have no .ai/', () => {
  const home = tmp();              // no ~/.ai here
  const proj = path.join(home, 'p');
  fs.mkdirSync(path.join(proj, '.ai'), { recursive: true });
  withHome(home, () => {
    assert.deepStrictEqual(cascadeChain(proj), [path.join(proj, '.ai')]);
  });
});

check('stops at home (nothing above ~ is collected)', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, '.ai'));
  withHome(home, () => {
    assert.deepStrictEqual(cascadeChain(home), [path.join(home, '.ai')]);
  });
});

check('empty when no .ai/ anywhere up to home', () => {
  const home = tmp();
  const proj = path.join(home, 'p');
  fs.mkdirSync(proj, { recursive: true });
  withHome(home, () => { assert.deepStrictEqual(cascadeChain(proj), []); });
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nCASCADE OK');
process.exit(failures ? 1 : 0);
