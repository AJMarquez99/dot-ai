#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const pkg = require('../package.json');

function usage() {
  console.log(`Usage: dot-ai [options]
  Install the .ai/ convention scaffold and optionally wire it into agent config.

Tool targets:
  --claude       Wire CLAUDE.md
  --gemini       Wire GEMINI.md
  --codex        Wire AGENTS.md
  --all          All of the above

Options:
  --global       Write the convention block to user-level config (~/.claude, ~/.gemini, ~/.codex)
  --no-md        Scaffold only: create .ai/ + READMEs, no MD or settings
  --no-plans     Don't set plansDirectory to .ai/plans
  --dry-run      Preview all changes without writing anything
  -h, --help     Show this help and exit
  -V, --version  Show version and exit

With no tool target and a TTY, you'll be prompted interactively.`);
}

const ROOT = path.join(__dirname, '..');
const BEGIN = '<!-- BEGIN .ai-convention -->';
const END = '<!-- END .ai-convention -->';

function copyTree(srcDir, destDir, dry) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    // npm renames any shipped `.gitignore` to `.npmignore` on install, so the
    // template ships ignore files as `gitignore` (no dot); restore the dot here.
    const destName = entry.name === 'gitignore' ? '.gitignore' : entry.name;
    const d = path.join(destDir, destName);
    if (entry.isDirectory()) {
      if (!dry) fs.mkdirSync(d, { recursive: true });
      copyTree(s, d, dry);
    } else if (fs.existsSync(d)) {
      console.error(`  skip (exists): ${path.relative(process.cwd(), d)}`);
    } else if (dry) {
      console.error(`  would add: ${path.relative(process.cwd(), d)}`);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      console.error(`  add: ${path.relative(process.cwd(), d)}`);
    }
  }
}

