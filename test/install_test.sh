#!/bin/sh
# Verifies both installers: scaffold copy, non-clobber, block append + idempotent replace.
set -eu
# shellcheck disable=SC1007  # 'CDPATH= cd' is the intentional idiom to neutralize CDPATH
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'ok: %s\n' "$*"; }

run_case() {
  name="$1"; shift
  runner="$1"; shift   # command prefix, e.g. "sh $REPO_ROOT/install.sh" or "node $REPO_ROOT/bin/cli.js"
  work=$(mktemp -d); cd "$work"

  # Pre-existing CLAUDE.md with user content + a sentinel that must survive.
  printf '# My instructions\nKEEP-ME\n' > CLAUDE.md
  # Pre-existing Claude settings with a key the JSON merge must preserve.
  mkdir -p .claude
  printf '{ "existingKey": "keep" }\n' > .claude/settings.local.json

  $runner --claude
  [ -f .ai/README.md ] || fail "$name: .ai/README.md not created"
  [ "$(find .ai -type d | wc -l | tr -d ' ')" -ge 12 ] || fail "$name: missing folders"
  grep -qF 'KEEP-ME' CLAUDE.md || fail "$name: clobbered existing content"
  grep -qF '<!-- BEGIN .ai-convention -->' CLAUDE.md || fail "$name: block not appended"

  # Plans setting: merged in, existing key preserved, still valid JSON.
  grep -qF '.ai/plans' .claude/settings.local.json || fail "$name: plansDirectory not set"
  grep -qF 'existingKey' .claude/settings.local.json || fail "$name: JSON merge clobbered existing key"
  node -e 'JSON.parse(require("fs").readFileSync(".claude/settings.local.json","utf8"))' \
    || fail "$name: settings.local.json is not valid JSON"

  # Idempotency: second run must not duplicate the block.
  $runner --claude
  count=$(grep -cF '<!-- BEGIN .ai-convention -->' CLAUDE.md)
  [ "$count" -eq 1 ] || fail "$name: block duplicated ($count)"

  # Non-clobber: editing a scaffold file then re-running leaves the edit intact.
  echo "EDITED" >> .ai/knowledge/README.md
  $runner --claude
  grep -qF 'EDITED' .ai/knowledge/README.md || fail "$name: scaffold file clobbered"

  cd /; rm -rf "$work"
  pass "$name"
}

# Plans setting: Gemini uses the nested key; --no-plans skips writing settings.
plans_case() {
  name="$1"; shift
  runner="$1"; shift
  work=$(mktemp -d); cd "$work"

  $runner --gemini
  grep -qF '.ai/plans' .gemini/settings.json || fail "$name: gemini plan dir not set"
  node -e 'const s=JSON.parse(require("fs").readFileSync(".gemini/settings.json","utf8")); if(s.general.plan.directory!==".ai/plans")process.exit(1)' \
    || fail "$name: gemini general.plan.directory wrong"

  cd /; rm -rf "$work"; work=$(mktemp -d); cd "$work"
  $runner --claude --no-plans
  [ -f .claude/settings.local.json ] && fail "$name: --no-plans still wrote settings"

  cd /; rm -rf "$work"
  pass "$name (plans)"
}

# Scaffold-only: --no-md drops dirs+READMEs and touches nothing else.
scaffold_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  $runner --no-md
  [ -f .ai/README.md ] || fail "$name: scaffold not created"
  [ "$(find .ai -type d | wc -l | tr -d ' ')" -ge 12 ] || fail "$name: missing folders"
  [ -e CLAUDE.md ] && fail "$name: --no-md created CLAUDE.md"
  [ -e .claude/settings.local.json ] && fail "$name: --no-md wrote settings"
  [ -e .gemini/settings.json ] && fail "$name: --no-md wrote gemini settings"
  cd /; rm -rf "$work"
  pass "$name (scaffold-only)"
}

# Contradiction guard: --no-md with an MD target flag must exit non-zero.
guard_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  if $runner --no-md --claude >/dev/null 2>&1; then
    cd /; rm -rf "$work"
    fail "$name: --no-md --claude should have exited non-zero"
  fi
  cd /; rm -rf "$work"
  pass "$name (guard)"
}

# Global MD target: --global writes the block to $HOME config, not local; idempotent.
global_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); fakehome=$(mktemp -d); cd "$work"
  HOME="$fakehome" $runner --claude --global
  [ -f "$fakehome/.claude/CLAUDE.md" ] || fail "$name: global CLAUDE.md not created"
  grep -qF '<!-- BEGIN .ai-convention -->' "$fakehome/.claude/CLAUDE.md" \
    || fail "$name: block not written to global CLAUDE.md"
  [ -e CLAUDE.md ] && fail "$name: --global also created a local CLAUDE.md"
  [ -f .ai/README.md ] || fail "$name: scaffold not created"
  # Idempotent: second global run must not duplicate the block.
  HOME="$fakehome" $runner --claude --global
  count=$(grep -cF '<!-- BEGIN .ai-convention -->' "$fakehome/.claude/CLAUDE.md")
  [ "$count" -eq 1 ] || fail "$name: global block duplicated ($count)"
  # Plans setting must stay project-local (in $work), never in the global home.
  [ -f "$work/.claude/settings.local.json" ] || fail "$name: plans setting not written to local work dir"
  [ -e "$fakehome/.claude/settings.local.json" ] && fail "$name: --global wrote plans setting into fakehome"
  cd /; rm -rf "$work" "$fakehome"
  pass "$name (global)"
}

run_case "install.sh" "sh $REPO_ROOT/install.sh"
run_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
plans_case "install.sh" "sh $REPO_ROOT/install.sh"
plans_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
scaffold_case "install.sh" "sh $REPO_ROOT/install.sh"
scaffold_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
guard_case    "install.sh" "sh $REPO_ROOT/install.sh"
guard_case    "cli.js"     "node $REPO_ROOT/bin/cli.js"
global_case "install.sh" "sh $REPO_ROOT/install.sh"
global_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
printf 'ALL PASS\n'
