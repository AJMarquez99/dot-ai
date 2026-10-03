// src/lib/git-ignore.js
'use strict';
const { spawnSync } = require('child_process');

// Run git, tolerating its absence. status null means git could not be executed.
function git(args, cwd, input) {
  // C locale: git translates its messages, and doctor matches one.
  const r = spawnSync('git', args, {
    cwd, encoding: 'utf8', input, env: { ...process.env, LC_ALL: 'C', LANGUAGE: 'C' },
  });
  if (r.error) return { ok: false, status: null, out: '', err: '' };
  return { ok: true, status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// Which of `names` (relative to `dir`; dirs may end in '/') does git ignore?
// One check-ignore spawn. Tracked paths are never reported (a force-added file is
// shareable). Returns { git: false, reason } when git can't answer.
function classify(dir, names) {
  const inside = git(['rev-parse', '--is-inside-work-tree'], dir);
  if (!inside.ok) return { git: false, reason: 'git could not be run' };
  if (inside.status !== 0) return { git: false, reason: 'not a git work tree (or git failed)' };
  if (inside.out !== 'true') return { git: false, reason: 'not a git work tree' };
  if (names.length === 0) return { git: true, ignored: new Set() };
  const r = git(['check-ignore', '-z', '--stdin'], dir, `${names.join('\0')}\0`);
  if (r.status === 1) return { git: true, ignored: new Set() };
  if (r.status !== 0) return { git: false, reason: `git check-ignore failed${r.err ? `: ${r.err.split('\n')[0]}` : ''}` };
  return { git: true, ignored: new Set(r.out.split('\0').filter(Boolean)) };
}

// The ignored subset of a folder's public candidates, for index rows. If the
// folder's README.md is itself ignored (e.g. the whole .ai/ is gitignored), the
// index is never shared, so nothing needs a name-only row.
function publicIgnored(dir, names) {
  const c = classify(dir, [...names, 'README.md']);
  if (!c.git) return { ignored: new Set(), note: c.reason };
  if (c.ignored.has('README.md')) return { ignored: new Set(), note: null };
  return { ignored: c.ignored, note: null };
}

module.exports = { git, classify, publicIgnored };
