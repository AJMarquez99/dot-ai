// test/index.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const idx = require('../src/lib/index-section');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failures++; }
}
function tmp() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotai-idx-'))); }
function scaffold(d) { execFileSync(process.execPath, [CLI, 'sync'], { cwd: d, stdio: 'ignore' }); }
function index(cwd, args = []) {
  const r = spawnSync(process.execPath, [CLI, 'index', ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, err: r.stderr };
}
const K = (d, ...p) => path.join(d, '.ai', 'knowledge', ...p);
const put = (f, s = 'x\n') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = (f) => fs.readFileSync(f, 'utf8');

// --- table-style index, public/private split
let d = tmp(); scaffold(d);
put(K(d, 'arch.md')); put(K(d, 'design', 'README.md')); put(K(d, '_secret.md')); put(K(d, '.DS_Store'));
put(K(d, 'my notes.md'));
let r = index(d);
check('index exits 0', () => assert.strictEqual(r.code, 0, r.err));
check('adds a table row for an unlisted file', () => {
  assert.ok(read(K(d, 'README.md')).includes('| [arch.md](arch.md) | TODO: describe |'));
});
check('subfolders link to their README', () => {
  assert.ok(read(K(d, 'README.md')).includes('| [design/](design/README.md) | TODO: describe |'));
});
check('file names with spaces get an encoded link', () => {
  assert.ok(read(K(d, 'README.md')).includes('| [my notes.md](my%20notes.md) | TODO: describe |'));
});
check('_ files never land in README.md', () => assert.ok(!read(K(d, 'README.md')).includes('_secret')));
check('no _README.md is created without --private', () => assert.ok(!fs.existsSync(K(d, '_README.md'))));
check('hidden files are not indexed', () => assert.ok(!read(K(d, 'README.md')).includes('.DS_Store')));
check('rows land inside the ## Index table', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.indexOf('| File | Answers |') < t.indexOf('arch.md'));
});
check('re-running adds nothing (idempotent)', () => {
  const before = read(K(d, 'README.md')); index(d);
  assert.strictEqual(read(K(d, 'README.md')), before);
});
check('never alters an existing row', () => {
  const t = read(K(d, 'README.md'))
    .replace('| [arch.md](arch.md) | TODO: describe |', '| [arch.md](arch.md) | Hand-written. |');
  fs.writeFileSync(K(d, 'README.md'), t); index(d);
  assert.strictEqual(read(K(d, 'README.md')), t);
});

r = index(d, ['--private']);
check('--private creates _README.md holding only _ entries', () => {
  const t = read(K(d, '_README.md'));
  assert.ok(t.includes('| [_secret.md](_secret.md) | TODO: describe |'), t);
  assert.ok(!t.includes('arch.md'), 'public files stay out of _README.md');
});
put(K(d, '_more.md'));
index(d);
check('an existing _README.md receives new _ entries without --private', () => {
  assert.ok(read(K(d, '_README.md')).includes('_more.md'));
});

fs.writeFileSync(K(d, 'README.md'), `${read(K(d, 'README.md'))}| [gone.md](gone.md) | old |\n| \`_leak.md\` | oops |\n`);
r = index(d);
check('reports a stale entry without removing it', () => {
  assert.ok(r.err.includes('stale index entry: gone.md'), r.err);
  assert.ok(read(K(d, 'README.md')).includes('gone.md'));
});
check('reports a _ entry in the public index without removing it', () => {
  assert.ok(r.err.includes('private entry in public index: _leak.md'), r.err);
  assert.ok(read(K(d, 'README.md')).includes('_leak.md'));
});

// --- subdirectory cwd resolves the nearest .ai/
fs.mkdirSync(path.join(d, 'src', 'deep'), { recursive: true });
put(K(d, 'c.md'));
r = index(path.join(d, 'src', 'deep'));
check('works from a project subdirectory (nearest .ai/)', () => {
  assert.strictEqual(r.code, 0, r.err);
  assert.ok(read(K(d, 'README.md')).includes('[c.md](c.md)'));
});