function inject(target, block, dry) {
  if (dry) { console.error(`  would inject convention block -> ${target}`); return; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const cur = fs.readFileSync(target, 'utf8');
    if (cur.includes(BEGIN)) {
      const re = new RegExp(`${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`);
      fs.writeFileSync(target, cur.replace(re, block));
      console.error(`  updated block in: ${target}`);
      return;
    }
    fs.writeFileSync(target, cur.replace(/\n?$/, '\n') + '\n' + block + '\n');
  } else {
    fs.writeFileSync(target, block + '\n');
  }
  console.error(`  appended block to: ${target}`);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Prefer $HOME so tests can redirect it; fall back to os.homedir() (Windows has no $HOME).
function homeDir() { return process.env.HOME || os.homedir(); }

// Set a (possibly nested, dot-delimited) key on an object, creating parents.
function setDeep(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

// Merge one key into a JSON settings file without clobbering existing keys.
function mergeJsonSetting(file, keyPath, value, dry) {
  if (dry) { console.error(`  would set ${keyPath}=${value} in: ${file}`); return; }
  let data = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { console.error(`  skip (invalid JSON): ${file}`); return; }
    }
  }
  setDeep(data, keyPath, value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.error(`  set ${keyPath}=${value} in: ${file}`);
}

const PLANS_DIR = '.ai/plans';

// Point each selected tool's plan-mode output at .ai/plans (local-scoped).
function writePlansSetting(want, dry) {
  if (want.claude) {
    mergeJsonSetting(path.join('.claude', 'settings.local.json'), 'plansDirectory', PLANS_DIR, dry);
  }
  if (want.gemini) {
    mergeJsonSetting(path.join('.gemini', 'settings.json'), 'general.plan.directory', PLANS_DIR, dry);
    if (!dry) {
      console.error(`  note: Gemini also needs a policy allowing writes to ${PLANS_DIR} —`);
      console.error('        add a rule under ~/.gemini/policies (not done automatically).');
    }
  }
  if (want.codex) {
    console.error('  note: Codex has no plans-directory setting; skipping.');
  }
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

async function main() {
  const args = process.argv.slice(2);
  const want = { claude: false, gemini: false, codex: false, global: false };
  let anyFlag = false;
  let noPlans = false;
  let noMd = false;
  let dryRun = false;
  if (args.includes('-h') || args.includes('--help')) { usage(); return; }
  if (args.includes('-V') || args.includes('--version')) { console.log(pkg.version); return; }
  for (const a of args) {
    if (a === '--all') { want.claude = want.gemini = want.codex = true; anyFlag = true; }
    else if (a === '--claude') { want.claude = true; anyFlag = true; }
    else if (a === '--gemini') { want.gemini = true; anyFlag = true; }
    else if (a === '--codex') { want.codex = true; anyFlag = true; }
    else if (a === '--global') { want.global = true; anyFlag = true; }
    else if (a === '--no-md') { noMd = true; anyFlag = true; }
    else if (a === '--no-plans') { noPlans = true; }
    else if (a === '--dry-run') { dryRun = true; }
    else if (a === '-h' || a === '--help' || a === '-V' || a === '--version') { /* handled above */ }
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }

  // --no-md means "no MD work"; pairing it with MD targets is a user error.
  if (noMd && (want.claude || want.gemini || want.codex || want.global)) {
    console.error('Error: --no-md cannot be combined with --claude/--gemini/--codex/--all/--global.');
    process.exit(2);
  }

  console.error('Installing .ai/ scaffold…');
  copyTree(path.join(ROOT, 'template', '.ai'), path.join(process.cwd(), '.ai'), dryRun);

  if (noMd) {
    console.error('Scaffold only (--no-md) — skipping agent config and settings.');
    console.error('Done.');
    return;
  }

  if (!anyFlag) {
    if (process.stdin.isTTY) {
      const ans = await ask(
        '\nWire the convention into which agent config files?\n' +
        '  [1] CLAUDE.md  [2] GEMINI.md  [3] AGENTS.md  [a] all  [n] none\n' +
        'Select (e.g. "1 3" or "a"): '
      );
      if (/a/i.test(ans)) { want.claude = want.gemini = want.codex = true; }
      if (/1/.test(ans)) want.claude = true;
      if (/2/.test(ans)) want.gemini = true;
      if (/3/.test(ans)) want.codex = true;
      if (want.claude || want.gemini || want.codex) {
        const g = await ask('\nWrite to local or global config? [l] local  [g] global: ');
        if (/^\s*g/i.test(g)) want.global = true;
      }
    } else {
      console.error('No tty and no flags — skipping agent wiring.');
      console.error('Re-run with --claude / --gemini / --codex / --all to wire config files.');
    }
  }

  // --global with no tool selected does nothing useful — tell the user.
  if (want.global && !want.claude && !want.gemini && !want.codex) {
    console.error('Note: --global has no effect without a tool flag (--claude/--gemini/--codex/--all).');
    console.error('Re-run with a tool flag to write to the global config.');
  }

  const mdTarget = (file, subdir) => want.global ? path.join(homeDir(), subdir, file) : file;
  const codexHome = () => process.env.CODEX_HOME || path.join(homeDir(), '.codex');
  const codexTarget = () => want.global ? path.join(codexHome(), 'AGENTS.md') : 'AGENTS.md';

  const instructions = fs.readFileSync(path.join(ROOT, 'agent-instructions.md'), 'utf8').trimEnd();
  const block = `${BEGIN}\n${instructions}\n${END}`;
  if (want.claude) inject(mdTarget('CLAUDE.md', '.claude'), block, dryRun);
  if (want.gemini) inject(mdTarget('GEMINI.md', '.gemini'), block, dryRun);
  if (want.codex)  inject(codexTarget(), block, dryRun);

  // Optionally point plan-mode output at .ai/plans for each selected tool.
  let wantPlans;
  if (noPlans) wantPlans = false;
  else if (!anyFlag && process.stdin.isTTY && (want.claude || want.gemini || want.codex)) {
    const a = await ask('\nAlso set plansDirectory to .ai/plans in local settings? [Y/n]: ');
    wantPlans = !/^\s*n/i.test(a);
  } else {
    wantPlans = true; // default-yes for flagged / non-interactive runs (use --no-plans to skip)
  }
  if (wantPlans && (want.claude || want.gemini || want.codex)) writePlansSetting(want, dryRun);

  console.error('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
