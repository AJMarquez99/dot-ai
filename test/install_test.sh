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
  [ -f .ai/.gitignore ] || fail "$name: .ai/.gitignore not created"
  grep -qF '_*' .ai/.gitignore || fail "$name: .ai/.gitignore missing _* local-prefix rule"
  [ -e .ai/gitignore ] && fail "$name: undotted .ai/gitignore leaked into project"
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
  grep -qF '<!-- BEGIN .ai-convention -->' CLAUDE.md || fail "$name: --no-plans suppressed MD injection"

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

# --global with no tool flag: scaffold only, no MD, prints a hint, exits 0.
bare_global_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  out=$($runner --global 2>&1)
  [ -f .ai/README.md ] || fail "$name: scaffold not created"
  [ -e CLAUDE.md ] && fail "$name: --global alone created CLAUDE.md"
  printf '%s\n' "$out" | grep -qi 'no effect without a tool flag' \
    || fail "$name: --global alone printed no hint"
  cd /; rm -rf "$work"
  pass "$name (bare-global)"
}

# --help prints usage to stdout and exits 0; --version prints the package version.
help_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  out=$($runner --help) || fail "$name: --help exited non-zero"
  printf '%s\n' "$out" | grep -qF 'Usage: dot-ai' || fail "$name: --help missing usage"
  printf '%s\n' "$out" | grep -qF -- '--dry-run' || fail "$name: --help missing flags"
  [ -e .ai ] && fail "$name: --help created files"
  cd /; rm -rf "$work"
  pass "$name (help)"
}

version_case() {
  name="$1"; shift; runner="$1"; shift
  want=$(node -e 'process.stdout.write(require("'"$REPO_ROOT"'/package.json").version)') \
    || fail "$name: could not read version from package.json"
  work=$(mktemp -d); cd "$work"
  got=$($runner --version) || fail "$name: --version exited non-zero"
  [ "$got" = "$want" ] || fail "$name: --version got '$got' want '$want'"
  [ -e .ai ] && fail "$name: --version created files"
  cd /; rm -rf "$work"
  pass "$name (version)"
}

# --dry-run previews everything and writes nothing.
dryrun_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  out=$($runner --all --dry-run 2>&1) || fail "$name: --dry-run exited non-zero"
  printf '%s\n' "$out" | grep -qiF 'would' || fail "$name: --dry-run printed no 'would' preview"
  [ -e .ai ] && fail "$name: --dry-run created .ai"
  [ -e CLAUDE.md ] && fail "$name: --dry-run created CLAUDE.md"
  [ -e .claude ] && fail "$name: --dry-run created .claude"
  [ -e .gemini ] && fail "$name: --dry-run created .gemini"
  cd /; rm -rf "$work"
  pass "$name (dry-run)"
}

# --codex --global honors $CODEX_HOME (default ~/.codex).
codex_home_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); ch=$(mktemp -d); cd "$work"
  CODEX_HOME="$ch" $runner --codex --global --no-plans >/dev/null 2>&1
  [ -f "$ch/AGENTS.md" ] || fail "$name: --codex --global ignored CODEX_HOME"
  grep -qF '<!-- BEGIN .ai-convention -->' "$ch/AGENTS.md" || fail "$name: block not in \$CODEX_HOME/AGENTS.md"
  [ -e AGENTS.md ] && fail "$name: --codex --global also wrote a local AGENTS.md"
  cd /; rm -rf "$work" "$ch"
  pass "$name (codex-home)"
}

# --dry-run combined with --no-md / --no-plans writes nothing and previews correctly.
dryrun_combo_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  out=$($runner --no-md --dry-run 2>&1) || fail "$name: --no-md --dry-run exited non-zero"
  printf '%s\n' "$out" | grep -qiF 'would add' || fail "$name: --no-md --dry-run printed no scaffold preview"
  [ -e .ai ] && fail "$name: --no-md --dry-run created .ai"
  cd /; rm -rf "$work"; work=$(mktemp -d); cd "$work"
  out=$($runner --claude --no-plans --dry-run 2>&1) || fail "$name: --no-plans --dry-run exited non-zero"
  [ -e .ai ] && fail "$name: --no-plans --dry-run created .ai"
  [ -e CLAUDE.md ] && fail "$name: --no-plans --dry-run created CLAUDE.md"
  printf '%s\n' "$out" | grep -qiF 'would set' && fail "$name: --no-plans --dry-run previewed a plans write"
  printf '%s\n' "$out" | grep -qiF 'would inject' || fail "$name: --no-plans --dry-run printed no inject preview"
  cd /; rm -rf "$work"
  pass "$name (dry-run combos)"
}

