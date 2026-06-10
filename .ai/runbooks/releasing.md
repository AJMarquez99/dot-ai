# Releasing dot-ai

How to cut and publish a new version of `@ajmarquez99/dot-ai` to npm.

`dot-ai` is a scoped public package with two installers at strict parity (`install.sh` and
`bin/cli.js`). A release ships the `files` allowlist from `package.json`: `bin/`, `template/`,
`agent-instructions.md`, `SPEC.md`, `LICENSE`, `README.md`.

**Read before you start:** the npm version slot you publish is **permanent** — you can never
reuse `X.Y.Z` again, even after an unpublish. Unpublish is only clean within 72h, and the name
gets tombstoned regardless. Get the version right the first time.

## 0. Preconditions — stop if any fail

1. You are on `main` with a clean tree (`git status` shows nothing to commit).
2. CI is green on the latest `main` commit. Check the matrix:
   ```sh
   gh run list --branch main --limit 1
   ```
   The `harness` (ubuntu+macos × Node 18/20), `windows`, and `package` jobs must all be green.
   **Stop if CI is red** — do not publish on a failing matrix.
3. You are logged in as the scope owner:
   ```sh
   npm whoami
   ```
   This must print `ajmarquez99`. **Stop if it does not** — publishing under the wrong account
   either fails (no scope access) or publishes to the wrong place.

## 1. Prove it locally

Run the full suite plus the pack round-trip from the repo root:

```sh
npm test
npm run pack-test
```

`npm test` must end with `ALL PASS`; `npm run pack-test` must end with `PACK-INSTALL OK`.
The pack round-trip is the one that catches the npm `.gitignore` → `.npmignore` rename, so do
not skip it. **Stop if either fails** — see [testing.md](./testing.md) to debug.

## 2. Decide and set the version

Pick the next version by semver against what changed since the last release:

- **patch** (`0.1.0` → `0.1.1`): bug fix, no behavior change for users.
- **minor** (`0.1.0` → `0.2.0`): new flag / new capability, backward compatible.
- **major** (`0.1.0` → `1.0.0`): a breaking change to flags, output, or the `.ai/` layout.

Bump it with npm (this rewrites `package.json` and creates a `vX.Y.Z` commit + tag):

```sh
npm version <patch|minor|major>
```

Or set an exact version: `npm version 0.2.0`. If you prefer to tag by hand, edit the `version`
field and commit yourself, then create the tag in step 5.

**Stop if** the chosen version already exists on the registry — check with
`npm view @ajmarquez99/dot-ai versions`. A taken slot is gone forever; choose the next one.

## 3. Inspect the tarball before publishing

Build the tarball and confirm it ships exactly what it should:

```sh
npm pack
tar tzf ajmarquez99-dot-ai-*.tgz
```

Verify in the listing:

1. The ignore file ships **undotted** as `package/template/.ai/gitignore` (NOT `.gitignore`,
   NOT `.npmignore`). The installer restores the dot on the consumer's machine; if npm has
   mangled it here the install will produce a broken `.ai/` tree. **Stop if you see a dotted or
   `.npmignore` name** — `npm run pack-test` should have caught this; re-run it.
2. The `files` allowlist contents are present: `package/bin/cli.js`, the full `package/template/`
   tree, `package/agent-instructions.md`, `package/SPEC.md`, `package/LICENSE`,
   `package/README.md`.
3. No stray files (no `.ai/` workspace, no `test/`, no node_modules).

Delete the local tarball once inspected: `rm ajmarquez99-dot-ai-*.tgz`.

## 4. Publish

```sh
npm publish
```

Notes:
- `publishConfig.access` is `public` in `package.json`, so the scoped package publishes
  publicly. Without it a scoped package would attempt a private publish and fail.
- `prepublishOnly` runs `npm test` automatically — publish is gated on the suite passing. If it
  fails here, **stop**; the publish is aborted and nothing went out.
- The npm account has 2FA set to `auth-and-writes`, so publish needs a 6-digit OTP. Either let
  the interactive prompt ask for it, or pass it inline:
  ```sh
  npm publish --otp=123456
  ```
- **Soft launch:** to publish without moving the `latest` dist-tag (so existing
  `npx @ajmarquez99/dot-ai` users are not upgraded), publish under a pre-release tag:
  ```sh
  npm publish --tag next --otp=123456
  ```
  Promote later with `npm dist-tag add @ajmarquez99/dot-ai@X.Y.Z latest`.

## 5. Verify the published release

```sh
npm view @ajmarquez99/dot-ai version
npm view @ajmarquez99/dot-ai dist-tags
```

The `version` (and `latest` tag, unless you used `--tag next`) should be the version you just
shipped. As a final smoke, install it as a real consumer would in a throwaway dir:

```sh
cd "$(mktemp -d)" && npx @ajmarquez99/dot-ai@X.Y.Z --no-md && ls .ai
```

You should see the scaffolded `.ai/` folders. Confirm `.ai/.gitignore` exists (the dot was
restored) and there is no undotted `.ai/gitignore`.

## 6. Push the tag and cut the GitHub release

If you used `npm version`, push the commit and tag:

```sh
git push origin main --follow-tags
```

Otherwise create and push the tag by hand:

```sh
git tag vX.Y.Z
git push origin main vX.Y.Z
```

Then cut the GitHub release (this repo is under `AJMarquez99/`, so `gh` is allowed):

```sh
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
```

## If something went wrong after publishing

- **Within 72h:** `npm unpublish @ajmarquez99/dot-ai@X.Y.Z` removes that version cleanly. The
  version slot is still burned — you cannot republish the same number.
- **After 72h (or as the preferred "undo"):** you cannot unpublish a single version cleanly.
  Mark the bad version deprecated and publish a fixed one:
  ```sh
  npm deprecate @ajmarquez99/dot-ai@X.Y.Z "Broken release — use X.Y.(Z+1)"
  ```
  Then ship the fix as the next version (back to step 1).
