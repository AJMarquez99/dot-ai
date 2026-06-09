#!/bin/sh
# dot-ai installer — copies template/.ai into the current project (non-clobbering)
# and appends/updates a marked convention block in chosen agent config files.
set -eu

REPO="AJMarquez99/dot-ai"
REF="main"
BEGIN="<!-- BEGIN .ai-convention -->"
END="<!-- END .ai-convention -->"

log() { printf '%s\n' "$*" >&2; }

# Resolve source: local clone if template/ is adjacent, else download tarball.
# shellcheck disable=SC1007  # 'CDPATH= cd' is the intentional idiom to neutralize CDPATH
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -d "$SCRIPT_DIR/template/.ai" ] && [ -f "$SCRIPT_DIR/agent-instructions.md" ]; then
  SRC="$SCRIPT_DIR"
  CLEANUP=""
else
  SRC=$(mktemp -d)
  CLEANUP="$SRC"
  log "Fetching dot-ai template…"
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/$REF.tar.gz" \
    | tar xz -C "$SRC" --strip-components=1
fi
cleanup() { [ -n "$CLEANUP" ] && rm -rf "$CLEANUP"; return 0; }
trap cleanup EXIT

# Parse tool flags.
DO_CLAUDE=0; DO_GEMINI=0; DO_CODEX=0; ANY_FLAG=0; NO_PLANS=0; GLOBAL=0; NO_MD=0
for arg in "$@"; do
  case "$arg" in
    --all) DO_CLAUDE=1; DO_GEMINI=1; DO_CODEX=1; ANY_FLAG=1 ;;
    --claude) DO_CLAUDE=1; ANY_FLAG=1 ;;
    --gemini) DO_GEMINI=1; ANY_FLAG=1 ;;
    --codex) DO_CODEX=1; ANY_FLAG=1 ;;
    --global) GLOBAL=1; ANY_FLAG=1 ;;
    --no-md) NO_MD=1; ANY_FLAG=1 ;;
    --no-plans) NO_PLANS=1 ;;
    *) log "Unknown option: $arg"; exit 2 ;;
  esac
done

# --no-md means "no MD work"; pairing it with MD targets is a user error.
if [ "$NO_MD" -eq 1 ] && { [ "$DO_CLAUDE" -eq 1 ] || [ "$DO_GEMINI" -eq 1 ] || [ "$DO_CODEX" -eq 1 ] || [ "$GLOBAL" -eq 1 ]; }; then
  log "Error: --no-md cannot be combined with --claude/--gemini/--codex/--all/--global."
  exit 2
fi

# 1) Copy template/.ai into cwd, never clobbering existing files.
log "Installing .ai/ scaffold…"
( cd "$SRC/template" && find .ai -type f -print ) | while IFS= read -r rel; do
  dest="./$rel"
  if [ -e "$dest" ]; then
    log "  skip (exists): $rel"
  else
    mkdir -p "$(dirname -- "$dest")"
    cp "$SRC/template/$rel" "$dest"
    log "  add: $rel"
  fi
done

# Scaffold-only: stop here, no MD or settings work.
if [ "$NO_MD" -eq 1 ]; then
  log "Scaffold only (--no-md) — skipping agent config and settings."
  log "Done."
  exit 0
fi

# Interactive selection if no flags and a tty is available.
if [ "$ANY_FLAG" -eq 0 ]; then
  if [ -r /dev/tty ]; then
    log ""
    log "Wire the convention into which agent config files?"
    log "  [1] CLAUDE.md  [2] GEMINI.md  [3] AGENTS.md  [a] all  [n] none"
    printf 'Select (e.g. "1 3" or "a"): ' >&2
    read -r ans </dev/tty || ans="n"
    case "$ans" in *a*|*A*) DO_CLAUDE=1; DO_GEMINI=1; DO_CODEX=1 ;; esac
    case "$ans" in *1*) DO_CLAUDE=1 ;; esac
    case "$ans" in *2*) DO_GEMINI=1 ;; esac
    case "$ans" in *3*) DO_CODEX=1 ;; esac
    if [ "$DO_CLAUDE" -eq 1 ] || [ "$DO_GEMINI" -eq 1 ] || [ "$DO_CODEX" -eq 1 ]; then
      printf 'Write to local or global config? [l] local  [g] global: ' >&2
      read -r gans </dev/tty || gans="l"
      case "$gans" in [Gg]*) GLOBAL=1 ;; esac
    fi
  else
    log "No tty and no flags — skipping agent wiring."
    log "Re-run with --claude / --gemini / --codex / --all to wire config files."
  fi
fi

# --global with no tool selected does nothing useful — tell the user.
if [ "$GLOBAL" -eq 1 ] && [ "$DO_CLAUDE" -eq 0 ] && [ "$DO_GEMINI" -eq 0 ] && [ "$DO_CODEX" -eq 0 ]; then
  log "Note: --global has no effect without a tool flag (--claude/--gemini/--codex/--all)."
  log "Re-run with a tool flag to write to the global config."
fi

# Decide whether to also point plan-mode output at .ai/plans (default yes).
# Flagged / non-interactive runs default to yes; pass --no-plans to skip.
WANT_PLANS=1
if [ "$NO_PLANS" -eq 1 ]; then
  WANT_PLANS=0
