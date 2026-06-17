// test/archive.test.js
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
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-arch-'))); }
function scaffold(d) { execFileSync(process.execPath, [CLI, 'sync'], { cwd: d, stdio: 'ignore' }); }
function archive(cwd, args, now = '2026-06-14') {
  try {
    execFileSync(process.execPath, [CLI, 'archive', ...args],
      { cwd, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, DOT_AI_NOW: now } });
    return { ok: true };
  } catch (e) { return { ok: false, stderr: (e.stderr || '').toString() }; }
}
const exists = (...p) => fs.existsSync(path.join(...p));

let d = tmp(); scaffold(d);
fs.writeFileSync(path.join(d, '.ai', 'plans', 'old.md'), '# old plan\n');
check('archive moves the file with a date prefix', () => {
  const r = archive(d, ['.ai/plans/old.md']);
  assert.ok(r.ok, r.stderr);
  assert.ok(exists(d, '.ai', 'archive', '2026-06-14_old.md'), 'dated file should exist in archive/');
  assert.ok(!exists(d, '.ai', 'plans', 'old.md'), 'source should be gone');
});

d = tmp(); scaffold(d);
fs.writeFileSync(path.join(d, '.ai', 'plans', 'keep.md'), 'x\n');
check('archive --retain inserts _retain before the extension', () => {
  const r = archive(d, ['.ai/plans/keep.md', '--retain']);
  assert.ok(r.ok, r.stderr);
  assert.ok(exists(d, '.ai', 'archive', '2026-06-14_keep_retain.md'), 'retained name expected');
});

d = tmp(); scaffold(d);
fs.writeFileSync(path.join(d, '.ai', 'plans', 'dry.md'), 'x\n');
check('archive --dry-run writes nothing', () => {
  const r = archive(d, ['.ai/plans/dry.md', '--dry-run']);
  assert.ok(r.ok, r.stderr);
  assert.ok(exists(d, '.ai', 'plans', 'dry.md'), 'source must remain');
  assert.ok(!exists(d, '.ai', 'archive', '2026-06-14_dry.md'), 'nothing archived');
});

d = tmp(); scaffold(d);
fs.writeFileSync(path.join(d, '.ai', 'plans', '2026-01-01_already.md'), 'x\n');
check('archive refuses an already-dated file', () => {
  const r = archive(d, ['.ai/plans/2026-01-01_already.md']);
  assert.ok(!r.ok, 'should exit non-zero');
});

d = tmp(); scaffold(d);
fs.writeFileSync(path.join(d, 'outside.md'), 'x\n');
check('archive refuses a path outside .ai/', () => {
  const r = archive(d, ['outside.md']);
  assert.ok(!r.ok, 'should exit non-zero');
});

d = tmp(); scaffold(d);
check('archive refuses a missing file', () => {
  const r = archive(d, ['.ai/plans/nope.md']);
  assert.ok(!r.ok, 'should exit non-zero');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nARCHIVE OK');
process.exit(failures ? 1 : 0);
