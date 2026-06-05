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
DO_CLAUDE=0; DO_GEMINI=0; DO_CODEX=0; ANY_FLAG=0
for arg in "$@"; do
  case "$arg" in
    --all) DO_CLAUDE=1; DO_GEMINI=1; DO_CODEX=1; ANY_FLAG=1 ;;
    --claude) DO_CLAUDE=1; ANY_FLAG=1 ;;
    --gemini) DO_GEMINI=1; ANY_FLAG=1 ;;
    --codex) DO_CODEX=1; ANY_FLAG=1 ;;
    *) log "Unknown option: $arg"; exit 2 ;;
  esac
done

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
  else
    log "No tty and no flags — skipping agent wiring."
    log "Re-run with --claude / --gemini / --codex / --all to wire config files."
  fi
fi

# 2) Inject the block into a single file (append, or replace existing block).
# The block is read from a file via awk getline — BSD/macOS awk rejects multi-line
# values passed with -v, and getline also handles a block that isn't at EOF.
inject() {
  target="$1"
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

[ "$DO_CLAUDE" -eq 1 ] && inject "CLAUDE.md"
[ "$DO_GEMINI" -eq 1 ] && inject "GEMINI.md"
[ "$DO_CODEX" -eq 1 ] && inject "AGENTS.md"

log "Done."
