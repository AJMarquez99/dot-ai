// test/prune.test.js
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
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-prune-'))); }
function scaffold(d) { execFileSync(process.execPath, [CLI, 'sync'], { cwd: d, stdio: 'ignore' }); }
function prune(cwd, args, now = '2026-06-14') {
  execFileSync(process.execPath, [CLI, 'prune', ...args],
    { cwd, stdio: 'ignore', env: { ...process.env, DOT_AI_NOW: now } });
}
const archiveDir = (d) => path.join(d, '.ai', 'archive');
function put(d, name) { fs.writeFileSync(path.join(archiveDir(d), name), 'x\n'); }
const exists = (...p) => fs.existsSync(path.join(...p));

function seed() {
  const d = tmp(); scaffold(d);
  put(d, '2026-03-14_old.md');     // 92 days old  -> prune
  put(d, '2026-03-16_edge89.md');  // 90 days old  -> keep (not strictly older than 90)
  put(d, '2026-03-15_edge91.md');  // 91 days old  -> prune
  put(d, '2026-06-10_fresh.md');   // 4 days old   -> keep
  put(d, '2026-01-01_keep_retain.md'); // very old but _retain -> keep
  put(d, 'undated-note.md');       // no date prefix -> ignore (keep)
  return d;
}

let d = seed();
check('prune dry-run (default) deletes nothing', () => {
  prune(d, []);
  assert.ok(exists(archiveDir(d), '2026-03-14_old.md'), 'old file must still exist after dry-run');
  assert.ok(exists(archiveDir(d), '2026-03-15_edge91.md'), 'edge91 must still exist after dry-run');
});

d = seed();
check('prune --force deletes >90d, keeps 90d/fresh/_retain/undated', () => {
  prune(d, ['--force']);
  assert.ok(!exists(archiveDir(d), '2026-03-14_old.md'), '92d -> pruned');
  assert.ok(!exists(archiveDir(d), '2026-03-15_edge91.md'), '91d -> pruned');
  assert.ok(exists(archiveDir(d), '2026-03-16_edge89.md'), '90d -> kept (boundary)');
  assert.ok(exists(archiveDir(d), '2026-06-10_fresh.md'), 'fresh -> kept');
  assert.ok(exists(archiveDir(d), '2026-01-01_keep_retain.md'), '_retain -> kept');
  assert.ok(exists(archiveDir(d), 'undated-note.md'), 'undated -> ignored/kept');
});

d = seed();
check('prune --force --days 3 prunes everything older than 3 days', () => {
  prune(d, ['--force', '--days', '3']);
  assert.ok(!exists(archiveDir(d), '2026-06-10_fresh.md'), '4d > 3 -> pruned');
  assert.ok(exists(archiveDir(d), '2026-01-01_keep_retain.md'), '_retain still kept');
});

d = seed();
check('prune never deletes archive/README.md', () => {
  prune(d, ['--force', '--days', '0']);
  assert.ok(exists(archiveDir(d), 'README.md'), 'README must survive');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nPRUNE OK');
process.exit(failures ? 1 : 0);
