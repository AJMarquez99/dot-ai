// src/lib/markers.js
'use strict';

// The line-based BEGIN/END marker state machine shared by the convention block
// (wiring.inject) and folder READMEs (folder-readme). install.sh mirrors it in
// awk (block_ok + the replacer) — change both together.
//
// Records are split the way awk splits them (a trailing \n ends the last record).
// Each record is normalized: strip a trailing \r, strip a leading UTF-8 BOM on
// record 1 only, then trim spaces/tabs. A marker is a record that normalizes to
// exactly `begin`/`end`. Well-formed = at least one pair, none nested or unterminated.
const BOM = '﻿';

function records(text) {
  const recs = text.split('\n');
  if (text.endsWith('\n')) recs.pop();
  return recs;
}

function norm(rec, i) {
  let l = rec.replace(/\r$/, '');
  if (i === 0 && l.startsWith(BOM)) l = l.slice(BOM.length);
  return l.replace(/^[ \t]+|[ \t]+$/g, '');
}

function scanBlocks(text, begin, end) {
  const recs = records(text);
  let inb = false, n = 0, any = false;
  for (let i = 0; i < recs.length; i++) {
    const l = norm(recs[i], i);
    if (l === begin) {
      any = true;
      if (inb) return { status: 'malformed', blocks: n };
      inb = true;
    } else if (l === end) {
      any = true;
      if (!inb) return { status: 'malformed', blocks: n };
      inb = false; n++;
    }
  }
  if (!any) return { status: 'none', blocks: 0 };
  return inb ? { status: 'malformed', blocks: n } : { status: 'ok', blocks: n };
}

// Replace every well-formed pair (markers inclusive) with `block`'s lines. A BOM
// that sat on a replaced record 1 is kept as the output's first bytes.
function replaceBlocks(text, begin, end, block) {
  const scan = scanBlocks(text, begin, end);
  if (scan.status !== 'ok') return { status: scan.status, blocks: scan.blocks, text };
  const out = [];
  let skip = false;
  records(text).forEach((r, i) => {
    const l = norm(r, i);
    if (l === begin) {
      const lines = block.split('\n');
      if (i === 0 && r.startsWith(BOM)) lines[0] = BOM + lines[0];
      out.push(...lines);
      skip = true;
    } else if (l === end) {
      skip = false;
    } else if (!skip) {
      out.push(r);
    }
  });
  return { status: 'ok', blocks: scan.blocks, text: out.map((l) => `${l}\n`).join('') };
}

function extractBlock(text, begin, end) {
  const recs = records(text);
  let start = -1;
  for (let i = 0; i < recs.length; i++) {
    const l = norm(recs[i], i);
    if (start < 0 && l === begin) start = i;
    else if (start >= 0 && l === end) return [begin, ...recs.slice(start + 1, i), end].join('\n');
  }
  return null;
}

module.exports = { BOM, scanBlocks, replaceBlocks, extractBlock };
