# Security Policy

## Supported versions

`dot-ai` is distributed through npm and the latest published version is the only one supported.
Please upgrade to the latest release before reporting an issue.

## Reporting a vulnerability

Please **do not** open a public issue for a vulnerability.

Instead, use GitHub's private reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** to open a private advisory.

If you'd rather email, write to **alejandromarquez@live.com** with details and steps to
reproduce. I'll acknowledge within a few days and keep you updated on the fix.

## Scope notes

`dot-ai` is a local CLI. It scaffolds an `.ai/` directory and can wire a convention block into
agent config files (`CLAUDE.md` / `GEMINI.md` / `AGENTS.md`) in the current project. It does not
handle credentials or make network calls during normal operation. The most relevant concerns are
unintended file writes outside the project directory or path-traversal in inputs — reports in
that area are especially appreciated.