// --- dry run
put(K(d, 'dry.md'));
const beforeDry = read(K(d, 'README.md'));
r = index(d, ['--dry-run']);
check('--dry-run writes nothing and says what it would do', () => {
  assert.strictEqual(read(K(d, 'README.md')), beforeDry);
  assert.ok(r.err.includes('would add'), r.err);
});

// --- context/ and archive/ skipped in a full run
put(path.join(d, '.ai', 'context', 'state.md'));
put(path.join(d, '.ai', 'archive', '2026-01-01_x.md'));
index(d);
check('context/ and archive/ are never indexed', () => {
  assert.ok(!read(path.join(d, '.ai', 'context', 'README.md')).includes('state.md'));
  assert.ok(!read(path.join(d, '.ai', 'archive', 'README.md')).includes('2026-01-01_x.md'));
});

// --- bullet style, followed by another section
d = tmp(); scaffold(d);
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\n## Index\n\n- [a.md](a.md) — first\n  continued line\n\n## Notes\n\nprose\n');
put(K(d, 'a.md')); put(K(d, 'b.md'));
index(d, ['knowledge']);
check('bullet-style index gets a bullet inside the Index section', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.includes('- [b.md](b.md) — TODO: describe'), t);
  assert.ok(t.indexOf('b.md') < t.indexOf('## Notes'), 'must not land in a later section');
  assert.ok(t.indexOf('continued line') < t.indexOf('[b.md]'), 'goes after the previous item, not inside it');
});

// --- README without an Index section / heading without a table / missing README
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\nIntro.\n');
index(d, ['knowledge']);
check('README without ## Index gets a table appended', () => {
  assert.ok(read(K(d, 'README.md')).endsWith(
    '## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | TODO: describe |\n| [b.md](b.md) | TODO: describe |\n'),
  read(K(d, 'README.md')));
});
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\n## Index\n\nNothing yet.\n');
index(d, ['knowledge']);
check('an Index heading with no entries gets a table under the heading', () => {
  assert.ok(read(K(d, 'README.md')).includes(
    '## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | TODO: describe |\n| [b.md](b.md) | TODO: describe |\n\nNothing yet.'),
  read(K(d, 'README.md')));
});
fs.rmSync(K(d, 'README.md'));
index(d, ['knowledge']);
check('a missing README is seeded from the template, then indexed', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.startsWith('<!-- BEGIN .ai-folder -->\n# knowledge/'), t);
  assert.ok(t.includes('| [a.md](a.md) | TODO: describe |'));
});

// --- errors
check('exit 2 when no .ai/ exists', () => assert.strictEqual(index(tmp()).code, 2));
check('exit 2 for an unknown folder', () => assert.strictEqual(index(d, ['nope']).code, 2));
check('exit 2 for context/ and archive/', () => {
  assert.strictEqual(index(d, ['context']).code, 2);
  assert.strictEqual(index(d, ['archive']).code, 2);
});
check('exit 2 for a path that escapes .ai/', () => {
  assert.strictEqual(index(d, ['../..']).code, 2);
  assert.strictEqual(index(d, [path.join(d, '.ai', 'knowledge')]).code, 2);
});
check('exit 2 for an unknown option', () => assert.strictEqual(index(d, ['--bogus']).code, 2));

