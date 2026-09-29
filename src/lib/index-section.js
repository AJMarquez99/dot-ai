// src/lib/index-section.js
'use strict';
const fs = require('fs');

// A folder's "## Index" section in its README: a `| File | Answers |` table (the
// standard) or, in hand-written READMEs, a bullet list. We only ever ADD entries.
const HEADING_RE = /^## Index\b.*$/m;
const SEP_RE = /^\|[\s:|-]+$/;
const LINK_RE = /\]\(([^)\s]+)\)/;
const TICK_RE = /`([^`]+)`/;
const TABLE_HEADER = '| File | Answers |\n|---|---|';
const PLACEHOLDER = 'TODO: describe';
const LOCAL_MARK = '(local)';
const LOCAL_CELL_RE = /^\s*`[^`]+`\s*\(local\)\s*$/;
const LOCAL_BULLET_RE = /^[-*] `[^`]+`\s*\(local\)/;
const SKIP = new Set(['README.md', '_README.md']);

// Top-level entries of a folder split by visibility; dirs carry a trailing '/'.
// Hidden entries (.gitignore, .DS_Store, …) are never indexed.
function listEntries(dir) {
  const pub = [], priv = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const name = e.isDirectory() ? `${e.name}/` : e.name;
    (e.name.startsWith('_') ? priv : pub).push(name);
  }
  return { pub: pub.sort(), priv: priv.sort() };
}

// Offsets of the Index section: heading start, body start (after the heading
// text), and end (next "## " heading or EOF). null if absent.
function findSection(text) {
  const m = HEADING_RE.exec(text);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const next = text.slice(bodyStart).search(/^## /m);
  return { start: m.index, bodyStart, end: next === -1 ? text.length : bodyStart + next };
}

function normalizeRef(ref) {
  let r = ref.replace(/^\.\//, '').replace(/#.*$/, '');
  try { r = decodeURIComponent(r); } catch { /* keep as written */ }
  if (r.endsWith('/README.md')) r = r.slice(0, -'README.md'.length);
  return r;
}

// Style ('table' | 'bullets' | 'empty') and the entry each row/bullet names.
// Table header rows (the row above a separator) and separators are skipped.
function parseSection(body) {
  const lines = body.split('\n');
  const refs = [], entries = [];
  let style = 'empty';
  const add = (ref, local, linked, line) => {
    refs.push(ref);
    entries.push({ ref, local, linked, todo: line.includes(PLACEHOLDER) });
  };
  lines.forEach((line, i) => {
    if (line.startsWith('|')) {
      style = 'table';
      if (SEP_RE.test(line.trim()) || SEP_RE.test((lines[i + 1] || '').trim())) return;
      // Entry = first column's link/backticked name; else the first link anywhere in
      // the row. Backticks outside column 1 are description text, never entries.
      const col1 = line.split('|')[1] || '';
      const c1 = col1.match(LINK_RE) || col1.match(TICK_RE);
      const lm = line.match(LINK_RE);
      if (c1) add(normalizeRef(c1[1]), LOCAL_CELL_RE.test(col1), LINK_RE.test(col1), line);
      else if (lm) add(normalizeRef(lm[1]), false, true, line);
    } else if (/^[-*] /.test(line)) {
      if (style === 'empty') style = 'bullets';
      const lk = line.match(LINK_RE);
      const m = lk || line.match(TICK_RE);
      if (m) add(normalizeRef(m[1]), LOCAL_BULLET_RE.test(line), Boolean(lk), line);
    }
  });
  return { style, refs, entries };
}

function listedRefs(text) {
  const sec = findSection(text);
  return sec ? parseSection(text.slice(sec.bodyStart, sec.end)).refs : [];
}

function row(name, style, hasReadme, local) {
  if (local) {
    const cell = `\`${name}\` ${LOCAL_MARK}`;
    return style === 'bullets' ? `- ${cell} — ${PLACEHOLDER}` : `| ${cell} | ${PLACEHOLDER} |`;
  }
  const dirLink = hasReadme(name) ? `${name}README.md` : name;
  const target = (name.endsWith('/') ? dirLink : name).replace(/ /g, '%20');
  const link = `[${name}](${target})`;
  return style === 'bullets' ? `- ${link} — ${PLACEHOLDER}` : `| ${link} | ${PLACEHOLDER} |`;
}

// Add placeholder entries for `names`, matching the section's style. Creates the
// section (as a table) if absent. Never touches existing entries.
function addEntries(text, names, opts = {}) {
  const hasReadme = opts.hasReadme || (() => true);
  const isLocal = opts.isLocal || (() => false);
  if (names.length === 0) return text;
  const sec = findSection(text);
  if (!sec) {
    const rows = names.map((n) => row(n, 'table', hasReadme, isLocal(n))).join('\n');
    return `${text.replace(/\s*$/, '')}\n\n## Index\n\n${TABLE_HEADER}\n${rows}\n`;
  }
  const lines = text.slice(sec.bodyStart, sec.end).split('\n');
  const { style } = parseSection(lines.join('\n'));
  let at = 0; // insert after lines[at]; lines[0] is the rest of the heading line
  let block;
  if (style === 'empty') {
    block = ['', TABLE_HEADER, ...names.map((n) => row(n, 'table', hasReadme, isLocal(n)))];
  } else {
    const isEntry = style === 'table' ? (l) => l.startsWith('|') : (l) => /^[-*] /.test(l);
    lines.forEach((l, i) => { if (isEntry(l)) at = i; });
    if (style === 'bullets') while (at + 1 < lines.length && /^\s+\S/.test(lines[at + 1])) at++;
    block = names.map((n) => row(n, style, hasReadme, isLocal(n)));
  }
  if (at + 1 < lines.length && lines[at + 1].trim() !== '') block.push('');
  lines.splice(at + 1, 0, ...block);
  return text.slice(0, sec.bodyStart) + lines.join('\n') + text.slice(sec.end);
}

function privateSeed() {
  return '# Private index\n\nLocal-only — gitignored by the `_*` rule. Indexes this folder\'s `_` files so they\n' +
    'never appear in the committed `README.md`.\n\n## Index\n\n' + TABLE_HEADER + '\n';
}

const topOf = (ref) => ref.replace(/\/+$/, '').split('/')[0];

// Findings for one index file, shared by `index` (reports) and `doctor` (checks).
// Pure: filesystem and git answers are injected.
function auditIndex({ text, entries, exists, ignored, isPublic }) {
  const sec = findSection(text);
  const listed = sec ? parseSection(text.slice(sec.bodyStart, sec.end)).entries : [];
  const out = { privateEntries: [], stale: [], linkedIgnored: [], missing: [], todo: 0 };
  for (const e of listed) {
    if (e.todo) out.todo++;
    const top = topOf(e.ref);
    if (e.ref.includes('://') || !top) continue;
    if (isPublic && top.startsWith('_')) out.privateEntries.push(e.ref);
    else if (!e.local && !exists(top)) out.stale.push(e.ref);
    else if (isPublic && e.linked && (ignored.has(top) || ignored.has(`${top}/`))) out.linkedIgnored.push(e.ref);
  }
  const have = new Set(listed.map((e) => topOf(e.ref)));
  out.missing = entries.filter((n) => !have.has(topOf(n)));
  return out;
}

module.exports = {
  TABLE_HEADER, PLACEHOLDER, LOCAL_MARK, listEntries, findSection, parseSection, listedRefs, addEntries,
  privateSeed, topOf, auditIndex,
};