# A current convention block is neither rewritten nor previewed as an inject (#3).
unchanged_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  $runner --claude --no-plans >/dev/null 2>&1
  cp CLAUDE.md before.md
  out=$($runner --claude --no-plans 2>&1)
  printf '%s\n' "$out" | grep -qE 'unchanged: .*CLAUDE\.md' || fail "$name: re-run did not report unchanged"
  printf '%s\n' "$out" | grep -qF 'updated block in' && fail "$name: re-run rewrote a current block"
  cmp -s CLAUDE.md before.md || fail "$name: current block was modified"
  out=$($runner --claude --no-plans --dry-run 2>&1)
  printf '%s\n' "$out" | grep -qE 'unchanged: .*CLAUDE\.md' || fail "$name: dry-run on a current block did not say unchanged"
  printf '%s\n' "$out" | grep -qF 'would inject' && fail "$name: dry-run previewed an inject into a current block"
  printf '<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\n' > CLAUDE.md
  out=$($runner --claude --no-plans --dry-run 2>&1)
  printf '%s\n' "$out" | grep -qF 'would inject' || fail "$name: dry-run on a stale block did not preview the inject"
  cd /; rm -rf "$work"
  pass "$name (unchanged block)"
}

# CRLF stale block (#1): a stale block in a CRLF file must be detected as stale
# (not falsely reported unchanged) and updated in place, preserving the CRLF
# trailer content; a second run then reports unchanged.
crlf_stale_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\r\n<!-- BEGIN .ai-convention -->\r\nOLD\r\n<!-- END .ai-convention -->\r\nKEEP\r\n' > CLAUDE.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: CRLF stale block run exited non-zero"
  printf '%s\n' "$out" | grep -qF 'updated block in' || fail "$name: CRLF stale block not updated"
  node -e '
    const c = require("fs").readFileSync("CLAUDE.md", "utf8");
    if (c.includes("OLD")) { console.error("stale OLD body still present"); process.exit(1); }
    if (!c.endsWith("KEEP\r\n")) { console.error("KEEP\\r trailer not preserved"); process.exit(1); }
  ' || fail "$name: CRLF stale block content wrong after update"
  out=$($runner --claude --no-plans 2>&1) || fail "$name: CRLF block re-run exited non-zero"
  printf '%s\n' "$out" | grep -qE 'unchanged: .*CLAUDE\.md' || fail "$name: CRLF block re-run did not report unchanged"
  cd /; rm -rf "$work"
  pass "$name (crlf stale block)"
}

# CRLF stale block byte parity: same CRLF stale input, both installers must produce
# byte-identical output (regression guard for CR-stripped marker matching, #1).
crlf_stale_parity_case() {
  a=$(mktemp -d); b=$(mktemp -d)
  printf '# t\r\n<!-- BEGIN .ai-convention -->\r\nOLD\r\n<!-- END .ai-convention -->\r\nKEEP\r\n' > "$a/CLAUDE.md"
  printf '# t\r\n<!-- BEGIN .ai-convention -->\r\nOLD\r\n<!-- END .ai-convention -->\r\nKEEP\r\n' > "$b/CLAUDE.md"
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "CRLF stale block parity: install.sh vs cli.js differ"
  rm -rf "$a" "$b"
  pass "CRLF stale block parity"
}