// --- folder argument must be a single folder name (finding 1)
d = tmp(); scaffold(d);
put(K(d, 'design', 'x.md'));
{
  const topReadme = path.join(d, '.ai', 'README.md');
  const ctxReadme = path.join(d, '.ai', 'context', 'README.md');
  const knowReadme = K(d, 'README.md');
  const beforeTop = fs.existsSync(topReadme) ? read(topReadme) : null;
  const beforeCtx = read(ctxReadme);
  const beforeKnow = read(knowReadme);
  for (const bad of ['.', './context', 'context/foo', 'knowledge/design']) {
    check(`exit 2 and nothing written for folder arg "${bad}"`, () => {
      const r2 = index(d, [bad]);
      assert.strictEqual(r2.code, 2, r2.err);
      assert.ok(r2.err.includes(`folder must be a single folder name inside .ai/: ${bad}`), r2.err);
      assert.strictEqual(fs.existsSync(topReadme) ? read(topReadme) : null, beforeTop, 'top .ai/README.md unchanged');
      assert.strictEqual(read(ctxReadme), beforeCtx, '.ai/context/README.md unchanged');
      assert.strictEqual(read(knowReadme), beforeKnow, '.ai/knowledge/README.md unchanged');
      assert.ok(!fs.existsSync(path.join(d, '.ai', 'context', 'foo', 'README.md')), 'no .ai/context/foo/README.md');
      assert.ok(!fs.existsSync(K(d, 'design', 'README.md')), 'no .ai/knowledge/design/README.md');
    });
  }
}

// --- seeded README substitutes the real folder name for the template's literal <folder> (finding 4)
d = tmp(); scaffold(d);
fs.mkdirSync(path.join(d, '.ai', 'skills'), { recursive: true });
put(path.join(d, '.ai', 'skills', 'a.md'));
index(d, ['skills']);
check('seeding an optional folder with no own template substitutes its name in the heading', () => {
  const t = read(path.join(d, '.ai', 'skills', 'README.md'));
  assert.ok(t.startsWith('<!-- BEGIN .ai-folder -->\n# skills/'), t);
  assert.ok(!t.includes('<folder>'), t);
});

// --- ## Index heading with a suffix is recognized, never duplicated (finding 5)
d = tmp(); scaffold(d);
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\n## Index (hand-written)\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | mine |\n');
put(K(d, 'a.md')); put(K(d, 'b.md'));
index(d, ['knowledge']);
check('## Index with a suffix still gets rows added under it', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.includes('| [b.md](b.md) | TODO: describe |'), t);
});
check('## Index with a suffix never gets a second Index section', () => {
  const t = read(K(d, 'README.md'));
  assert.strictEqual((t.match(/^## Index/gm) || []).length, 1, t);
});
check('## Indexing is not mistaken for an Index heading', () => {
  assert.strictEqual(idx.findSection('## Indexing\n\nprose\n'), null);
});

// --- test gaps (finding 6)
d = tmp(); scaffold(d);
put(K(d, 'x.md')); put(K(d, '_y.md'));
index(d, ['--private']);
index(d, ['--private']);
check('_README.md stays idempotent across repeated --private runs', () => {
  const t = read(K(d, '_README.md'));
  assert.strictEqual((t.match(/^\| \[_y\.md\]/gm) || []).length, 1, t);
});

d = tmp(); scaffold(d);
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\n## Index\n| File | Answers |\n|---|---|\n| [a.md](a.md) | mine |\nSome trailing prose.\n');
put(K(d, 'a.md')); put(K(d, 'b.md'));
index(d, ['knowledge']);
check('a table followed by prose (no blank line) gets new rows before the prose, with a blank line between', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.includes('| [b.md](b.md) | TODO: describe |\n\nSome trailing prose.'), t);
});

d = tmp(); scaffold(d);
fs.rmSync(K(d, 'README.md'));
put(K(d, 'a.md'));
r = index(d, ['knowledge', '--dry-run']);
check('--dry-run on a missing README prints "would create" and creates nothing', () => {
  assert.strictEqual(r.code, 0, r.err);
  assert.ok(r.err.includes('would create'), r.err);
  assert.ok(!fs.existsSync(K(d, 'README.md')));
});

// --- #1: subfolder links point at a README only when one exists
check('addEntries links a README-less subfolder to the folder itself', () => {
  const t = idx.addEntries('# k/\n\n## Index\n\n| File | Answers |\n|---|---|\n', ['d/'], { hasReadme: () => false });
  assert.ok(t.includes('| [d/](d/) | TODO: describe |'), t);
});
check('addEntries links a subfolder with a README to its README', () => {
  const t = idx.addEntries('# k/\n\n## Index\n\n| File | Answers |\n|---|---|\n', ['d/'], { hasReadme: () => true });
  assert.ok(t.includes('| [d/](d/README.md) | TODO: describe |'), t);
});
d = tmp(); scaffold(d);
put(K(d, 'bare', 'x.md')); put(K(d, 'withreadme', 'README.md'));
index(d, ['knowledge']);
check('index links README-less subfolders as dir/ and others as dir/README.md', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.includes('| [bare/](bare/) | TODO: describe |'), t);
  assert.ok(t.includes('| [withreadme/](withreadme/README.md) | TODO: describe |'), t);
});
check('re-running index after dir/ links adds nothing', () => {
  const before = read(K(d, 'README.md')); index(d, ['knowledge']);
  assert.strictEqual(read(K(d, 'README.md')), before);
});

