# npm packaging gotchas — save the next maintainer a day

These are the packaging truths that aren't obvious from the source and that a from-source test run
will happily lie to you about. Each one cost real debugging; they're written down so it costs you
five minutes instead. The mechanics they reference live in
[`installer-internals.md`](./installer-internals.md); the design rationale is in
[`architecture.md`](./architecture.md).

## 1. npm renames `.gitignore` → `.npmignore` — at pack AND install

This is the big one. npm treats `.gitignore` specially: when you `npm pack` (or `npm publish`), any
`.gitignore` in the package is **renamed to `.npmignore`** in the tarball. And then again when a
consumer runs `npm install`, npm applies its ignore handling, so a `.gitignore` you ship simply does
not arrive as `.gitignore`.

For a tool whose entire job is to *deliver a `.gitignore`* into someone's project, that's fatal — and
worse, it's invisible from the repo. The symptom:

> Running the installer from a clone works perfectly. `npx @ajmarquez99/dot-ai` silently ships a
> project without the `.ai/.gitignore` (the file that implements the `_*` local-file convention and
> the `context/` ignore). No error — the file just isn't there.

**The fix, in two parts:**

1. The template ships its ignore files **undotted**, as `gitignore` (and `context/gitignore`).
   npm doesn't touch `gitignore`, so it survives pack and install intact.
2. Both installers **rename `gitignore` → `.gitignore` on copy** into the target project (see
   [`installer-internals.md`](./installer-internals.md#scaffold-copy--non-clobber-and-the-gitignore-rename)).

**Guards that keep this from regressing:**

- `template_ignore_naming_case` in [`../../test/install_test.sh`](../../test/install_test.sh): the
  template must contain **no** dotted `.gitignore`/`.npmignore`, and the undotted `gitignore` files
  must exist. This catches someone "helpfully" re-dotting the template.
- [`../../test/pack-install.js`](../../test/pack-install.js): the *only* test that catches the real
  failure, because it does an actual `npm pack` + `npm install` and inspects the installed tree —
  asserting the installed template ships `gitignore` (not `.npmignore`), and the installed binary
  then writes a real `.ai/.gitignore` with the `_*` rule and no leaked undotted file.

If you ever see "works from source, broken via npx," suspect npm ignore-mangling first.

## 2. Scoped packages need `publishConfig.access: public`

The package is published under a scope: `@ajmarquez99/dot-ai` ([`../../package.json`](../../package.json)).
npm defaults scoped packages to **restricted** (private), so `npm publish` on a scoped name fails (or
publishes privately) unless you say otherwise. `package.json` declares
`publishConfig: { access: "public" }` to make `npm publish` produce a public package without needing
`--access public` on the command line. Don't remove it, and remember it if you fork under a different
scope.

## 3. The Node-14 floor is a hand-maintained contract, not a tested one

`package.json` declares `engines: { node: ">=14" }`, but CI only runs Node **18 and 20** (see
[`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml)). Nothing in the pipeline actually
executes the code on Node 14. So the floor holds only as long as humans keep it: `bin/cli.js` uses
**only APIs available at Node 14**, and that's verified by review, not by tests.

Practical consequence: when you add code to `cli.js`, do a quick **API-version audit** of anything
that smells recent — newer `fs` options, `structuredClone`, `Array.prototype.at`, `Object.hasOwn`,
top-level features, etc. A test passing on Node 20 tells you nothing about Node 14. Either keep the
floor honestly or raise `engines` deliberately (and update this note); don't let it drift by
accident. The existing code is conservative on purpose — it sticks to long-stable `fs`/`path`/`os`/
`readline` built-ins.

## 4. LF line endings are locked on the executables

[`../../.gitattributes`](../../.gitattributes) pins `bin/cli.js` and `*.sh` to `text eol=lf`. A
contributor on Windows with `core.autocrlf=true` would otherwise commit CRLF line endings, and a
**published binary with a CRLF shebang (`#!/usr/bin/env node\r`) breaks on Unix** — the kernel tries
to exec an interpreter named `node\r`. Pinning LF makes the shebang survive regardless of anyone's
local git config. Leave these rules in place; if you add another shell script or executable, add it
to `.gitattributes` too.

## 5. The `files` allowlist controls what ships

`package.json` `files` is an explicit allowlist: `bin/`, `template/`, `agent-instructions.md`,
`SPEC.md`, `LICENSE`, `README.md`. Anything not listed (the `test/` dir, `install.sh`, `.ai/`, the
workflow) is **not** in the published tarball. Two things to keep in mind:

- `agent-instructions.md` is listed because `cli.js` reads it at runtime to build the injected block —
  it's not just docs, it's a required asset. If you split or rename it, update `files` and the read
  path in both installers.
- `install.sh` is intentionally **absent** from the npm package: the shell path is for `curl`, the
  npm path is for `cli.js`. They don't ship together.

## The meta-lesson: verify the packaged artifact, not just from-source

Every gotcha above shares one root cause — **from-source runs and the published artifact are not the
same thing.** The repo on disk has a real `.gitignore`, full line-ending freedom, and whatever Node
you happen to run; the tarball a user installs has been through npm's pack transform, ignore
handling, and the `files` filter. The bugs that bite users live in that gap.

So the rule is: **a green from-source suite is necessary but not sufficient.** Before trusting a
release, run the real round-trip — `npm run pack-test` (i.e. [`../../test/pack-install.js`](../../test/pack-install.js)),
which packs, installs into a throwaway project, runs the *installed* binary, and inspects the result.
CI runs it as a dedicated `package` job. When you change anything that affects what ships — the
template layout, the `files` list, ignore-file naming, the runtime asset reads — re-run the
round-trip and believe *it*, not the convenient lie of `node bin/cli.js` in your working tree.
