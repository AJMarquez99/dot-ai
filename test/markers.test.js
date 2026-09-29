// test/markers.test.js
'use strict';
const assert = require('assert');
const m = require('../src/lib/markers');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
const B = '<!-- BEGIN x -->', E = '<!-- END x -->';
const NEW = `${B}\nNEW\n${E}`;

check('no markers -> none', () => {
  assert.deepStrictEqual(m.scanBlocks('# hi\n', B, E), { status: 'none', blocks: 0 });
  const r = m.replaceBlocks('# hi\n', B, E, NEW);
  assert.strictEqual(r.status, 'none'); assert.strictEqual(r.text, '# hi\n');
});
check('one block is replaced, surroundings kept', () => {
  const r = m.replaceBlocks(`pre\n${B}\nOLD\n${E}\npost\n`, B, E, NEW);
  assert.strictEqual(r.status, 'ok'); assert.strictEqual(r.blocks, 1);
  assert.strictEqual(r.text, `pre\n${NEW}\npost\n`);
});
check('output always ends each record with \\n (awk semantics)', () => {
  assert.strictEqual(m.replaceBlocks(`${B}\nOLD\n${E}`, B, E, NEW).text, `${NEW}\n`);
});
check('two blocks both replaced and counted', () => {
  const r = m.replaceBlocks(`${B}\n1\n${E}\nmid\n${B}\n2\n${E}\n`, B, E, NEW);
  assert.strictEqual(r.blocks, 2); assert.strictEqual(r.text, `${NEW}\nmid\n${NEW}\n`);
});
check('markers match after CR-strip and space/tab trim', () => {
  assert.strictEqual(m.scanBlocks(`  ${B}\t\r\nx\r\n${E} \r\n`, B, E).status, 'ok');
});
check('inline marker in prose is not a marker', () => {
  assert.strictEqual(m.scanBlocks(`see ${B} here\n`, B, E).status, 'none');
});
check('END before BEGIN is malformed', () => {
  assert.strictEqual(m.scanBlocks(`${E}\n${B}\n${E}\n`, B, E).status, 'malformed');
});
check('nested BEGIN is malformed', () => {
  assert.strictEqual(m.scanBlocks(`${B}\n${B}\n${E}\n`, B, E).status, 'malformed');
});
check('unterminated BEGIN is malformed and text untouched', () => {
  const t = `${B}\nx\n`;
  const r = m.replaceBlocks(t, B, E, NEW);
  assert.strictEqual(r.status, 'malformed'); assert.strictEqual(r.text, t);
});
check('BOM before BEGIN on record 1 is tolerated and preserved', () => {
  const r = m.replaceBlocks(`﻿${B}\nOLD\n${E}\n`, B, E, NEW);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.text, `﻿${NEW}\n`);
});
check('BOM then spaces before BEGIN on record 1 is tolerated', () => {
  assert.strictEqual(m.scanBlocks(`﻿  ${B}\nx\n${E}\n`, B, E).status, 'ok');
});
check('BOM before a marker on a later record is NOT tolerated', () => {
  assert.strictEqual(m.scanBlocks(`${B}\nx\n﻿${E}\n`, B, E).status, 'malformed');
});
check('BOM before a non-marker first line survives replacement', () => {
  const r = m.replaceBlocks(`﻿# t\n${B}\nOLD\n${E}\n`, B, E, NEW);
  assert.strictEqual(r.text, `﻿# t\n${NEW}\n`);
});
check('$ sequences in the block are literal', () => {
  assert.ok(m.replaceBlocks(`${B}\n${E}\n`, B, E, `${B}\n$& $1\n${E}`).text.includes('$& $1'));
});
check('extractBlock returns first block with canonical markers, or null', () => {
  assert.strictEqual(m.extractBlock(`pre\n  ${B}\nx\n${E}\npost`, B, E), `${B}\nx\n${E}`);
  assert.strictEqual(m.extractBlock('none\n', B, E), null);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nMARKERS OK');
process.exit(failures ? 1 : 0);