// --- #10: a row's entry may be a link outside the first column
check('a link in a later column counts as the row entry', () => {
  assert.deepStrictEqual(idx.listedRefs('## Index\n\n| Title | Link |\n|---|---|\n| Arch | [a.md](a.md) |\n'), ['a.md']);
});
check('backticked words in a description are not entries', () => {
  assert.deepStrictEqual(idx.listedRefs('## Index\n\n| File | Answers |\n|---|---|\n| [a.md](a.md) | see `b.md` |\n'), ['a.md']);
});
d = tmp(); scaffold(d);
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\n\n## Index\n\n| Title | Link |\n|---|---|\n| Arch | [a.md](a.md) |\n');
put(K(d, 'a.md'));
index(d, ['knowledge']);
check('index does not duplicate a row whose link is in column 2', () => {
  assert.strictEqual((read(K(d, 'README.md')).match(/a\.md\]/g) || []).length, 1, read(K(d, 'README.md')));
});

// --- #2: seeded READMEs never carry <…> template placeholders
const PLACEHOLDER_RE = /<the one question|<What belongs here|<neighbor>|<why it is different>/;
for (const opt of ['skills', 'agents']) {
  d = tmp(); scaffold(d);
  put(path.join(d, '.ai', opt, 'thing.md'));
  index(d, [opt]);
  check(`seeded ${opt}/README.md has a real Answers line and no placeholders`, () => {
    const t = read(path.join(d, '.ai', opt, 'README.md'));
    assert.ok(t.startsWith(`<!-- BEGIN .ai-folder -->\n# ${opt}/`), t);
    assert.ok(!PLACEHOLDER_RE.test(t), t);
    assert.ok(/\*\*Answers: what (codified workflows|agent definitions) exist\.\*\*/.test(t), t);
  });
  check(`re-running index on seeded ${opt}/ is idempotent`, () => {
    const before = read(path.join(d, '.ai', opt, 'README.md')); index(d, [opt]);
    assert.strictEqual(read(path.join(d, '.ai', opt, 'README.md')), before);
  });
}
d = tmp(); scaffold(d);
put(path.join(d, '.ai', 'design', 'x.md'));
index(d, ['design']);
check('seeded README for a user folder gets a generic Answers line with its name', () => {
  const t = read(path.join(d, '.ai', 'design', 'README.md'));
  assert.ok(t.includes('# design/'), t);
  assert.ok(t.includes('**Answers: design/ contents.**'), t);
  assert.ok(!PLACEHOLDER_RE.test(t), t);
});

// --- #8: CRLF indexes stay CRLF
d = tmp(); scaffold(d);
fs.writeFileSync(K(d, 'README.md'), '# knowledge/\r\n\r\n## Index\r\n\r\n| File | Answers |\r\n|---|---|\r\n');
put(K(d, 'a.md'));
index(d, ['knowledge']);
check('index preserves CRLF line endings when adding rows', () => {
  const t = read(K(d, 'README.md'));
  assert.ok(t.includes('| [a.md](a.md) | TODO: describe |\r\n'), JSON.stringify(t));
  assert.ok(!/(^|[^\r])\n/.test(t), 'no bare LF may remain');
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nINDEX OK');
process.exit(failures ? 1 : 0);
