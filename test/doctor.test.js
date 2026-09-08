// test/doctor.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

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
  const res = spawnSync(process.execPath, [CLI, 'doctor'],
    { cwd: proj2, encoding: 'utf8', env: { ...process.env, HOME: home2 } });
  const out = (res.stdout || '') + (res.stderr || '');
  assert.ok(out.includes(path.join(home2, '.ai')), 'should mention the ancestor ~/.ai in the cascade');
});

// --- _* rule: verified against git, not read from a file ---------------------
function gitInit(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
}
// doctor() above returns execFileSync's stdout, which is 'ignore' — so it cannot
// observe stderr on a success exit. These checks assert on notes printed when
// doctor passes, so they need the stream captured either way.
function doctorErr(cwd) {
  const r = spawnSync(process.execPath, [CLI, 'doctor'], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, stderr: (r.stderr || '') + (r.stdout || '') };
}

d = tmp(); scaffold(d);
check('doctor reports a non-repo as a state, not a failure (exit 0)', () => {
  const r = doctorErr(d);
  assert.ok(r.ok, `expected exit 0 outside a repo, got:\n${r.stderr}`);
  assert.ok(/not a git repository/.test(r.stderr), 'should say the _* rule is inert here');
});

d = tmp(); gitInit(d); scaffold(d);
check('doctor verifies the _* rule is actually in force inside a repo', () => {
  const r = doctorErr(d);
  assert.ok(r.ok, `expected exit 0, got:\n${r.stderr}`);
  assert.ok(/verified in force/.test(r.stderr), 'should confirm git ignores _-prefixed paths');
});

d = tmp(); gitInit(d); scaffold(d);
fs.rmSync(path.join(d, '.ai', '.gitignore'));
check('doctor flags a _* rule that is not in force', () => {
  const r = doctor(d);
  assert.ok(!r.ok, 'should exit non-zero');
  assert.ok(/NOT in force/.test(r.stderr), 'should report the rule as not in force, not merely missing');
});

d = tmp(); gitInit(d); scaffold(d);
fs.writeFileSync(path.join(d, '.ai', 'knowledge', '_secret.md'), 'token\n');
execFileSync('git', ['add', '-f', '.ai/knowledge/_secret.md'], { cwd: d, stdio: 'ignore' });
check('doctor flags a force-added _-prefixed path that git already tracks', () => {
  const r = doctor(d);
  assert.ok(!r.ok, 'should exit non-zero');
  assert.ok(/already tracked/.test(r.stderr), 'should name the tracked _-prefixed path');
  assert.ok(/_secret\.md/.test(r.stderr), 'should name the file');
  assert.ok(/git rm --cached/.test(r.stderr), 'should hint the git-side fix');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nDOCTOR OK');
process.exit(failures ? 1 : 0);
