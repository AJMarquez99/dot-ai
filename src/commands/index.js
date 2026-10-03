// src/commands/index.js
'use strict';
const fs = require('fs');
const path = require('path');
const { findRoot } = require('../lib/root');
const { FOLDERS, OPTIONAL_FOLDERS, UNINDEXED, FOLDER_ANSWERS } = require('../lib/structure');
const idx = require('../lib/index-section');
const { publicIgnored } = require('../lib/git-ignore');

// Report private / stale / gitignored-link entries, then add rows for unlisted `entries`.
function updateIndexFile(dir, file, seed, entries, ignored, publicFile, dry) {
  const rel = path.relative(process.cwd(), file);
  const exists = fs.existsSync(file);
  const raw = exists ? fs.readFileSync(file, 'utf8') : seed;
  const crlf = /\r\n/.test(raw); // write back with the file's own line endings
  const cur = raw.replace(/\r\n/g, '\n');
  const a = idx.auditIndex({
    text: cur, entries, ignored, isPublic: publicFile,
    exists: (top) => fs.existsSync(path.join(dir, top)),
  });
  for (const r of a.privateEntries) console.error(`  private entry in public index: ${r} (${rel})`);
  for (const r of a.stale) console.error(`  stale index entry: ${r} (${rel})`);
  for (const r of a.linkedIgnored) console.error(`  linked entry is gitignored: ${r} (${rel}) — make it a name-only (local) row`);
  const { missing } = a;
  if (exists && missing.length === 0) return;
  const next = idx.addEntries(cur, missing, {
    hasReadme: (n) => fs.existsSync(path.join(dir, n, 'README.md')),
    isLocal: (n) => ignored.has(n),
  });
  const what = exists ? `add ${missing.length} index row(s) to` : `create (${missing.length} row(s))`;
  if (dry) { console.error(`  would ${what}: ${rel}`); return; }
  fs.writeFileSync(file, crlf ? next.replace(/\n/g, '\r\n') : next);
  console.error(`  ${exists ? `added ${missing.length} index row(s) to` : `created (${missing.length} row(s))`}: ${rel}`);
}

// Fill the generic folder-README template for `name`: heading plus a real Answers
// paragraph, so no <…> placeholder text ever reaches a user's file.
function seedFolderReadme(tpl, name) {
  const answers = FOLDER_ANSWERS[name]
    || `**Answers: ${name}/ contents.** Describe this folder's purpose here.`;
  return tpl.replace('# <folder>/', `# ${name}/`).replace(/\*\*Answers:[\s\S]*?\n\n/, () => `${answers}\n\n`);
}

function indexFolder(aiDir, name, templateAiDir, opts, state) {
  const dir = path.join(aiDir, name);
  const { pub, priv } = idx.listEntries(dir);
  const own = path.join(templateAiDir, name, 'README.md');
  const usingOwn = fs.existsSync(own);
  const seedPath = usingOwn ? own : path.join(templateAiDir, 'templates', 'folder-README.md');
  let seed = fs.readFileSync(seedPath, 'utf8').replace(/\r\n/g, '\n');
  if (!usingOwn) seed = seedFolderReadme(seed, name);
  const pubGit = publicIgnored(dir, pub);
  if (pubGit.note && !state.gitNoted) {
    console.error(`  note: git status unavailable (${pubGit.note}) — gitignored files are indexed as links`);
    state.gitNoted = true;
  }
  updateIndexFile(dir, path.join(dir, 'README.md'), seed, pub, pubGit.ignored, true, opts.dry);
  const privFile = path.join(dir, '_README.md');
  if (opts.private || fs.existsSync(privFile)) {
    updateIndexFile(dir, privFile, idx.privateSeed(), priv, new Set(), false, opts.dry);
  }
}

function fail(msg) { console.error(`index: ${msg}`); process.exit(2); }

// opts: { cwd, templateAiDir, folder, private, dry }
function run(opts) {
  const aiDir = findRoot(opts.cwd);
  if (!aiDir) fail('no .ai/ directory found at or above the current directory.');
  let names;
  if (opts.folder) {
    const f = opts.folder.replace(/[\\/]+$/, '');
    if (f === '' || f === '.' || /[\\/]/.test(f) || f.split(/[\\/]/).includes('..')) {
      fail(`folder must be a single folder name inside .ai/: ${opts.folder}`);
    }
    if (UNINDEXED.includes(f)) fail(`${f}/ is not indexed (disposable or date-stamped).`);
    const full = path.join(aiDir, f);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) fail(`no such folder: ${f}/`);
    names = [f];
  } else {
    names = [...FOLDERS, ...OPTIONAL_FOLDERS]
      .filter((f) => !UNINDEXED.includes(f) && fs.existsSync(path.join(aiDir, f)));
  }
  console.error(`Indexing ${aiDir}…`);
  const state = { gitNoted: false }; // one git-unavailable note per run
  for (const n of names) indexFolder(aiDir, n, opts.templateAiDir, opts, state);
}

module.exports = { run };