# BEGIN marker with no END (#3, data loss guard): must not modify the file —
# just warn and exit 0, in a real run and in --dry-run.
begin_no_end_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\nAFTER\n' > CLAUDE.md
  cp CLAUDE.md before.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: BEGIN-without-END run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: BEGIN-without-END file was modified"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: no warning for BEGIN-without-END"
  out=$($runner --claude --no-plans --dry-run 2>&1) || fail "$name: BEGIN-without-END dry-run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: BEGIN-without-END dry-run modified the file"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: dry-run did not warn for BEGIN-without-END"
  printf '%s\n' "$out" | grep -qF 'would inject' && fail "$name: dry-run previewed an inject for BEGIN-without-END"
  cd /; rm -rf "$work"
  pass "$name (begin-no-end)"
}

# (#4) A marker counts only as a *whole* line — trailing spaces/tabs after a
# marker, or leading indentation before one, must not confuse the parity
# guard: (a) trailing space after END still replaces the block correctly;
# (b) leading indentation before BEGIN still replaces the block correctly.
trailing_space_end_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention --> \nAFTER\n' > CLAUDE.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: trailing-space-END run exited non-zero"
  printf '%s\n' "$out" | grep -qF 'updated block in' || fail "$name: trailing-space-END block not updated"
  grep -qF 'OLD' CLAUDE.md && fail "$name: trailing-space-END stale body not replaced"
  grep -qF 'AFTER' CLAUDE.md || fail "$name: trailing-space-END lost content after the block"
  cd /; rm -rf "$work"
  pass "$name (trailing space after END)"
}

indented_begin_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n  <!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\nAFTER\n' > CLAUDE.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: indented-BEGIN run exited non-zero"
  printf '%s\n' "$out" | grep -qF 'updated block in' || fail "$name: indented-BEGIN block not updated"
  grep -qF 'OLD' CLAUDE.md && fail "$name: indented-BEGIN stale body not replaced"
  grep -qF 'AFTER' CLAUDE.md || fail "$name: indented-BEGIN lost content after the block"
  cd /; rm -rf "$work"
  pass "$name (indented BEGIN)"
}

# (c) BEGIN present only inline in prose, with no marker line at all: not a
# real block — must not modify the file, just warn and exit 0.
inline_marker_prose_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf 'see <!-- BEGIN .ai-convention --> here\nAFTER\n' > CLAUDE.md
  cp CLAUDE.md before.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: inline-marker-prose run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: inline-marker-prose file was modified"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: no warning for inline-marker-prose"
  cd /; rm -rf "$work"
  pass "$name (inline marker prose)"
}

# Cross-runner byte parity for the whole-line marker predicate (#4): identical
# trailing-space/indented-marker input must produce byte-identical output.
malformed_marker_parity_case() {
  a=$(mktemp -d); b=$(mktemp -d)
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention --> \nAFTER\n' > "$a/CLAUDE.md"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention --> \nAFTER\n' > "$b/CLAUDE.md"
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "malformed marker parity (trailing space after END): install.sh vs cli.js differ"
  rm -rf "$a" "$b"
  a=$(mktemp -d); b=$(mktemp -d)
  printf '# t\n  <!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\nAFTER\n' > "$a/CLAUDE.md"
  printf '# t\n  <!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\nAFTER\n' > "$b/CLAUDE.md"
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "malformed marker parity (indented BEGIN): install.sh vs cli.js differ"
  rm -rf "$a" "$b"
  pass "malformed marker parity (trailing space / indentation)"
}

# (#5) An END line before its matching BEGIN is structurally invalid — the
# marker-presence check alone (round 2) missed this; the structure scan must
# catch it: warn, leave the file untouched, in a real run and --dry-run.
end_before_begin_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- END .ai-convention -->\nOLD\n<!-- BEGIN .ai-convention -->\nAFTER\n' > CLAUDE.md
  cp CLAUDE.md before.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: END-before-BEGIN run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: END-before-BEGIN file was modified"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: no warning for END-before-BEGIN"
  out=$($runner --claude --no-plans --dry-run 2>&1) || fail "$name: END-before-BEGIN dry-run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: END-before-BEGIN dry-run modified the file"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: dry-run did not warn for END-before-BEGIN"
  cd /; rm -rf "$work"
  pass "$name (end-before-begin)"
}

