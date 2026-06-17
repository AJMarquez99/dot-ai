// test/doctor.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-doc-'))); }
function scaffold(d) { execFileSync(process.execPath, [CLI, 'sync'], { cwd: d, stdio: 'ignore' }); }
function doctor(cwd) {
  try {
    const buf = execFileSync(process.execPath, [CLI, 'doctor'],
      { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    return { ok: true, stderr: buf ? buf.toString() : '' };
  } catch (e) { return { ok: false, stderr: (e.stderr || '').toString() }; }
}

let d = tmp(); scaffold(d);
check('doctor passes on a fresh scaffold (exit 0)', () => {
  const r = doctor(d);
  assert.ok(r.ok, `expected exit 0, got stderr:\n${r.stderr}`);
});

d = tmp(); scaffold(d);
fs.rmSync(path.join(d, '.ai', 'lessons'), { recursive: true, force: true });
check('doctor flags a missing folder (exit 1)', () => {
  const r = doctor(d);
  assert.ok(!r.ok, 'should exit non-zero');
  assert.ok(/lessons/.test(r.stderr), 'should name the missing folder');
});

d = tmp(); scaffold(d);
fs.writeFileSync(path.join(d, '.ai', '.gitignore'), '# no rule here\n');
check('doctor flags a .gitignore missing the _* rule', () => {
  const r = doctor(d);
  assert.ok(!r.ok, 'should exit non-zero');
  assert.ok(/_\*/.test(r.stderr), 'should mention the _* rule');
});

d = tmp(); scaffold(d);
fs.mkdirSync(path.join(d, '.ai', 'bogus'));
fs.writeFileSync(path.join(d, '.ai', 'bogus', 'README.md'), '# x\n');
check('doctor reports a stale non-canonical folder', () => {
  const r = doctor(d);
  assert.ok(!r.ok, 'should exit non-zero');
  assert.ok(/bogus/.test(r.stderr), 'should name the stale folder');
});

d = tmp();
check('doctor errors when no .ai/ exists', () => {
  const r = doctor(d);
  assert.ok(!r.ok, 'should exit non-zero');
});

// Cascade-aware: doctor mentions an ancestor .ai/ when one exists.
const home2 = tmp();
fs.mkdirSync(path.join(home2, '.ai'));
const proj2 = path.join(home2, 'proj');
fs.mkdirSync(proj2, { recursive: true });
execFileSync(process.execPath, [CLI, 'sync'], { cwd: proj2, stdio: 'ignore' });
check('doctor reports an ancestor .ai/ in the cascade', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [CLI, 'doctor'],
      { cwd: proj2, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: home2 } }).toString();
  } catch (e) { out = ((e.stdout || '') + (e.stderr || '')).toString(); }
  assert.ok(out.includes(path.join(home2, '.ai')), 'should mention the ancestor ~/.ai in the cascade');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nDOCTOR OK');
process.exit(failures ? 1 : 0);
