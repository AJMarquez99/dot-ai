'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const markers = require('./markers');

const BEGIN = '<!-- BEGIN .ai-convention -->';
const END = '<!-- END .ai-convention -->';
const PLANS_DIR = '.ai/plans';

// Prefer $HOME so tests can redirect it; fall back to os.homedir() (Windows).
function homeDir() { return process.env.HOME || os.homedir(); }

// Replace every BEGIN/END pair via the shared line-based state machine (markers.js), which install.sh mirrors in awk — never a regex against raw text, so the two runners can't diverge on where a line boundary falls.
function inject(target, block, dry) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (cur !== null && cur.includes(BEGIN)) {
    const r = markers.replaceBlocks(cur, BEGIN, END, block);
    if (r.status !== 'ok') {
      console.error(`  warning: ${target} has an incomplete or malformed convention block — not modified`);
      return;
    }
    if (r.blocks > 1) console.error(`  warning: ${r.blocks} convention blocks in ${target} — remove the extras by hand`);
    if (r.text === cur) { console.error(`  unchanged: ${target}`); return; }
    if (dry) { console.error(`  would inject convention block -> ${target}`); return; }
    fs.writeFileSync(target, r.text);
    console.error(`  updated block in: ${target}`);
    return;
  }
  if (dry) { console.error(`  would inject convention block -> ${target}`); return; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (cur !== null) fs.writeFileSync(target, cur.replace(/\n?$/, '\n') + '\n' + block + '\n');
  else fs.writeFileSync(target, block + '\n');
  console.error(`  appended block to: ${target}`);
}

function globalConfigFile(tool) {
  if (tool === 'claude') return path.join(homeDir(), '.claude', 'CLAUDE.md');
  if (tool === 'gemini') return path.join(homeDir(), '.gemini', 'GEMINI.md');
  if (tool === 'codex') return path.join(process.env.CODEX_HOME || path.join(homeDir(), '.codex'), 'AGENTS.md');
  return null;
}

// True if a config file already carries the installer-written block (BEGIN marker).
function conventionInstalled(file) {
  if (!file || !fs.existsSync(file)) return false;
  return fs.readFileSync(file, 'utf8').includes(BEGIN);
}

function setDeep(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

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

module.exports = {
  BEGIN, END, PLANS_DIR, homeDir, inject,
  globalConfigFile, conventionInstalled, setDeep, mergeJsonSetting, writePlansSetting,
};
