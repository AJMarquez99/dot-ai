// test/sync.test.js
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

// Folder README managed blocks.
const TPL_DIR = path.join(__dirname, '..', 'template', '.ai');
const tplReadme = (f) => fs.readFileSync(path.join(TPL_DIR, f, 'README.md'), 'utf8');
const legacyReadme = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'legacy-readmes', `${f}.md`), 'utf8');
const readme = (dir, f) => path.join(dir, '.ai', f, 'README.md');
const seed = (dir, f, text) => {
  fs.mkdirSync(path.join(dir, '.ai', f), { recursive: true });
  fs.writeFileSync(readme(dir, f), text);
};

d = tmp();
runSync(d);
check('fresh sync writes the current template READMEs', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'knowledge'), 'utf8'), tplReadme('knowledge'));
});

d = tmp();
seed(d, 'knowledge', legacyReadme('knowledge'));
runSync(d);
check('sync migrates a pristine v1.0.0 README to the managed template', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'knowledge'), 'utf8'), tplReadme('knowledge'));
});

d = tmp();
seed(d, 'knowledge', `${legacyReadme('knowledge')}\n## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | mine |\n`);
runSync(d);
check('migration keeps an existing index below the block', () => {
  const t = fs.readFileSync(readme(d, 'knowledge'), 'utf8');
  assert.ok(t.startsWith('<!-- BEGIN .ai-folder -->'), t);
  assert.ok(t.includes('| [a.md](a.md) | mine |'));
  assert.ok(!t.includes('Auto-loaded at session start'));
});

d = tmp();
runSync(d);
fs.writeFileSync(readme(d, 'guidelines'),
  fs.readFileSync(readme(d, 'guidelines'), 'utf8').replace('**Loading:**', 'STALE') + '| [g.md](g.md) | mine |\n');
runSync(d);
check('sync refreshes a stale block and keeps rows outside it', () => {
  const t = fs.readFileSync(readme(d, 'guidelines'), 'utf8');
  assert.ok(!t.includes('STALE') && t.includes('**Loading:**'));
  assert.ok(t.includes('| [g.md](g.md) | mine |'));
});

d = tmp();
const custom = '# guidelines/\n\nMy own intro — hand-written.\n';
seed(d, 'guidelines', custom);
const res = spawnSync(process.execPath, [CLI, 'sync'], { cwd: d, encoding: 'utf8' });
check('sync leaves a customized README untouched and reports it', () => {
  assert.strictEqual(res.status, 0, res.stderr);
  assert.strictEqual(fs.readFileSync(readme(d, 'guidelines'), 'utf8'), custom);
  assert.ok(res.stderr.includes('skip (customized README, no managed block)'), res.stderr);
});

d = tmp();
seed(d, 'guidelines', 'My banner\n\n<!-- BEGIN .ai-folder -->\nOLD\n<!-- END .ai-folder -->\n');
runSync(d);
check('sync refreshes a stale block preceded by user prose, keeping the prose', () => {
  const t = fs.readFileSync(readme(d, 'guidelines'), 'utf8');
  assert.ok(t.startsWith('My banner\n\n'), t);
  assert.ok(!t.includes('OLD'), t);
  assert.ok(t.includes('<!-- BEGIN .ai-folder -->'), t);
});

d = tmp();
seed(d, 'knowledge', legacyReadme('knowledge'));
runSync(d);
const snap = (dir) => fs.readdirSync(path.join(dir, '.ai')).filter((f) => fs.existsSync(readme(dir, f)))
  .map((f) => fs.readFileSync(readme(dir, f), 'utf8')).join('\0');
const first = snap(d);
runSync(d);
check('second sync is a no-op for READMEs (idempotent)', () => {
  assert.strictEqual(snap(d), first);
});

d = tmp();
seed(d, 'knowledge', legacyReadme('knowledge'));
runSync(d, ['--dry-run']);
check('sync --dry-run does not rewrite READMEs', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'knowledge'), 'utf8'), legacyReadme('knowledge'));
});

// #8: CRLF README with a stale block is refreshed and stays CRLF
d = tmp();
runSync(d);
const crlfStale = fs.readFileSync(readme(d, 'guidelines'), 'utf8').replace('**Loading:**', 'STALE').replace(/\n/g, '\r\n');
fs.writeFileSync(readme(d, 'guidelines'), crlfStale);
runSync(d);
check('sync refreshes a CRLF README and keeps CRLF', () => {
  const t = fs.readFileSync(readme(d, 'guidelines'), 'utf8');
  assert.ok(!t.includes('STALE') && t.includes('**Loading:**'));
  assert.ok(!/(^|[^\r])\n/.test(t), 'no bare LF may remain');
});
// Review focus: a current CRLF README is left byte-for-byte alone
d = tmp();
runSync(d);
const crlfCurrent = fs.readFileSync(readme(d, 'knowledge'), 'utf8').replace(/\n/g, '\r\n');
fs.writeFileSync(readme(d, 'knowledge'), crlfCurrent);
const resCrlf = spawnSync(process.execPath, [CLI, 'sync'], { cwd: d, encoding: 'utf8' });
check('sync leaves a current CRLF README untouched', () => {
  assert.strictEqual(fs.readFileSync(readme(d, 'knowledge'), 'utf8'), crlfCurrent);
  assert.ok(!/README block: \.ai\/knowledge/.test(resCrlf.stderr), resCrlf.stderr);
});
// #9: duplicate blocks → all refreshed + warning
d = tmp();
runSync(d);
const blk = fs.readFileSync(readme(d, 'notes'), 'utf8').match(/<!-- BEGIN \.ai-folder -->[\s\S]*?<!-- END \.ai-folder -->/)[0];
fs.writeFileSync(readme(d, 'notes'), `${blk.replace('**Loading:**', 'STALE')}\n\nmine\n\n${blk}\n`);
const resDup = spawnSync(process.execPath, [CLI, 'sync'], { cwd: d, encoding: 'utf8' });
check('sync refreshes duplicate blocks and warns', () => {
  const t = fs.readFileSync(readme(d, 'notes'), 'utf8');
  assert.ok(!t.includes('STALE') && t.includes('mine'));
  assert.ok(/warning: 2 managed blocks in .*notes\/README\.md/.test(resDup.stderr), resDup.stderr);
});

// #3 regression guard: block text with $-patterns is injected literally
d = tmp();
const wiring = require('../src/lib/wiring');
const cfg = path.join(d, 'CLAUDE.md');
fs.writeFileSync(cfg, '<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\n');
wiring.inject(cfg, '<!-- BEGIN .ai-convention -->\ncost $& and $1\n<!-- END .ai-convention -->', false);
check('inject writes $-patterns literally', () => {
  assert.ok(fs.readFileSync(cfg, 'utf8').includes('cost $& and $1'));
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nSYNC OK');
process.exit(failures ? 1 : 0);
