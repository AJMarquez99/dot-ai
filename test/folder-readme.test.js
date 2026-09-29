// test/folder-readme.test.js
'use strict';
const assert = require('assert');
const fr = require('../src/lib/folder-readme');
const { FOLDERS } = require('../src/lib/structure');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
const B = fr.FOLDER_BEGIN, E = fr.FOLDER_END;
const TPL = `${B}\n# knowledge/\n\nNEW convention text\n${E}\n\n## Index\n\n| File | Answers |\n|---|---|\n`;
const LEGACY = '# knowledge/\n\nOLD convention text\n';

check('extractBlock returns null when there are no markers', () => {
  assert.strictEqual(fr.extractBlock('# plain\n'), null);
});
check('extractBlock returns the block including markers', () => {
  assert.strictEqual(fr.extractBlock(`pre\n${B}\nx\n${E}\npost`), `${B}\nx\n${E}`);
});
check('stale block is replaced; content outside markers survives', () => {
  const cur = `${B}\nOLD\n${E}\n\n## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | mine |\n`;
  const r = fr.planRefresh(cur, TPL, LEGACY);
  assert.strictEqual(r.action, 'updated');
  assert.ok(r.text.includes('NEW convention text') && !r.text.includes('OLD'));
  assert.ok(r.text.includes('| [a.md](a.md) | mine |'), 'index row must survive');
  assert.strictEqual(r.text.split(B).length - 1, 1, 'exactly one block');
});
check('current block is left unchanged', () => {
  const cur = `${fr.extractBlock(TPL)}\n\nmine\n`;
  assert.strictEqual(fr.planRefresh(cur, TPL, LEGACY).action, 'unchanged');
});
check('pristine legacy README migrates to the full template', () => {
  const r = fr.planRefresh(LEGACY, TPL, LEGACY);
  assert.strictEqual(r.action, 'migrated');
  assert.strictEqual(r.text, TPL);
});
check('legacy README with appended content keeps the remainder after the block', () => {
  const r = fr.planRefresh(`${LEGACY}\n## In this folder\n\n- [a.md](a.md) — mine\n`, TPL, LEGACY);
  assert.strictEqual(r.action, 'migrated');
  assert.strictEqual(r.text, `${fr.extractBlock(TPL)}\n\n## In this folder\n\n- [a.md](a.md) — mine\n`);
});
check('CRLF legacy README still migrates', () => {
  assert.strictEqual(fr.planRefresh(LEGACY.replace(/\n/g, '\r\n'), TPL, LEGACY).action, 'migrated');
});
check('customized README without markers is left untouched', () => {
  const cur = '# knowledge/\n\nMy own intro.\n';
  const r = fr.planRefresh(cur, TPL, LEGACY);
  assert.strictEqual(r.action, 'customized');
  assert.strictEqual(r.text, cur);
});
check('no legacy text available -> customized, not migrated', () => {
  assert.strictEqual(fr.planRefresh(LEGACY, TPL, null).action, 'customized');
});
check('$ sequences in the template block are written literally', () => {
  const tpl = `${B}\ncost: $& and $1\n${E}\n`;
  const r = fr.planRefresh(`${B}\nOLD\n${E}\n`, tpl, null);
  assert.ok(r.text.includes('cost: $& and $1'), r.text);
});
check('a v1.0.0 legacy snapshot exists for every canonical folder', () => {
  for (const f of FOLDERS) {
    const t = fr.legacyText(f);
    assert.ok(t && t.startsWith(`# ${f}/`), `missing/odd legacy snapshot for ${f}`);
  }
  assert.strictEqual(fr.legacyText('nope'), null);
});

check('every duplicate managed block is refreshed and counted', () => {
  const cur = `${B}\nOLD1\n${E}\n\nmiddle keeps\n\n${B}\nOLD2\n${E}\n`;
  const r = fr.planRefresh(cur, TPL, LEGACY);
  assert.strictEqual(r.blocks, 2);
  assert.ok(!r.text.includes('OLD1') && !r.text.includes('OLD2'), r.text);
  assert.ok(r.text.includes('middle keeps'));
  assert.strictEqual(r.text.split(B).length - 1, 2, 'duplicates are refreshed, never deleted');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nFOLDER-README OK');
process.exit(failures ? 1 : 0);
