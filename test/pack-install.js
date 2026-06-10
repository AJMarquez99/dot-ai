#!/usr/bin/env node
'use strict';
// Packs the package, installs the tarball as a real consumer would, runs the
// installed binary, and verifies the shipped ignore file survives npm's
// .gitignore -> .npmignore rename (regression guard; from-source tests miss this).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let fails = 0;
const ck = (n, c) => { console.log((c ? 'ok: ' : 'FAIL: ') + n); if (!c) fails++; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-pi-'));
function sh(cmd, args, opts) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

const packName = sh('npm', ['pack', '--silent'], { cwd: ROOT }).trim().split('\n').pop().trim();
const tgz = path.join(ROOT, packName);
try {
  const proj = tmp();
  sh('npm', ['init', '-y'], { cwd: proj });
  sh('npm', ['install', tgz], { cwd: proj });
  const pkgDir = path.join(proj, 'node_modules', '@ajmarquez99', 'dot-ai');
  const tdir = path.join(pkgDir, 'template', '.ai');
  ck('installed template ships gitignore (no dot)', fs.existsSync(path.join(tdir, 'gitignore')));
  ck('installed template has no mangled .npmignore', !fs.existsSync(path.join(tdir, '.npmignore')));
  const cli = path.join(pkgDir, 'bin', 'cli.js');
  sh(process.execPath, [cli, '--no-md'], { cwd: proj });
  const gi = path.join(proj, '.ai', '.gitignore');
  ck('installed binary writes .ai/.gitignore', fs.existsSync(gi));
  ck('.ai/.gitignore contains the _* rule', fs.existsSync(gi) && /(^|\n)_\*/.test(fs.readFileSync(gi, 'utf8')));
  ck('no undotted .ai/gitignore in project', !fs.existsSync(path.join(proj, '.ai', 'gitignore')));
  ck('no .ai/.npmignore in project', !fs.existsSync(path.join(proj, '.ai', '.npmignore')));
} finally {
  try { fs.unlinkSync(tgz); } catch (e) { /* ignore */ }
}
console.log(fails ? `\n${fails} FAILURE(S)` : '\nPACK-INSTALL OK');
process.exit(fails ? 1 : 0);
