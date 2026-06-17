// test/sync.test.js
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
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-sync-')); }
function runSync(cwd, args = []) {
  execFileSync(process.execPath, [CLI, 'sync', ...args], { cwd, stdio: 'ignore' });
}
const exists = (...p) => fs.existsSync(path.join(...p));

// Stale folder: non-manifest, only README/.gitignore -> removed.
let d = tmp();
runSync(d); // scaffold first
fs.mkdirSync(path.join(d, '.ai', 'oldfolder'));
fs.writeFileSync(path.join(d, '.ai', 'oldfolder', 'README.md'), '# old\n');
fs.writeFileSync(path.join(d, '.ai', 'oldfolder', '.gitignore'), '_*\n');
runSync(d);
check('removes stale folder with only README/.gitignore', () => {
  assert.ok(!exists(d, '.ai', 'oldfolder'), 'oldfolder should be gone');
});

// Folder with user content -> kept.
d = tmp();
runSync(d);
fs.mkdirSync(path.join(d, '.ai', 'oldfolder'));
fs.writeFileSync(path.join(d, '.ai', 'oldfolder', 'note.md'), 'real content\n');
runSync(d);
check('keeps non-manifest folder that has user content', () => {
  assert.ok(exists(d, '.ai', 'oldfolder', 'note.md'), 'user content must survive');
});

// _-prefixed folder -> never touched even if only README.
d = tmp();
runSync(d);
fs.mkdirSync(path.join(d, '.ai', '_scratch'));
fs.writeFileSync(path.join(d, '.ai', '_scratch', 'README.md'), '# mine\n');
runSync(d);
check('never removes a _-prefixed folder', () => {
  assert.ok(exists(d, '.ai', '_scratch'), '_scratch must survive');
});

// Manifest folder that happens to be empty -> kept (it's canonical).
d = tmp();
runSync(d);
runSync(d); // knowledge/ has only its README; must NOT be removed
check('keeps canonical folder (only README) ', () => {
  assert.ok(exists(d, '.ai', 'knowledge'), 'canonical knowledge/ must survive');
});

// Block resync: an existing convention block is rewritten to latest instructions.
d = tmp();
runSync(d);
fs.writeFileSync(path.join(d, 'CLAUDE.md'),
  '# mine\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\nKEEP-ME\n');
runSync(d);
check('resyncs an existing local convention block', () => {
  const txt = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  assert.ok(!txt.includes('OLD'), 'stale block body should be replaced');
  assert.ok(txt.includes('KEEP-ME'), 'content after END must survive');
  assert.ok(txt.match(/BEGIN \.ai-convention/g).length === 1, 'no duplicate block');
});

// Block resync does NOT touch a block-less file.
d = tmp();
runSync(d);
fs.writeFileSync(path.join(d, 'GEMINI.md'), '# just mine\nno block here\n');
const before = fs.readFileSync(path.join(d, 'GEMINI.md'), 'utf8');
runSync(d);
check('leaves block-less config untouched', () => {
  assert.strictEqual(fs.readFileSync(path.join(d, 'GEMINI.md'), 'utf8'), before);
});

// --global resyncs the home-dir block; without --global it is left alone.
d = tmp();
const gHome = tmp();
fs.mkdirSync(path.join(gHome, '.claude'), { recursive: true });
const claudeGlobal = path.join(gHome, '.claude', 'CLAUDE.md');
fs.writeFileSync(claudeGlobal, '# user\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\n');
execFileSync(process.execPath, [CLI, 'sync'], { cwd: d, stdio: 'ignore', env: { ...process.env, HOME: gHome } });
check('sync without --global leaves home block untouched', () => {
  assert.ok(fs.readFileSync(claudeGlobal, 'utf8').includes('OLD'), 'home block should be untouched');
});
execFileSync(process.execPath, [CLI, 'sync', '--global'], { cwd: d, stdio: 'ignore', env: { ...process.env, HOME: gHome } });
check('sync --global resyncs the home block', () => {
  const txt = fs.readFileSync(claudeGlobal, 'utf8');
  assert.ok(!txt.includes('OLD'), 'home block should be resynced');
  assert.ok(txt.match(/BEGIN \.ai-convention/g).length === 1, 'no duplicate');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nSYNC OK');
process.exit(failures ? 1 : 0);
