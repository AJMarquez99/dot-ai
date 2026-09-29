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

## 3. Set the version — via a release PR

`main` and `staging` are protected: changes land by PR only (`staging` squash-merges,
`main` merge-commits; both require the `quality` and `ci` checks). Pick the version by semver
(patch / minor / major as above), confirm the slot is free
(`npm view @ajmarquez99/dot-ai versions`), then:

```sh
git switch -c release/vX.Y.Z origin/staging
npm version X.Y.Z --no-git-tag-version      # package.json only — no commit, no tag
git commit -am "chore(release): vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --base staging --title "chore(release): vX.Y.Z"
```

Squash-merge it once CI is green, then open the promotion PR `staging → main`
("Release vX.Y.Z — …", listing the included PRs) and **merge** it (merge commit) once green.

## 4. Tag main — this publishes

Wait for CI on the `main` merge commit (`gh run list --branch main --limit 1`), then tag that
commit and push only the tag:

```sh
git fetch origin
git tag vX.Y.Z <main merge commit sha>
git push origin vX.Y.Z
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

The **Release** workflow runs `npm test`, `npm publish --access public` (OIDC, provenance), and
then creates the GitHub Release with generated notes. Never move a published tag.

## 5. Verify

npm can take a minute to show a new version (`Your package is being processed`):

```sh
npm view @ajmarquez99/dot-ai version dist-tags --prefer-online
cd "$(mktemp -d)" && npx -y @ajmarquez99/dot-ai@X.Y.Z --no-md && ls -a .ai
gh release view vX.Y.Z      # created by the workflow — create it by hand only if the step failed
```

`.ai/.gitignore` must be present (dot restored) and no undotted `.ai/gitignore`. Delete the merged
`release/vX.Y.Z` branch (local and remote).

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
