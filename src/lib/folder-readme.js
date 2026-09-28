// src/lib/folder-readme.js
'use strict';
const fs = require('fs');
const path = require('path');
const { escapeRe } = require('./wiring');

// Folder READMEs = a convention-managed block (refreshed by `sync`) + user-owned
// remainder (the ## Index and any project prose). Same idea as the .ai-convention
// block in CLAUDE.md, with its own markers.
const FOLDER_BEGIN = '<!-- BEGIN .ai-folder -->';
const FOLDER_END = '<!-- END .ai-folder -->';
const BLOCK_RE = new RegExp(`${escapeRe(FOLDER_BEGIN)}[\\s\\S]*?${escapeRe(FOLDER_END)}`);
const LEGACY_DIR = path.join(__dirname, 'legacy-readmes');

const lf = (s) => s.replace(/\r\n/g, '\n');

// The managed block (markers included) in `text`, or null.
function extractBlock(text) {
  const m = lf(text).match(BLOCK_RE);
  return m ? m[0] : null;
}

// The v1.0.0 README shipped for `folder` (the only migration source), or null.
function legacyText(folder) {
  const f = path.join(LEGACY_DIR, `${folder}.md`);
  return fs.existsSync(f) ? lf(fs.readFileSync(f, 'utf8')) : null;
}

// Pure: decide how a README should change. Never guesses — a block-less README is
// migrated only when it starts with the exact legacy text; anything else is left alone.
function planRefresh(current, template, legacy) {
  const cur = lf(current);
  const tpl = lf(template);
  const block = extractBlock(tpl);
  if (!block) throw new Error('template README has no .ai-folder block');
  if (extractBlock(cur) !== null) {
    const next = cur.replace(BLOCK_RE, () => block); // fn: no $-pattern expansion
    return { action: next === cur ? 'unchanged' : 'updated', text: next };
  }
  if (legacy && cur.startsWith(legacy)) {
    const rest = cur.slice(legacy.length).trim();
    return { action: 'migrated', text: rest ? `${block}\n\n${rest}\n` : tpl };
  }
  return { action: 'customized', text: cur };
}

// Apply planRefresh to a README on disk. Returns the action (or 'missing').
function refreshReadme(readmePath, templatePath, folder, dry) {
  if (!fs.existsSync(readmePath)) return 'missing';
  const { action, text } = planRefresh(
    fs.readFileSync(readmePath, 'utf8'), fs.readFileSync(templatePath, 'utf8'), legacyText(folder));
  const rel = path.relative(process.cwd(), readmePath);
  if (action === 'customized') {
    console.error(`  skip (customized README, no managed block): ${rel}`);
  } else if (action !== 'unchanged') {
    const verb = action === 'migrated' ? 'migrate' : 'update';
    if (dry) { console.error(`  would ${verb} README block: ${rel}`); return action; }
    fs.writeFileSync(readmePath, text);
    console.error(`  ${action} README block: ${rel}`);
  }
  return action;
}

module.exports = { FOLDER_BEGIN, FOLDER_END, extractBlock, legacyText, planRefresh, refreshReadme };
