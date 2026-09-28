// test/template.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fr = require('../src/lib/folder-readme');
const { FOLDERS, UNINDEXED } = require('../src/lib/structure');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
const TPL = path.join(__dirname, '..', 'template', '.ai');
const read = (...p) => fs.readFileSync(path.join(TPL, ...p), 'utf8');
const INDEX_HEADER = '## Index\n\n| File | Answers |\n|---|---|\n';

for (const f of FOLDERS) {
  check(`${f}/README.md opens with exactly one managed block`, () => {
    const t = read(f, 'README.md');
    assert.ok(t.startsWith(`${fr.FOLDER_BEGIN}\n# ${f}/\n`), 'must start with BEGIN marker then heading');
    assert.strictEqual(t.split(fr.FOLDER_BEGIN).length - 1, 1);
    assert.strictEqual(t.split(fr.FOLDER_END).length - 1, 1);
    assert.ok(fr.extractBlock(t).includes('**Loading:**'), 'block must state its loading tier');
    assert.ok(!t.includes('Auto-loaded at session start'), 'old wording must be gone');
  });
  check(`${f}/README.md has an index iff it is not UNINDEXED`, () => {
    assert.strictEqual(read(f, 'README.md').includes(INDEX_HEADER), !UNINDEXED.includes(f));
  });
  check(`pristine v1.0.0 ${f}/README.md migrates to exactly the new template`, () => {
    const legacy = fr.legacyText(f);
    assert.strictEqual(fr.planRefresh(legacy, read(f, 'README.md'), legacy).text, read(f, 'README.md'));
  });
}
check('templates/folder-README.md is a managed block plus an empty index', () => {
  const t = read('templates', 'folder-README.md');
  assert.ok(t.startsWith(fr.FOLDER_BEGIN));
  assert.ok(fr.extractBlock(t).includes('**Loading:**'));
  assert.ok(t.endsWith(`${fr.FOLDER_END}\n\n${INDEX_HEADER}`));
});
check('templates/README.md indexes folder-README.md', () => {
  assert.ok(read('templates', 'README.md').includes('| [folder-README.md](folder-README.md) |'));
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nTEMPLATE OK');
process.exit(failures ? 1 : 0);