elif [ "$ANY_FLAG" -eq 0 ] && [ -r /dev/tty ] \
     && { [ "$DO_CLAUDE" -eq 1 ] || [ "$DO_GEMINI" -eq 1 ] || [ "$DO_CODEX" -eq 1 ]; }; then
  printf 'Also set plansDirectory to .ai/plans in local settings? [Y/n]: ' >&2
  read -r pans </dev/tty || pans=""
  case "$pans" in [Nn]*) WANT_PLANS=0 ;; esac
fi

# Resolve an MD target: project-local by default, or under $HOME when --global.
# $1 = filename (CLAUDE.md), $2 = global subdir (.claude)
md_target() {
  if [ "$GLOBAL" -eq 1 ]; then printf '%s/%s/%s' "$HOME" "$2" "$1"; else printf '%s' "$1"; fi
}

# 2) Inject the block into a single file (append, or replace existing block).
# The block is read from a file via awk getline — BSD/macOS awk rejects multi-line
# values passed with -v, and getline also handles a block that isn't at EOF.
inject() {
  target="$1"
  mkdir -p "$(dirname -- "$target")"
  bf=$(mktemp)
  printf '%s\n%s\n%s\n' "$BEGIN" "$(cat "$SRC/agent-instructions.md")" "$END" > "$bf"
  if [ -f "$target" ] && grep -qF "$BEGIN" "$target"; then
    tmp=$(mktemp)
    awk -v b="$BEGIN" -v e="$END" -v bf="$bf" '
      $0==b {while ((getline line < bf) > 0) print line; close(bf); skip=1; next}
      $0==e {skip=0; next}
      skip!=1 {print}
    ' "$target" > "$tmp"
    mv "$tmp" "$target"
    log "  updated block in: $target"
  else
    [ -f "$target" ] && printf '\n' >> "$target"
    cat "$bf" >> "$target"
    log "  appended block to: $target"
  fi
  rm -f "$bf"
}

[ "$DO_CLAUDE" -eq 1 ] && inject "$(md_target CLAUDE.md .claude)"
[ "$DO_GEMINI" -eq 1 ] && inject "$(md_target GEMINI.md .gemini)"
[ "$DO_CODEX" -eq 1 ] && inject "$(md_target AGENTS.md .codex)"

# 3) Merge a single (possibly nested, dot-delimited) key into a JSON settings
# file without clobbering existing keys. Needs jq, node, or python3; if none is
# available we skip rather than risk corrupting the file with naive text edits.
JSON_ENGINE=""
if command -v jq >/dev/null 2>&1; then JSON_ENGINE=jq
elif command -v node >/dev/null 2>&1; then JSON_ENGINE=node
elif command -v python3 >/dev/null 2>&1; then JSON_ENGINE=python3
fi

merge_json() {
  f="$1"; key="$2"; val="$3"
  mkdir -p "$(dirname -- "$f")"
  case "$JSON_ENGINE" in
    jq)
      [ -s "$f" ] || printf '{}\n' > "$f"
      tmp=$(mktemp)
      if jq --arg v "$val" ".$key = \$v" "$f" > "$tmp" 2>/dev/null; then
        mv "$tmp" "$f"; log "  set $key=$val in: $f"
      else
        rm -f "$tmp"; log "  skip (invalid JSON): $f"
      fi
      ;;
    node)
      node - "$f" "$key" "$val" <<'NODE'
const fs = require('fs');
const [f, key, val] = process.argv.slice(2);
let d = {};
try { const r = fs.readFileSync(f, 'utf8').trim(); if (r) d = JSON.parse(r); }
catch { console.error('  skip (invalid JSON): ' + f); process.exit(0); }
let o = d; const ks = key.split('.');
for (let i = 0; i < ks.length - 1; i++) {
  if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
  o = o[ks[i]];
}
o[ks[ks.length - 1]] = val;
fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
console.error('  set ' + key + '=' + val + ' in: ' + f);
NODE
      ;;
    python3)
      python3 - "$f" "$key" "$val" <<'PY'
import json, sys
f, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    s = open(f).read().strip()
    d = json.loads(s) if s else {}
except Exception:
    sys.stderr.write('  skip (invalid JSON): %s\n' % f); sys.exit(0)
o = d; ks = key.split('.')
for k in ks[:-1]:
    if not isinstance(o.get(k), dict): o[k] = {}
    o = o[k]
o[ks[-1]] = val
open(f, 'w').write(json.dumps(d, indent=2) + '\n')
sys.stderr.write('  set %s=%s in: %s\n' % (key, val, f))
PY
      ;;
    *)
      log "  skip plans setting ($f): need jq, node, or python3 to merge JSON safely."
      ;;
  esac
}

# 4) Point each selected tool's plan-mode output at .ai/plans (local-scoped).
if [ "$WANT_PLANS" -eq 1 ] && { [ "$DO_CLAUDE" -eq 1 ] || [ "$DO_GEMINI" -eq 1 ] || [ "$DO_CODEX" -eq 1 ]; }; then
  [ "$DO_CLAUDE" -eq 1 ] && merge_json ".claude/settings.local.json" "plansDirectory" ".ai/plans"
  if [ "$DO_GEMINI" -eq 1 ]; then
    merge_json ".gemini/settings.json" "general.plan.directory" ".ai/plans"
    log "  note: Gemini also needs a policy allowing writes to .ai/plans —"
    log "        add a rule under ~/.gemini/policies (not done automatically)."
  fi
  [ "$DO_CODEX" -eq 1 ] && log "  note: Codex has no plans-directory setting; skipping."
fi

log "Done."
