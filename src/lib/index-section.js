// src/lib/index-section.js
'use strict';
const fs = require('fs');

// A folder's "## Index" section in its README: a `| File | Answers |` table (the
// standard) or, in hand-written READMEs, a bullet list. We only ever ADD entries.
const HEADING_RE = /^## Index[ \t]*$/m;
const SEP_RE = /^\|[\s:|-]+$/;
const LINK_RE = /\]\(([^)\s]+)\)/;
const TICK_RE = /`([^`]+)`/;
const TABLE_HEADER = '| File | Answers |\n|---|---|';
const PLACEHOLDER = 'TODO: describe';
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

function refOf(s) {
  const m = s.match(LINK_RE) || s.match(TICK_RE);
  return m ? normalizeRef(m[1]) : null;
}

// Style ('table' | 'bullets' | 'empty') and the entry each row/bullet names.
// Table header rows (the row above a separator) and separators are skipped.
function parseSection(body) {
  const lines = body.split('\n');
  const refs = [];
  let style = 'empty';
  lines.forEach((line, i) => {
    if (line.startsWith('|')) {
      style = 'table';
      if (SEP_RE.test(line.trim()) || SEP_RE.test((lines[i + 1] || '').trim())) return;
      const r = refOf(line.split('|')[1] || '');
      if (r) refs.push(r);
    } else if (/^[-*] /.test(line)) {
      if (style === 'empty') style = 'bullets';
      const r = refOf(line);
      if (r) refs.push(r);
    }
  });
  return { style, refs };
}

function listedRefs(text) {
  const sec = findSection(text);
  return sec ? parseSection(text.slice(sec.bodyStart, sec.end)).refs : [];
}

function row(name, style) {
  const target = (name.endsWith('/') ? `${name}README.md` : name).replace(/ /g, '%20');
  const link = `[${name}](${target})`;
  return style === 'bullets' ? `- ${link} — ${PLACEHOLDER}` : `| ${link} | ${PLACEHOLDER} |`;
}

// Add placeholder entries for `names`, matching the section's style. Creates the
// section (as a table) if absent. Never touches existing entries.
function addEntries(text, names) {
  if (names.length === 0) return text;
  const sec = findSection(text);
  if (!sec) {
    const rows = names.map((n) => row(n, 'table')).join('\n');
    return `${text.replace(/\s*$/, '')}\n\n## Index\n\n${TABLE_HEADER}\n${rows}\n`;
  }
  const lines = text.slice(sec.bodyStart, sec.end).split('\n');
  const { style } = parseSection(lines.join('\n'));
  let at = 0; // insert after lines[at]; lines[0] is the rest of the heading line
  let block;
  if (style === 'empty') {
    block = ['', TABLE_HEADER, ...names.map((n) => row(n, 'table'))];
  } else {
    const isEntry = style === 'table' ? (l) => l.startsWith('|') : (l) => /^[-*] /.test(l);
    lines.forEach((l, i) => { if (isEntry(l)) at = i; });
    if (style === 'bullets') while (at + 1 < lines.length && /^\s+\S/.test(lines[at + 1])) at++;
    block = names.map((n) => row(n, style));
  }
  if (at + 1 < lines.length && lines[at + 1].trim() !== '') block.push('');
  lines.splice(at + 1, 0, ...block);
  return text.slice(0, sec.bodyStart) + lines.join('\n') + text.slice(sec.end);
}

function privateSeed() {
  return '# Private index\n\nLocal-only — gitignored by the `_*` rule. Indexes this folder\'s `_` files so they\n' +
    'never appear in the committed `README.md`.\n\n## Index\n\n' + TABLE_HEADER + '\n';
}

module.exports = { TABLE_HEADER, PLACEHOLDER, listEntries, findSection, parseSection, listedRefs, addEntries, privateSeed };
