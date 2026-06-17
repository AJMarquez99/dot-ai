// test/dates.test.js
'use strict';
const assert = require('assert');
const d = require('../src/lib/dates');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}

check('today() honors DOT_AI_NOW', () => {
  process.env.DOT_AI_NOW = '2026-06-14';
  assert.strictEqual(d.today(), '2026-06-14');
  delete process.env.DOT_AI_NOW;
});
check('today() rejects malformed DOT_AI_NOW', () => {
  process.env.DOT_AI_NOW = '06/14/2026';
  assert.throws(() => d.today(), /YYYY-MM-DD/);
  delete process.env.DOT_AI_NOW;
});
check('today() without override is an ISO date', () => {
  assert.match(d.today(), /^\d{4}-\d{2}-\d{2}$/);
});
check('daysBetween counts calendar days', () => {
  assert.strictEqual(d.daysBetween('2026-06-14', '2026-03-16'), 90);
  assert.strictEqual(d.daysBetween('2026-03-16', '2026-06-14'), -90);
  assert.strictEqual(d.daysBetween('2026-06-14', '2026-06-14'), 0);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nDATES OK');
process.exit(failures ? 1 : 0);
