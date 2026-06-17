# Fast-follow: `--json` output, then maybe a read-only MCP layer

Deferred out of v1.0.0 (kept the release focused + reviewed). Captured here so it isn't lost.

## 1. `--json` on the read commands (target: 1.1.0)

Add machine-readable output to the two **read** commands so agents that shell out get structured
data without parsing CLI text:

- `dot-ai context --json` → `{ "cwd": "...", "cascade": [{ "path": "...", "scope": "outermost|ancestor|nearest|project" }] }`
- `dot-ai doctor --json`  → `{ "root": "...", "cascade": [...], "problems": [{ "kind": "...", "detail": "..." }], "ok": <bool> }`

**Design decisions to make first (not a one-liner):**
- `--json` prints the structured payload to **stdout** (data), unlike the default human output (stderr).
- `doctor --json` keeps its exit-code contract (0 clean / 1 problems / 2 no `.ai/`) — JSON is just the format.
- Stable `kind` enum for doctor problems (`missing-folder`, `missing-readme`, `gitignore-missing-rule`, `context-not-ignored`, `stale-folder`, …).
- TDD both, same Node `check()` idiom.

Only the read/discovery commands warrant JSON. Setup/maintenance (`init`/`wire`/`sync`/`archive`/`prune`/`promote`) do not.

## 2. Read-only MCP layer (only if cross-client discoverability proves worth it)

dot-ai is **local-filesystem, uncredentialed** — unlike `discord-cli`/`gmail-cli`, whose MCP servers
exist to gate *external, credentialed* operations. An agent already has Read/Write/Glob/Bash, and the
convention's whole point is "plain Markdown any agent reads directly." So a full-surface MCP mirror is
over-building and cuts against the philosophy.

If pursued, scope it to **discovery only** — `dot_ai_context` and `dot_ai_doctor` — wrapping the
`--json` output above. Build `--json` first; the MCP server becomes a thin wrapper. Revisit only when a
concrete non-Claude-Code MCP client needs it.

**Decision (2026-06-16):** `--json` is the worthy near-term addition; MCP stays speculative until a real
consumer appears. See [[releasing]] for how the eventual 1.1.0 ships.
