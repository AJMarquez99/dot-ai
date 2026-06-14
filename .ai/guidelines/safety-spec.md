# Safety Specification — agent-operated CLI tools

**Status:** the shared **safety standard** for the agent-operated CLI family (`gmail-cli`,
`discord-cli`). Maintained in the umbrella `tools/` workspace and copied into each repo so
collaborators and forkers have it in-tree. **Audience:** anyone building, modifying, or forking a
family tool, and the agents that operate it.

> **Applicability to dot-ai:** dot-ai is the `.ai/` convention + installer, **not** an agent-operated
> *service* CLI — it handles no credentials and reaches no external service, so the lethal-trifecta
> framing and the service-gating requirements below (§5.1 secrets, §5.2 allowlist, §5.3–5.4
> outbound/untrusted reads, §5.5 logging, §5.8 MCP) don't bind it. It is vendored here as the
> **standard new sibling CLIs must meet**. What applies to dot-ai *itself* is the core stance (§2)
> and not weakening published-artifact / supply-chain hygiene.

Requirement keywords **MUST / MUST NOT / SHOULD / SHOULD NOT / MAY** are used in the RFC 2119 sense.
Each requirement is tagged (e.g. `SEC-3`) so reviews and audits can cite it.

---

## 1. Why this spec exists

These are not ordinary CLIs. They are **built to be driven by AI coding agents** — invoked
autonomously, in loops, often without a human reading each command. They also reach **external,
hard-to-undo destinations**: email that cannot be unsent, Discord messages that are immediately
public. And they **read untrusted content** (inbound mail, channel messages) that an agent will then
reason over.

That combination is the **"lethal trifecta"**:

1. **Access to private/sensitive data** (the user's mailbox, private channels, credentials on disk).
2. **Exposure to untrusted content** (email bodies, messages — any of which may carry a prompt
   injection aimed at the agent).
3. **The ability to communicate externally** (send mail, post messages).

A tool that has all three is one successful prompt injection away from exfiltrating private data to
an attacker. These tools deliberately sit at that intersection, so **safety is the primary design
constraint, not a feature.**

## 2. Core stance

> **The operating agent is treated as a partially-trusted, possibly-compromised actor.**

Defenses **MUST be structural, not behavioral.** We do not rely on the agent *choosing* to be safe,
*understanding* the rules, or *not having been injected*. We constrain what the tool will physically
do regardless of what the agent intends or has been told to do.

Concretely, three consequences flow from this stance:

- **The agent cannot move its own boundary.** Anything that widens the tool's reach (the allowlist,
  enforcement toggles, mode) is owned by the human and is **not reachable through agent-facing
  surfaces** (see §5.2, §5.8).
- **High-consequence actions are bounded and reviewable**, not blocked outright — the tool stays
  useful, but every irreversible action is gated by the boundary and recorded for a human (§5.3,
  §5.5).
- **Secrets never enter the agent's world** — not its arguments, not its output, not its logs, not
  its error text (§5.1).

## 3. Threat model

### 3.1 Actors

| Actor | Trust | Notes |
|---|---|---|
| **The human owner** | trusted | Curates the allowlist, holds credentials, accountable for the account. The only actor permitted to widen the boundary. |
| **The operating agent** | **partially trusted** | May be capable and well-aligned, but may also be prompt-injected, mistaken, or looping. Treated as potentially adversarial for boundary-affecting actions. |
| **Untrusted content authors** | **untrusted** | Anyone who can put text where the agent will read it — an email sender, a channel poster. Assume their content contains instructions aimed at the agent. |
| **External recipients** | untrusted | Where outbound actions land. The blast radius if the agent is subverted. |

### 3.2 Threat catalog

- **T1 — Injection-driven exfiltration.** Untrusted content instructs the agent to send private data
  to an attacker-controlled recipient/channel. *Primary threat.*
- **T2 — Boundary self-escalation.** The agent (injected or mistaken) tries to add a recipient,
  disable enforcement, switch to open mode, or pass a bypass flag to widen its own reach.
- **T3 — Credential capture.** Secrets leak via a flag (shell history / process table / the agent's
  own transcript), a log line, an error message, or a command return value.
- **T4 — Irreversible / high-volume action.** A single bad send is public/permanent; a loop produces
  mass unwanted mail or posts.
- **T5 — Confused deputy.** The tool acts with the human's authority on behalf of an untrusted
  instruction, with no record tying the action back for review.