# (#5) A BEGIN nested inside an already-open block is structurally invalid —
# must not modify the file, just warn and exit 0.
nested_begin_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- BEGIN .ai-convention -->\nMORE\n<!-- END .ai-convention -->\nAFTER\n' > CLAUDE.md
  cp CLAUDE.md before.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: nested-BEGIN run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: nested-BEGIN file was modified"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: no warning for nested-BEGIN"
  cd /; rm -rf "$work"
  pass "$name (nested begin)"
}

# (#5) Two well-formed stale blocks: both must be replaced, not just the
# first — a real requirement once the guard validates structure instead of
# assuming a single block exists.
two_blocks_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD1\n<!-- END .ai-convention -->\nMID\n<!-- BEGIN .ai-convention -->\nOLD2\n<!-- END .ai-convention -->\nAFTER\n' > CLAUDE.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: two-blocks run exited non-zero"
  printf '%s\n' "$out" | grep -qF 'updated block in' || fail "$name: two-blocks not updated"
  grep -qF 'OLD1' CLAUDE.md && fail "$name: first stale block body not replaced"
  grep -qF 'OLD2' CLAUDE.md && fail "$name: second stale block body not replaced"
  grep -qF 'MID' CLAUDE.md || fail "$name: content between blocks lost"
  grep -qF 'AFTER' CLAUDE.md || fail "$name: content after the second block lost"
  [ "$(grep -cF '<!-- BEGIN .ai-convention -->' CLAUDE.md)" -eq 2 ] || fail "$name: expected two BEGIN markers after replace"
  cd /; rm -rf "$work"
  pass "$name (two blocks)"
}

two_blocks_parity_case() {
  a=$(mktemp -d); b=$(mktemp -d)
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD1\n<!-- END .ai-convention -->\nMID\n<!-- BEGIN .ai-convention -->\nOLD2\n<!-- END .ai-convention -->\nAFTER\n' > "$a/CLAUDE.md"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD1\n<!-- END .ai-convention -->\nMID\n<!-- BEGIN .ai-convention -->\nOLD2\n<!-- END .ai-convention -->\nAFTER\n' > "$b/CLAUDE.md"
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "two blocks parity: install.sh vs cli.js differ"
  rm -rf "$a" "$b"
  pass "two blocks parity"
}

# (#5) END as the very last line, with no trailing newline on the file: both
# runners must still recognize and replace the block, and end the file with a
# newline after the (new) block's last line.
end_no_trailing_newline_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->' > CLAUDE.md   # no trailing newline
  out=$($runner --claude --no-plans 2>&1) || fail "$name: END-no-trailing-newline run exited non-zero"
  printf '%s\n' "$out" | grep -qF 'updated block in' || fail "$name: END-no-trailing-newline not updated"
  grep -qF 'OLD' CLAUDE.md && fail "$name: END-no-trailing-newline stale body not replaced"
  node -e '
    const c = require("fs").readFileSync("CLAUDE.md", "utf8");
    if (!c.endsWith("\n")) { console.error("file does not end with a newline"); process.exit(1); }
  ' || fail "$name: END-no-trailing-newline did not end with a newline"
  cd /; rm -rf "$work"
  pass "$name (end no trailing newline)"
}

end_no_trailing_newline_parity_case() {
  a=$(mktemp -d); b=$(mktemp -d)
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->' > "$a/CLAUDE.md"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->' > "$b/CLAUDE.md"
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "END no-trailing-newline parity: install.sh vs cli.js differ"
  rm -rf "$a" "$b"
  pass "END no-trailing-newline parity"
}

# (#5, minor) An END line corrupted with a lone \r followed by a space is not
# a valid marker line in either runner now that neither treats a bare \r as a
# line terminator (that was the old JS regex-with-'m'-flag quirk) — both must
# agree it's malformed and leave the file untouched.
end_cr_space_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\r \nAFTER\n' > CLAUDE.md
  cp CLAUDE.md before.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: END-CR-space run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: END-CR-space file was modified"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: no warning for END-CR-space"
  cd /; rm -rf "$work"
  pass "$name (end cr space)"
}

