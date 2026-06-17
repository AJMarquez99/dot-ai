# Releasing dot-ai

How to cut and publish a new version of `@ajmarquez99/dot-ai` to npm.

**Publishing is automated.** Pushing a `vX.Y.Z` tag triggers the **Release** workflow
(`.github/workflows/release.yml`), which publishes to npm via **trusted publishing (OIDC)** —
there is **no `NPM_TOKEN` and no stored secret**. GitHub Actions mints a short-lived,
per-workflow token that npm exchanges for a one-time publish credential, and **provenance** is
attached automatically (public repo + public package). You don't run `npm publish` by hand for a
normal release — you push a tag and watch Actions.

`dot-ai` is a scoped public package with two installers at strict parity (`install.sh` and
`bin/cli.js`). A release ships the `files` allowlist from `package.json`: `bin/`, `template/`,
`agent-instructions.md`, `SPEC.md`, `LICENSE`, `README.md`.

**Read before you start:** the npm version slot you publish is **permanent** — you can never
reuse `X.Y.Z` again, even after an unpublish. Get the version right the first time.

## How the auto-publish trust is wired (already configured)

On npmjs.com, one-time: package `@ajmarquez99/dot-ai` → Settings → **Trusted Publisher** →
GitHub Actions, with **org `AJMarquez99` / repo `dot-ai` / workflow `release.yml` / action
`npm publish`**. The trust is keyed to the workflow **filename** — if you ever rename
`release.yml`, update that npm config to match or publishing stops.

## 0. Preconditions — stop if any fail

1. You are on `main` with a clean tree (`git status` shows nothing to commit).
2. CI is green on the latest `main` commit:
   ```sh
   gh run list --branch main --limit 1
   ```
   The `harness` (ubuntu+macos × Node 18/20), `windows`, and `package` jobs must all be green.
   **Stop if CI is red** — do not tag a release on a failing matrix. The `package` job is the one
   that catches the `.gitignore` → `.npmignore` rename, so it must pass before you tag.

## 1. Prove it locally

```sh
npm test
npm run pack-test
```

`npm test` must end with `ALL PASS`; `npm run pack-test` must end with `PACK-INSTALL OK`.
The pack round-trip is the one that catches the npm `.gitignore` → `.npmignore` rename, so do
not skip it. **Stop if either fails** — see [testing.md](./testing.md) to debug.

## 2. Inspect the tarball before tagging

```sh
npm pack
tar tzf ajmarquez99-dot-ai-*.tgz
```

Verify in the listing:

1. The ignore file ships **undotted** as `package/template/.ai/gitignore` (NOT `.gitignore`,
   NOT `.npmignore`). The installer restores the dot on the consumer's machine. **Stop if you see
   a dotted or `.npmignore` name** — `npm run pack-test` should have caught this; re-run it.
2. The `files` allowlist contents are present: `package/bin/cli.js`, the full `package/template/`
   tree, `package/agent-instructions.md`, `package/SPEC.md`, `package/LICENSE`,
   `package/README.md`.
3. No stray files (no `.ai/` workspace, no `test/`, no `node_modules`).

Delete the local tarball once inspected: `rm ajmarquez99-dot-ai-*.tgz`.

## 3. Decide and set the version

Pick the next version by semver against what changed since the last release:

- **patch** (`1.0.0` → `1.0.1`): bug fix, no behavior change for users.
- **minor** (`1.0.0` → `1.1.0`): new command/flag/capability, backward compatible.
- **major** (`1.0.0` → `2.0.0`): a breaking change to commands, flags, output, or the `.ai/` layout.

Bump it with npm (rewrites `package.json` and creates a `vX.Y.Z` commit + tag):

```sh
npm version <patch|minor|major>
```

**Stop if** the chosen version already exists — check with
`npm view @ajmarquez99/dot-ai versions`. A taken slot is gone forever; choose the next one.

## 4. Push the tag — this publishes

```sh
git push origin main --follow-tags
```

That pushes the `vX.Y.Z` tag, which fires the **Release** workflow. Watch it:

```sh
gh run list --workflow release.yml --limit 1
gh run watch
```

The workflow runs `npm test` then `npm publish --access public` using the OIDC token. **No OTP,
no secret, no manual publish.** If the tag and `package.json` version disagree, fix and re-tag a
new version (never move a published tag).

## 5. Verify the published release

```sh
npm view @ajmarquez99/dot-ai version
npm view @ajmarquez99/dot-ai dist-tags
```

The `version` and `latest` tag should be what you just shipped. Final smoke as a real consumer:

```sh
cd "$(mktemp -d)" && npx @ajmarquez99/dot-ai@X.Y.Z --no-md && ls .ai
```

You should see the scaffolded `.ai/` folders, with `.ai/.gitignore` present (dot restored) and no
undotted `.ai/gitignore`. Then cut the GitHub release:

```sh
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
```

## Manual fallback (workflow unavailable)

Only if Actions is down or the trusted-publisher config is broken. Requires being logged in as the
scope owner (`npm whoami` → `ajmarquez99`):

```sh
npm test && npm publish --access public
```

`prepublishOnly` re-runs `npm test`, so a manual publish is still gated on the suite. The account
has 2FA, so an interactive manual publish prompts for an OTP (`--otp=123456`). Prefer the tag-driven
path — the manual route exists only as a break-glass.

## If something went wrong after publishing

- **Within 72h:** `npm unpublish @ajmarquez99/dot-ai@X.Y.Z` removes that version. The slot is still
  burned — you cannot republish the same number.
- **After 72h (preferred "undo"):** deprecate and ship a fix:
  ```sh
  npm deprecate @ajmarquez99/dot-ai@X.Y.Z "Broken release — use X.Y.(Z+1)"
  ```
  Then ship the fix as the next version (back to step 1).
