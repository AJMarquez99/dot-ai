#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_AI = path.join(ROOT, 'template', '.ai');
const INSTRUCTIONS = path.join(ROOT, 'agent-instructions.md');

const wiring = require('../src/lib/wiring');
const initCmd = require('../src/commands/init');
const wireCmd = require('../src/commands/wire');
const syncCmd = require('../src/commands/sync');

const SUBCOMMANDS = new Set(['init', 'wire', 'sync']);

function usage() {
  console.log(`Usage: dot-ai [command] [options]

Commands:
  init           Scaffold .ai/ and optionally wire agent config (default)
  wire           Inject/update the convention block into agent config only
  sync           Re-apply the latest .ai/ scaffold (additive; reconciles in a later release)

Tool targets (init/wire):
  --claude       Wire CLAUDE.md
  --gemini       Wire GEMINI.md
  --codex        Wire AGENTS.md
  --all          All of the above

Options:
  --global       Write the convention block to user-level config (~/.claude, ~/.gemini, ~/.codex)
  --no-md        (init) Scaffold only: create .ai/ + READMEs, no MD or settings
  --no-plans     Don't set plansDirectory to .ai/plans
  --dry-run      Preview all changes without writing anything
  -h, --help     Show this help and exit
  -V, --version  Show version and exit

With no command and a TTY, runs 'init' interactively.`);
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

// Parse the shared flag set used by init/wire (and ignored extras for sync).
function parseFlags(args) {
  const want = { claude: false, gemini: false, codex: false, global: false };
  let anyFlag = false, noPlans = false, noMd = false, dryRun = false;
  for (const a of args) {
    if (a === '--all') { want.claude = want.gemini = want.codex = true; anyFlag = true; }
    else if (a === '--claude') { want.claude = true; anyFlag = true; }
    else if (a === '--gemini') { want.gemini = true; anyFlag = true; }
    else if (a === '--codex') { want.codex = true; anyFlag = true; }
    else if (a === '--global') { want.global = true; anyFlag = true; }
    else if (a === '--no-md') { noMd = true; anyFlag = true; }
    else if (a === '--no-plans') { noPlans = true; }
    else if (a === '--dry-run') { dryRun = true; }
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }
  return { want, anyFlag, noPlans, noMd, dryRun };
}

// Interactive tool/scope selection (only when no tool flags were given on a TTY).
async function promptForWiring(want) {
  const global = {
    claude: wiring.conventionInstalled(wiring.globalConfigFile('claude')),
    gemini: wiring.conventionInstalled(wiring.globalConfigFile('gemini')),
    codex: wiring.conventionInstalled(wiring.globalConfigFile('codex')),
  };
  const tag = (t) => (global[t] ? ' (already global)' : '');
  if (global.claude || global.gemini || global.codex) {
    console.error('\nTools marked "(already global)" already load the convention from your user config —');
    console.error('local wiring is only needed to commit it into a shared/public repo.');
  }
  const ans = await ask(
    '\nWire the convention into which agent config files?\n' +
    `  [1] CLAUDE.md${tag('claude')}  [2] GEMINI.md${tag('gemini')}  [3] AGENTS.md${tag('codex')}  [a] all  [n] none\n` +
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
}

async function runInit(args) {
  const { want, anyFlag, noPlans, noMd, dryRun } = parseFlags(args);

  if (noMd && (want.claude || want.gemini || want.codex || want.global)) {
    console.error('Error: --no-md cannot be combined with --claude/--gemini/--codex/--all/--global.');
    process.exit(2);
  }

  // Interactive wiring selection when no tool flags and a TTY.
  if (!anyFlag && !noMd && process.stdin.isTTY) {
    await promptForWiring(want);
  } else if (!anyFlag && !noMd) {
    console.error('No tty and no flags — scaffolding only; re-run with --claude/--gemini/--codex/--all to wire config.');
  }

  if (want.global && !want.claude && !want.gemini && !want.codex) {
    console.error('Note: --global has no effect without a tool flag (--claude/--gemini/--codex/--all).');
  }

  // Plans setting: default-yes for flagged/non-interactive; prompt on interactive.
  let wantPlans;
  if (noPlans) wantPlans = false;
  else if (!anyFlag && process.stdin.isTTY && (want.claude || want.gemini || want.codex)) {
    const a = await ask('\nAlso set plansDirectory to .ai/plans in local settings? [Y/n]: ');
    wantPlans = !/^\s*n/i.test(a);
  } else wantPlans = true;

  initCmd.run({
    cwd: process.cwd(), templateAiDir: TEMPLATE_AI, instructionsPath: INSTRUCTIONS,
    dry: dryRun, noMd, want, wantPlans,
  });
}

async function runWire(args) {
  const { want, anyFlag, noPlans, dryRun } = parseFlags(args);
  if (!want.claude && !want.gemini && !want.codex) {
    if (process.stdin.isTTY) await promptForWiring(want);
    if (!want.claude && !want.gemini && !want.codex) {
      console.error('wire: nothing to do — pass --claude/--gemini/--codex/--all.');
      process.exit(2);
    }
  }
  const wantPlans = !noPlans;
  wireCmd.run({
    want, instructionsPath: INSTRUCTIONS, dry: dryRun, wantPlans,
  });
  console.error('Done.');
}

async function runSync(args) {
  let dryRun = false;
  for (const a of args) {
    if (a === '--dry-run') dryRun = true;
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }
  syncCmd.run({ cwd: process.cwd(), templateAiDir: TEMPLATE_AI, dry: dryRun });
  console.error('Done.');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) { usage(); return; }
  if (argv.includes('-V') || argv.includes('--version')) { console.log(pkg.version); return; }

  // First non-flag token is the subcommand, if present.
  const first = argv[0];
  if (first && SUBCOMMANDS.has(first)) {
    const rest = argv.slice(1);
    if (first === 'init') return runInit(rest);
    if (first === 'wire') return runWire(rest);
    if (first === 'sync') return runSync(rest);
  }
  if (first && !first.startsWith('-')) {
    console.error(`Unknown command: ${first}`);
    process.exit(2);
  }
  // No subcommand: legacy/bare behavior → init.
  return runInit(argv);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
} else {
  // Preserve the module API the tests depend on.
  module.exports = {
    conventionInstalled: wiring.conventionInstalled,
    globalConfigFile: wiring.globalConfigFile,
  };
}