- **T6 — Silent unsafe degradation.** A failure or misconfig quietly drops the tool into a
  less-safe state (e.g. "allow all" on a missing file) instead of failing closed.
- **T7 — Content exfiltration within the boundary.** Even when recipients are allowlisted, the agent
  leaks secrets *into the content* of an allowed message. *Partially out of scope — see §7.*

## 4. Invariants (non-negotiable)

These hold for every tool, always. A change that violates one is a security regression, not a
feature.

- **I1 — Fail closed.** Absent or unreadable safety config means **deny**, never allow. (`gmail`
  missing allowlist ⇒ "deny everyone but self"; `discord` missing allowlist ⇒ nothing accessible.)
- **I2 — The boundary is human-owned.** No agent-facing surface may add to the allowlist, disable
  enforcement, or change mode. Widening is a human edit to a config file.
- **I3 — Secrets are never agent-visible.** Not in args, output, logs, or errors. Prompt-only entry;
  `chmod 600` on disk; resolved through credentials code, never echoed.
- **I4 — No partial side effects.** One disallowed target rejects the **whole** operation (exit 3).
  Never send to the allowed subset and drop the rest.
- **I5 — Every side effect is recorded.** Each successful outbound/mutating action appends a
  metadata audit entry a human can later review.
- **I6 — Honest failure.** Errors surface with the correct exit code; the tool never claims success
  it didn't achieve and never silently downgrades safety.

## 5. Requirements

### 5.1 Credentials & secrets — defends T3

- **SEC-1 (MUST)** Secrets live only in `~/.config/<tool>/credentials.json` at `chmod 600`, or in an
  explicit env var. They MUST NOT be committed, and the config dir's secret files MUST be gitignored.
- **SEC-2 (MUST NOT)** Accept a secret as a CLI flag or positional. Flags leak into shell history,
  the process table, and the agent's own transcript. Credential entry is an **interactive hidden
  prompt** (`login`) or a hand-placed file. *(Implemented: both tools' `login` prompt with echo off;
  neither accepts a `--token`/`--password` flag.)*
- **SEC-3 (MUST NOT)** Return, log, or include a secret in any command result, audit entry, or error
  message. A credential error names the **path**, never the value.
- **SEC-4 (SHOULD)** Resolve credentials through a single module; ENOENT ⇒ a clear "missing"
  (exit 2), malformed file ⇒ a clear "malformed" (exit 2) — **not** a raw parser error at exit 1.
  *(Both tools conform: every config/allowlist/credentials file parses through one choke point that
  throws `MalformedConfigError` at exit 2 — gmail `lib/jsonfile.js#readJson`, discord per-loader.)*
- **SEC-5 (SHOULD)** Setup that writes secrets MUST NOT be exposed to agents (no MCP `login`; §5.8).

### 5.2 The safety boundary: allowlist & mode — defends T1, T2

- **BND-1 (MUST)** Every content/outbound operation passes through a **fail-closed gate** before any
  external call: `gmail` the recipient allowlist, `discord` the channel allowlist + restricted/open
  mode. A blocked target throws and exits **3**.
- **BND-2 (MUST)** The allowlist bounds **recipients/destinations** and is the load-bearing defense
  against injection-driven exfiltration (T1): even a fully-compromised agent can only reach
  pre-approved destinations.
- **BND-3 (MUST)** Widening the boundary is a **human action on a file** (editing
  `allowlist.json`/`config.json`). Tools MAY offer a *read* view (`allow list`) but boundary
  **writes** (`allow add/remove`, flipping `enforce`, setting `mode: open`) MUST NOT be reachable by
  an agent (§5.8). *(discord today has no `allow add` at all; gmail's `allow add/remove` and
  `config set` are CLI-only and MUST stay off any MCP surface.)*
- **BND-4 (MUST)** The configured account itself MAY be implicitly allowed (self-send), but nothing
  else is implicit. No wildcard/"allow all" default.
- **BND-5 (SHOULD)** `doctor` reports the active boundary state (mode, allowlist counts, enforcement)
  so a human/agent can see the current reach without trial sends.

### 5.3 Outbound / side-effecting actions — defends T4

- **ACT-1 (MUST)** Every side-effecting command supports `--dry-run`: assemble + preview, run the
  gate, perform **no** external write and **no** log entry. This lets an agent pre-check safely.
- **ACT-2 (SHOULD)** In untrusted-input contexts, agents SHOULD `--dry-run` first and a human or an
  orchestrator SHOULD inspect the preview before the real action.
