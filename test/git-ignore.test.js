// test/git-ignore.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const gi = require('../src/lib/git-ignore');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-gi-'))); }
const g = (d, ...a) => execFileSync('git', a, { cwd: d, stdio: 'ignore' });

const d = tmp(); g(d, 'init', '-q');
const k = path.join(d, 'k'); fs.mkdirSync(path.join(k, 'drafts'), { recursive: true });
fs.writeFileSync(path.join(k, '.gitignore'), 'drafts/\nlocal.md\ntracked.md\n');
for (const f of ['local.md', 'a.md', 'tracked.md', 'README.md']) fs.writeFileSync(path.join(k, f), 'x\n');
g(d, 'add', '-f', 'k/tracked.md');

check('classify: ignored files and dirs, not tracked or plain untracked', () => {
  const r = gi.classify(k, ['drafts/', 'local.md', 'a.md', 'tracked.md']);
  assert.strictEqual(r.git, true);
  assert.deepStrictEqual([...r.ignored].sort(), ['drafts/', 'local.md']);
});
check('classify: nothing ignored -> empty set', () => {
  const r = gi.classify(k, ['a.md']);
  assert.strictEqual(r.git, true); assert.strictEqual(r.ignored.size, 0);
});
check('classify: empty names -> empty set without spawning check-ignore', () => {
  assert.strictEqual(gi.classify(k, []).ignored.size, 0);
});
check('classify: not a repo -> git:false with a reason', () => {
  const r = gi.classify(tmp(), ['a.md']);
  assert.strictEqual(r.git, false); assert.ok(r.reason);
});
check('publicIgnored: README ignored -> nothing treated as local', () => {
  const e = tmp(); g(e, 'init', '-q');
  fs.writeFileSync(path.join(e, '.gitignore'), '.ai/\n');
  const kk = path.join(e, '.ai', 'knowledge'); fs.mkdirSync(kk, { recursive: true });
  fs.writeFileSync(path.join(kk, 'README.md'), 'x\n'); fs.writeFileSync(path.join(kk, 'a.md'), 'x\n');
  const r = gi.publicIgnored(kk, ['a.md']);
  assert.strictEqual(r.ignored.size, 0); assert.strictEqual(r.note, null);
});
check('publicIgnored: no git -> empty set + note', () => {
  const r = gi.publicIgnored(tmp(), ['a.md']);
  assert.strictEqual(r.ignored.size, 0); assert.ok(r.note);
});
check('publicIgnored: normal repo -> ignored names', () => {
  assert.deepStrictEqual([...gi.publicIgnored(k, ['local.md', 'a.md']).ignored], ['local.md']);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nGIT-IGNORE OK');
process.exit(failures ? 1 : 0);
