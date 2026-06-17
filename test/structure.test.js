// test/structure.test.js
'use strict';
const assert = require('assert');
const s = require('../src/lib/structure');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}

check('exports the 12 canonical folders', () => {
  assert.deepStrictEqual(
    [...s.FOLDERS].sort(),
    ['archive','audits','context','data','guidelines','knowledge',
     'lessons','notes','plans','runbooks','scripts','templates'].sort()
  );
});
check('optional extension folders', () => {
  assert.deepStrictEqual([...s.OPTIONAL_FOLDERS].sort(), ['agents','skills']);
});
check('project-bound folders', () => {
  assert.deepStrictEqual([...s.PROJECT_BOUND].sort(), ['audits','context','plans']);
});
check('isCanonical: canonical + optional true, junk false', () => {
  assert.strictEqual(s.isCanonical('knowledge'), true);
  assert.strictEqual(s.isCanonical('skills'), true);
  assert.strictEqual(s.isCanonical('_scratch'), false);
  assert.strictEqual(s.isCanonical('bogus'), false);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nSTRUCTURE OK');
process.exit(failures ? 1 : 0);
