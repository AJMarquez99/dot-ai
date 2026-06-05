#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const BEGIN = '<!-- BEGIN .ai-convention -->';
const END = '<!-- END .ai-convention -->';

function copyTree(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else if (fs.existsSync(d)) {
      console.error(`  skip (exists): ${path.relative(process.cwd(), d)}`);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      console.error(`  add: ${path.relative(process.cwd(), d)}`);
    }
  }
}

function inject(target, block) {
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

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

async function main() {
  const args = process.argv.slice(2);
  const want = { claude: false, gemini: false, codex: false };
  let anyFlag = false;
  for (const a of args) {
    if (a === '--all') { want.claude = want.gemini = want.codex = true; anyFlag = true; }
    else if (a === '--claude') { want.claude = true; anyFlag = true; }
    else if (a === '--gemini') { want.gemini = true; anyFlag = true; }
    else if (a === '--codex') { want.codex = true; anyFlag = true; }
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }

  console.error('Installing .ai/ scaffold…');
  copyTree(path.join(ROOT, 'template', '.ai'), path.join(process.cwd(), '.ai'));

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
    } else {
      console.error('No tty and no flags — skipping agent wiring.');
      console.error('Re-run with --claude / --gemini / --codex / --all to wire config files.');
    }
  }

  const instructions = fs.readFileSync(path.join(ROOT, 'agent-instructions.md'), 'utf8').trimEnd();
  const block = `${BEGIN}\n${instructions}\n${END}`;
  if (want.claude) inject('CLAUDE.md', block);
  if (want.gemini) inject('GEMINI.md', block);
  if (want.codex) inject('AGENTS.md', block);
  console.error('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
