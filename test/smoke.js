#!/usr/bin/env node
'use strict';
// Cross-platform smoke test for bin/cli.js — the path npx and Windows users hit
// (install.sh / the sh harness can't run natively on Windows). Verifies the core
// behaviors via filesystem effects + stdout, with zero external tools.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
const PKG = require('../package.json');
let failures = 0;

function check(name, cond) {
  if (cond) { console.log(`ok: ${name}`); }
  else { console.error(`FAIL: ${name}`); failures++; }
}

// Run cli.js; returns { ok, stdout }. Never throws (non-zero exit -> ok:false).
function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts,
    });
    return { ok: true, stdout };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').toString() };
  }
}

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-')); }
const exists = (...p) => fs.existsSync(path.join(...p));

// --version prints the package version to stdout, exit 0.
const v = run(['--version']);
check('--version matches package.json', v.ok && v.stdout.trim() === PKG.version);

// --help prints usage to stdout, exit 0.
const h = run(['--help']);
check('--help shows usage', h.ok && /Usage: dot-ai/.test(h.stdout));

// --no-md scaffolds .ai/ and writes no MD.
let d = tmp();
check('--no-md exits 0', run(['--no-md'], { cwd: d }).ok);
check('--no-md creates .ai/README.md', exists(d, '.ai', 'README.md'));
check('--no-md ships .ai/.gitignore', exists(d, '.ai', '.gitignore'));
check('--no-md writes no CLAUDE.md', !exists(d, 'CLAUDE.md'));

// --dry-run writes nothing at all.
d = tmp();
check('--dry-run exits 0', run(['--all', '--dry-run'], { cwd: d }).ok);
check('--dry-run creates no .ai', !exists(d, '.ai'));
check('--dry-run creates no CLAUDE.md', !exists(d, 'CLAUDE.md'));
check('--dry-run creates no .claude', !exists(d, '.claude'));

// --global writes the block to the HOME config, not a local file.
d = tmp();
const home = tmp();
const g = run(['--claude', '--global', '--no-plans'], { cwd: d, env: { ...process.env, HOME: home } });
check('--global exits 0', g.ok);
check('--global writes ~/.claude/CLAUDE.md', exists(home, '.claude', 'CLAUDE.md'));
check('--global writes no local CLAUDE.md', !exists(d, 'CLAUDE.md'));

// --codex --global honors $CODEX_HOME (the Windows path where HOME is unset).
d = tmp();
const ch = tmp();
const cx = run(['--codex', '--global', '--no-plans'], {
  cwd: d, env: { ...process.env, HOME: home, CODEX_HOME: ch },
});
check('--codex --global exits 0', cx.ok);
check('--codex --global writes $CODEX_HOME/AGENTS.md', exists(ch, 'AGENTS.md'));
check('--codex --global writes no local AGENTS.md', !exists(d, 'AGENTS.md'));

// Unknown option exits non-zero.
check('unknown option fails', !run(['--nope'], { cwd: tmp() }).ok);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nSMOKE OK');
process.exit(failures ? 1 : 0);
