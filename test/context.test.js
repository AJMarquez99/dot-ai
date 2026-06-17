// test/context.test.js
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
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-ctx-'))); }
function context(cwd, home, sub = 'context') {
  try {
    const out = execFileSync(process.execPath, [CLI, sub],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: home } });
    return { ok: true, out: out.toString() };
  } catch (e) { return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).toString() }; }
}

const home = tmp();
fs.mkdirSync(path.join(home, '.ai'));
const proj = path.join(home, 'proj');
fs.mkdirSync(path.join(proj, '.ai'), { recursive: true });

check('context lists the chain (exit 0)', () => {
  const r = context(proj, home);
  assert.ok(r.ok, r.out);
  assert.ok(r.out.includes(path.join(home, '.ai')), 'should list ~/.ai');
  assert.ok(r.out.includes(path.join(proj, '.ai')), 'should list project .ai');
  assert.ok(r.out.indexOf(path.join(home, '.ai')) < r.out.indexOf(path.join(proj, '.ai')),
    'broad (~/.ai) should be listed before specific (project)');
});

check('resolve is an alias for context', () => {
  const r = context(proj, home, 'resolve');
  assert.ok(r.ok && r.out.includes(path.join(proj, '.ai')), r.out);
});

check('context errors when no .ai/ exists', () => {
  const empty = tmp();
  const r = context(empty, empty);
  assert.ok(!r.ok, 'should exit non-zero when no .ai/ found');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nCONTEXT OK');
process.exit(failures ? 1 : 0);