- **ACT-3 (SHOULD)** Tools SHOULD make blast radius visible and bounded — e.g. reject obviously
  unbounded fan-out, surface recipient/target counts in the result, and never expand a single
  request into a mass action.
- **ACT-4 (MUST NOT)** Auto-attach, auto-quote, or auto-include local files/secrets that the caller
  didn't explicitly specify. The content of an outbound action is exactly what was asked for.

### 5.4 Reading untrusted content — defends T1, T5

- **RD-1 (MUST)** Read paths are clearly **read-only** and MUST NOT perform side effects as a result
  of content (no auto-reply, no auto-forward, no acting on text found in a message).
- **RD-2 (SHOULD)** Returned content SHOULD be plain data the caller can treat as **untrusted** — the
  tool does not pre-interpret it as instructions. (Callers/agents are responsible for not executing
  instructions found in fetched content; the tool's job is to not amplify them.)
- **RD-3 (SHOULD)** Fetched/inbound content MUST NOT be written into logs (§5.5) — it is untrusted
  and often private.

### 5.5 Logging, audit & accountability — defends T5, and enables review of T1/T4

- **LOG-1 (MUST)** Each successful side-effecting action appends one **metadata-only** JSONL entry to
  `~/.config/<tool>/<log>.jsonl` (gmail `sent.jsonl`, discord `audit.jsonl`): timestamp, action,
  target, ids, mode/enforcement — enough for a human to review *what the agent did*.
- **LOG-2 (MUST)** Message/content bodies are **excluded by default**; inclusion is explicit opt-in
  (`--log-body` / `config.*.logBody`). Inbound/read content is **never** logged (§5.4).
- **LOG-3 (MUST)** A log-write failure **warns** to stderr but MUST NOT fail or roll back the action,
  and MUST NOT be silently swallowed without a warning.
- **LOG-4 (SHOULD)** The log is append-only and human-readable; an agent SHOULD NOT be given a tool
  to delete or rewrite it.

### 5.6 Failure behavior & honesty — defends T6

- **FAIL-1 (MUST)** Use the shared exit-code contract: `0` ok · `1` network/unexpected · `2`
  user-fixable config/input · `3` blocked by the boundary. The code is part of the API an orchestrator
  relies on to detect a block.
- **FAIL-2 (MUST NOT)** Degrade to a less-safe mode on error. A missing/broken allowlist MUST fail
  closed (I1), never "allow all."
- **FAIL-3 (MUST)** Report outcomes faithfully — no success claim without the side effect having
  occurred; a blocked or dry-run action says so explicitly in its result.

### 5.7 Escalation & bypasses — defends T2

- **ESC-1 (MUST)** Every bypass is **explicit, named, and off by default**: `--no-allowlist`,
  `allowlist.enforce:false`, `--unrestricted`, `mode:open`, `DISCORD_MODE=open`. There are no
  implicit bypasses.
- **ESC-2 (MUST)** An active bypass/open mode MUST be **visible** — surfaced by `doctor` and SHOULD
  warn on stderr when exercised — so a human can notice an agent operating with the gate widened.
- **ESC-3 (SHOULD)** Bypasses are intended for **human-set, session-scoped** use. Agent-facing
  surfaces SHOULD NOT expose them (an MCP tool MUST NOT take an `unrestricted`/`no_allowlist` arg;
  §5.8).
- **ESC-4 (SHOULD)** Even under a bypass, the boundary SHOULD still apply where it can (e.g. discord
  open mode still requires an allowlisted *server*; "open with zero servers grants nothing").

### 5.8 Agent-facing surfaces (MCP & flags) — defends T1, T2, T3

The governing rule, applied whenever a tool exposes an MCP server (or any structured
agent-callable interface):

- **MCP-1 (MUST)** Agent-facing tools delegate to the **same gated command functions** as the CLI —
  never a parallel path that skips the gate. The allowlist, dry-run, mention-safety, and audit log
  all apply identically. *(discord-mcp follows this; any gmail-mcp MUST.)*
- **MCP-2 (MUST NOT)** Expose any operation that **mutates the safety boundary or writes secrets**:
  no allowlist add/remove, no `config set` that can flip enforcement/mode, no `login`, no `init`.
  *Rationale: a tool gated by a boundary must never be able to move that boundary — otherwise the
  fail-closed guarantee is self-defeating.*
- **MCP-3 (MUST NOT)** Accept bypass arguments (`unrestricted`, `no_allowlist`, `allow_everyone`
  without cause). The agent operates inside the boundary the human set; it cannot opt out via a tool
  arg.
- **MCP-4 (MUST)** Surface a gate block as a structured, non-crashing error (e.g. MCP
  `isError: true`) so the orchestrator sees the denial — never a server crash, never a silent pass.
- **MCP-5 (SHOULD)** The exposed surface is the **operational verbs only** (send, read, label, mark,
  react, post, thread, doctor, `allow list`, log/audit-read). Setup/admin verbs stay CLI-only.
- **MCP-6 (MUST)** Content safety still applies: mention-safety on (`@everyone`/`@here`/roles
  suppressed unless explicitly permitted), body-logging off by default.

### 5.9 Identity & least privilege — limits blast radius of T1, T4

- **ID-1 (SHOULD)** Agent tools run under a **dedicated agent identity**, not the human's primary
  account (gmail `agentic.marquez@gmail.com`; a dedicated Discord bot) — so a subverted agent's reach
  is isolated from the owner's main identity.
- **ID-2 (SHOULD)** The identity holds the **minimum scopes** needed (e.g. a bot with only the
  channel permissions it uses; an App Password rather than full-account OAuth).
- **ID-3 (MUST)** Account/profile resolution is **unambiguous**: when the target account is
  ambiguous, the tool errors rather than guessing (gmail's profile ladder errors on ambiguity). An
  agent must never silently act under the wrong identity.

## 6. Conformance checklist

Use at review time and in cross-tool audits. Cite the requirement IDs.

- [ ] **Fail-closed** on missing/broken allowlist (I1, BND-1, FAIL-2)
- [ ] **No partial** side effects — one block fails the whole op, exit 3 (I4)
- [ ] Secrets: **no secret-bearing flags** (SEC-2), not in output/logs/errors (SEC-3), `chmod 600`
      (SEC-1)
- [ ] Malformed config/credentials/allowlist ⇒ **exit 2 with a clear message**, not a raw error at
      exit 1 (SEC-4)
- [ ] `--dry-run` on every side-effecting command, no write + no log (ACT-1)
- [ ] Read paths are side-effect-free; read content never logged (RD-1, RD-3, LOG-2)
- [ ] Metadata-only audit entry per side effect; body off by default; write-fail warns not fails
      (LOG-1..3)
- [ ] Exit-code contract honored (FAIL-1); no success claim without the effect (FAIL-3)
- [ ] All bypasses explicit, off by default, **visible in `doctor`** (ESC-1, ESC-2)
- [ ] **MCP (if present):** delegates to gated commands (MCP-1); exposes **no** boundary-write /
      secret-write / bypass surface (MCP-2, MCP-3); blocks return structured errors (MCP-4)
- [ ] Dedicated, least-privilege identity; unambiguous account resolution (ID-1..3)

## 7. Residual risks & the human's responsibilities (non-goals)

This spec makes the tools **structurally hard to misuse**, but it does **not** make them
unconditionally safe. Honest limits:

- **Content exfiltration within the boundary (T7).** The allowlist bounds *who* an action reaches,
  **not what it says.** A subverted agent can still leak secrets into the *body* of a message to an
  *allowed* recipient. Mitigation is partial and human-owned: keep the allowlist tight (the smaller
  the allowed set, the smaller the exfil channel), prefer dedicated identities, and review the audit
  log. Treat the allowlist as a **trust boundary, not a content filter.**
- **Allowed-but-unwanted actions.** Injection can still cause a *permitted* action the human didn't
  actually want (e.g. an email to an allowlisted colleague with bad content). The tool cannot verify
  the human authorized a *specific* message — only that the destination is permitted.
- **The agent's own reasoning is out of scope.** These tools constrain *actions*, not the agent's
  interpretation of untrusted content. Not executing instructions found in fetched mail/messages is
  the agent/orchestrator's responsibility (RD-2).

**The human owner therefore MUST:** curate the allowlist conservatively; use dedicated,
least-privilege identities; keep enforcement on and open mode off except when deliberately and
temporarily needed; and periodically review the audit/send logs to see what the agent actually did.

## 8. Change control

This spec is a **standing rule**: a tool change that weakens a MUST is a security regression and
needs an explicit, recorded decision — not a silent edit. New tools in this collection MUST conform
before they ship an agent-facing surface (CLI is the floor; MCP raises the bar to §5.8). When a new
threat or mitigation emerges, update this file (and its sibling copies) and re-run the cross-tool
conformance audit (maintained in the umbrella `tools/` workspace) against the revised checklist.