# A UTF-8 BOM on record 1 before BEGIN is tolerated (stripped for comparison
# only) and preserved as the file's first bytes after the block is refreshed.
bom_marker_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '\357\273\277<!-- BEGIN .ai-convention -->\nBODY\n<!-- END .ai-convention -->\n' > CLAUDE.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: BOM-marker run exited non-zero"
  printf '%s\n' "$out" | grep -qF 'updated block in' || fail "$name: BOM-prefixed block not refreshed"
  grep -qF 'BODY' CLAUDE.md && fail "$name: stale body survived"
  [ "$(head -c3 CLAUDE.md | od -An -tx1 | tr -d ' \n')" = "efbbbf" ] || fail "$name: BOM not preserved"
  [ "$(grep -cF '<!-- BEGIN .ai-convention -->' CLAUDE.md)" -eq 1 ] || fail "$name: expected one block"
  cd /; rm -rf "$work"
  pass "$name (bom marker)"
}

# A BOM before a marker on any later line is still not a marker: malformed.
bom_later_line_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '# t\n<!-- BEGIN .ai-convention -->\nBODY\n\357\273\277<!-- END .ai-convention -->\n' > CLAUDE.md
  cp CLAUDE.md before.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: run exited non-zero"
  cmp -s CLAUDE.md before.md || fail "$name: file was modified"
  printf '%s\n' "$out" | grep -qE 'warning:.*incomplete or malformed convention block' || fail "$name: no malformed warning"
  cd /; rm -rf "$work"
  pass "$name (bom later line)"
}

bom_marker_parity_case() {
  a=$(mktemp -d); b=$(mktemp -d)
  for f in "$a/CLAUDE.md" "$b/CLAUDE.md"; do
    printf '\357\273\277<!-- BEGIN .ai-convention -->\nBODY\n<!-- END .ai-convention -->\nAFTER\n' > "$f"
  done
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "BOM marker parity: install.sh vs cli.js differ"
  # Non-marker BOM first line must also come out identical.
  for f in "$a/CLAUDE.md" "$b/CLAUDE.md"; do
    printf '\357\273\277# t\n<!-- BEGIN .ai-convention -->\nBODY\n<!-- END .ai-convention -->\n' > "$f"
  done
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "BOM title parity: install.sh vs cli.js differ"
  [ "$(head -c3 "$a/CLAUDE.md" | od -An -tx1 | tr -d ' \n')" = "efbbbf" ] || fail "BOM title: BOM lost"
  rm -rf "$a" "$b"
  pass "BOM marker parity"
}

# Two well-formed blocks: both refreshed AND a duplicate warning, same text.
dup_block_warning_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  printf '<!-- BEGIN .ai-convention -->\nA\n<!-- END .ai-convention -->\nMID\n<!-- BEGIN .ai-convention -->\nB\n<!-- END .ai-convention -->\n' > CLAUDE.md
  out=$($runner --claude --no-plans 2>&1) || fail "$name: run exited non-zero"
  printf '%s\n' "$out" | grep -qF 'warning: 2 convention blocks in CLAUDE.md — remove the extras by hand' \
    || fail "$name: no duplicate-block warning; got: $out"
  out=$($runner --claude --no-plans 2>&1)
  printf '%s\n' "$out" | grep -qF 'warning: 2 convention blocks' || fail "$name: warning missing on unchanged run"
  printf '%s\n' "$out" | grep -qF 'unchanged: CLAUDE.md' || fail "$name: second run not unchanged"
  cd /; rm -rf "$work"
  pass "$name (duplicate warning)"
}

# A single block never warns.
single_block_no_warning_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); cd "$work"
  out=$($runner --claude --no-plans 2>&1; $runner --claude --no-plans 2>&1)
  printf '%s\n' "$out" | grep -qF 'convention blocks in' && fail "$name: spurious duplicate warning"
  cd /; rm -rf "$work"
  pass "$name (single block, no warning)"
}

end_cr_space_parity_case() {
  a=$(mktemp -d); b=$(mktemp -d)
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\r \nAFTER\n' > "$a/CLAUDE.md"
  printf '# t\n<!-- BEGIN .ai-convention -->\nOLD\n<!-- END .ai-convention -->\r \nAFTER\n' > "$b/CLAUDE.md"
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "END CR-space parity: install.sh vs cli.js differ"
  rm -rf "$a" "$b"
  pass "END CR-space parity"
}

