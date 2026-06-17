// test/promote.test.js
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
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-prom-'))); }
function sync(cwd) { execFileSync(process.execPath, [CLI, 'sync'], { cwd, stdio: 'ignore' }); }
function promote(cwd, home, args) {
  try {
    const out = execFileSync(process.execPath, [CLI, 'promote', ...args],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: home } });
    return { ok: true, out: out.toString() };
  } catch (e) { return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).toString() }; }
}
const exists = (...p) => fs.existsSync(path.join(...p));

function setup() {
  const home = tmp();
  sync(home);                         // ~/.ai
  const proj = path.join(home, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  sync(proj);                         // proj/.ai
  return { home, proj };
}

let { home, proj } = setup();
fs.writeFileSync(path.join(proj, '.ai', 'guidelines', 'style.md'), '# style\n');
check('promote <file> global copies into ~/.ai matching folder (source kept)', () => {
  const r = promote(proj, home, ['.ai/guidelines/style.md', 'global']);
  assert.ok(r.ok, r.out);
  assert.ok(exists(home, '.ai', 'guidelines', 'style.md'), 'copied to ~/.ai/guidelines');
  assert.ok(exists(proj, '.ai', 'guidelines', 'style.md'), 'source must remain (copy default)');
});

({ home, proj } = setup());
fs.writeFileSync(path.join(proj, '.ai', 'knowledge', 'fact.md'), 'x\n');
check('promote --move removes the source', () => {
  const r = promote(proj, home, ['.ai/knowledge/fact.md', 'global', '--move']);
  assert.ok(r.ok, r.out);
  assert.ok(exists(home, '.ai', 'knowledge', 'fact.md'), 'moved to ~/.ai');
  assert.ok(!exists(proj, '.ai', 'knowledge', 'fact.md'), 'source removed');
});

({ home, proj } = setup());
fs.writeFileSync(path.join(proj, '.ai', 'guidelines', 'dup.md'), 'NEW\n');
fs.writeFileSync(path.join(home, '.ai', 'guidelines', 'dup.md'), 'OLD\n');
check('promote refuses to clobber without --overwrite', () => {
  const r = promote(proj, home, ['.ai/guidelines/dup.md', 'global']);
  assert.ok(!r.ok, 'should exit non-zero');
  assert.strictEqual(fs.readFileSync(path.join(home, '.ai', 'guidelines', 'dup.md'), 'utf8'), 'OLD\n');
});
check('promote --overwrite replaces the destination', () => {
  const r = promote(proj, home, ['.ai/guidelines/dup.md', 'global', '--overwrite']);
  assert.ok(r.ok, r.out);
  assert.strictEqual(fs.readFileSync(path.join(home, '.ai', 'guidelines', 'dup.md'), 'utf8'), 'NEW\n');
});

({ home, proj } = setup());
fs.writeFileSync(path.join(proj, '.ai', 'data', 'd.md'), 'x\n');
check('promote <file> up copies to the next broader layer', () => {
  const r = promote(proj, home, ['.ai/data/d.md', 'up']);
  assert.ok(r.ok, r.out);
  assert.ok(exists(home, '.ai', 'data', 'd.md'), 'up -> ~/.ai/data here');
});

({ home, proj } = setup());
fs.writeFileSync(path.join(home, '.ai', 'data', 'top.md'), 'x\n');
check('promote up errors at the outermost layer', () => {
  const r = promote(home, home, ['.ai/data/top.md', 'up']);
  assert.ok(!r.ok, 'should exit non-zero (nothing above)');
});

({ home, proj } = setup());
fs.writeFileSync(path.join(proj, '.ai', 'plans', 'p.md'), 'x\n');
check('promote warns when promoting a project-bound folder, but proceeds', () => {
  const r = promote(proj, home, ['.ai/plans/p.md', 'global']);
  assert.ok(r.ok, r.out);
  assert.ok(/plans|project-bound/i.test(r.out), 'should warn about the project-bound folder');
  assert.ok(exists(home, '.ai', 'plans', 'p.md'), 'still proceeds');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nPROMOTE OK');
process.exit(failures ? 1 : 0);