# inject() output is byte-identical between the two installers for a target
# that lacks a trailing newline (regression guard for newline separation).
inject_newline_parity_case() {
  a=$(mktemp -d); b=$(mktemp -d)
  printf '# title\nKEEP-ME' > "$a/CLAUDE.md"   # no trailing newline
  printf '# title\nKEEP-ME' > "$b/CLAUDE.md"
  ( cd "$a" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$b" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$a/CLAUDE.md" "$b/CLAUDE.md" || fail "inject newline parity: install.sh vs cli.js differ"
  rm -rf "$a" "$b"
  c=$(mktemp -d); e=$(mktemp -d)
  : > "$c/CLAUDE.md"; : > "$e/CLAUDE.md"   # empty existing files
  ( cd "$c" && sh "$REPO_ROOT/install.sh" --claude --no-plans >/dev/null 2>&1 )
  ( cd "$e" && node "$REPO_ROOT/bin/cli.js" --claude --no-plans >/dev/null 2>&1 )
  diff "$c/CLAUDE.md" "$e/CLAUDE.md" || fail "inject newline parity (empty file): installers differ"
  rm -rf "$c" "$e"
  pass "inject newline parity (no trailing newline)"
}

# init inside a .ai/ layer is refused and creates no nested .ai/.ai (#15).
inside_ai_case() {
  name="$1"; shift; runner="$1"; shift
  work=$(mktemp -d); mkdir -p "$work/.ai"
  rc=0
  ( cd "$work/.ai" && $runner --no-md >"$work/out" 2>&1 ) || rc=$?
  [ "$rc" -eq 2 ] || fail "$name: init inside .ai/ exited $rc, want 2"
  grep -qF "inside a .ai/ layer" "$work/out" || fail "$name: no inside-.ai/ message"
  [ -e "$work/.ai/.ai" ] && fail "$name: created nested .ai/.ai"
  rm -rf "$work"

  # (final-fix #2) Option parsing happens before the .ai/-layer guard: an
  # unknown flag inside .ai/ must report "Unknown option" (exit 2), the same
  # as outside .ai/ — not the inside-.ai/ message — in both runners.
  work=$(mktemp -d); mkdir -p "$work/.ai"
  rc=0
  ( cd "$work/.ai" && $runner --bogus >"$work/out2" 2>&1 ) || rc=$?
  [ "$rc" -eq 2 ] || fail "$name: --bogus inside .ai/ exited $rc, want 2"
  grep -qF 'Unknown option: --bogus' "$work/out2" || fail "$name: --bogus inside .ai/ did not report Unknown option"
  [ -e "$work/.ai/.ai" ] && fail "$name: --bogus inside .ai/ created nested .ai/.ai"
  rm -rf "$work"

  pass "$name (inside .ai/ refused)"
}

# A symlink either side of the cwd must not let init/sync past the .ai/ guard:
# (a) the LOGICAL cwd ends in .ai via a symlink but the physical target doesn't;
# (b) the PHYSICAL cwd is a real .ai/ but it's reached via a non-.ai symlink name.
inside_ai_symlink_case() {
  name="$1"; shift; runner="$1"; shift

  work=$(mktemp -d); mkdir -p "$work/real"
  ln -s "$work/real" "$work/.ai"
  rc=0
  ( cd "$work/.ai" && $runner --no-md >"$work/out-a" 2>&1 ) || rc=$?
  [ "$rc" -eq 2 ] || fail "$name: symlinked (logical .ai) exited $rc, want 2"
  grep -qF "inside a .ai/ layer" "$work/out-a" || fail "$name: no inside-.ai/ message (logical .ai)"
  [ -e "$work/real/.ai" ] && fail "$name: created nested .ai under the real symlink target"
  rm -rf "$work"

  work=$(mktemp -d); mkdir -p "$work/.ai"
  ln -s "$work/.ai" "$work/alias"
  rc=0
  ( cd "$work/alias" && $runner --no-md >"$work/out-b" 2>&1 ) || rc=$?
  [ "$rc" -eq 2 ] || fail "$name: symlinked (physical .ai) exited $rc, want 2"
  grep -qF "inside a .ai/ layer" "$work/out-b" || fail "$name: no inside-.ai/ message (physical .ai)"
  [ -e "$work/.ai/.ai" ] && fail "$name: created nested .ai/.ai via alias symlink"
  rm -rf "$work"

  pass "$name (symlinked .ai/ refused both directions)"
}

# Guard the npm trap: npm renames .gitignore -> .npmignore on install, so the
# template must ship its ignore files as `gitignore` (no dot), never `.gitignore`.
template_ignore_naming_case() {
  bad=$(cd "$REPO_ROOT" && find template -name '.gitignore' -o -name '.npmignore')
  [ -z "$bad" ] || fail "template ships a dotted ignore file npm will mangle: $bad"
  [ -f "$REPO_ROOT/template/.ai/gitignore" ] || fail "template/.ai/gitignore missing"
  [ -f "$REPO_ROOT/template/.ai/context/gitignore" ] || fail "template/.ai/context/gitignore missing"
  pass "template ships undotted gitignore files"
}

template_ignore_naming_case
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
bare_global_case "install.sh" "sh $REPO_ROOT/install.sh"
bare_global_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
help_case    "install.sh" "sh $REPO_ROOT/install.sh"
help_case    "cli.js"     "node $REPO_ROOT/bin/cli.js"
version_case "install.sh" "sh $REPO_ROOT/install.sh"
version_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
dryrun_case "install.sh" "sh $REPO_ROOT/install.sh"
dryrun_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
codex_home_case   "install.sh" "sh $REPO_ROOT/install.sh"
codex_home_case   "cli.js"     "node $REPO_ROOT/bin/cli.js"
dryrun_combo_case "install.sh" "sh $REPO_ROOT/install.sh"
dryrun_combo_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
unchanged_case "install.sh" "sh $REPO_ROOT/install.sh"
unchanged_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
crlf_stale_case "install.sh" "sh $REPO_ROOT/install.sh"
crlf_stale_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
crlf_stale_parity_case
begin_no_end_case "install.sh" "sh $REPO_ROOT/install.sh"
begin_no_end_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
trailing_space_end_case "install.sh" "sh $REPO_ROOT/install.sh"
trailing_space_end_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
indented_begin_case "install.sh" "sh $REPO_ROOT/install.sh"
indented_begin_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
inline_marker_prose_case "install.sh" "sh $REPO_ROOT/install.sh"
inline_marker_prose_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
malformed_marker_parity_case
end_before_begin_case "install.sh" "sh $REPO_ROOT/install.sh"
end_before_begin_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
nested_begin_case "install.sh" "sh $REPO_ROOT/install.sh"
nested_begin_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
two_blocks_case "install.sh" "sh $REPO_ROOT/install.sh"
two_blocks_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
two_blocks_parity_case
end_no_trailing_newline_case "install.sh" "sh $REPO_ROOT/install.sh"
end_no_trailing_newline_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
end_no_trailing_newline_parity_case
end_cr_space_case "install.sh" "sh $REPO_ROOT/install.sh"
end_cr_space_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
end_cr_space_parity_case
bom_marker_case "install.sh" "sh $REPO_ROOT/install.sh"
bom_marker_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
bom_later_line_case "install.sh" "sh $REPO_ROOT/install.sh"
bom_later_line_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
dup_block_warning_case "install.sh" "sh $REPO_ROOT/install.sh"
dup_block_warning_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
single_block_no_warning_case "install.sh" "sh $REPO_ROOT/install.sh"
single_block_no_warning_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
bom_marker_parity_case
inject_newline_parity_case
inside_ai_case "install.sh" "sh $REPO_ROOT/install.sh"
inside_ai_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
inside_ai_symlink_case "install.sh" "sh $REPO_ROOT/install.sh"
inside_ai_symlink_case "cli.js"     "node $REPO_ROOT/bin/cli.js"
printf 'ALL PASS\n'
