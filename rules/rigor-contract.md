# Rigor Guard Enforcement Contract

Managed repositories should copy `templates/AGENTS.md` to their root and place a project-specific contract at `.agents/verification-contract.json`.

## Enforcement layers

1. **PreToolUse guard** — intercepts dangerous commands, history rewrites, verification bypasses, evidence tampering, and protected contract changes.
2. **PostToolUse ledger** — records the observed success or failure state of guarded tool calls in the local rigor ledger.
3. **Git hooks** — optionally runs test-preservation and local verification checks through the supplied Lefthook template.
4. **Stop gate** — checks contract integrity, test preservation, disabled tests, document quality, local commands, remote CI, report metadata, and completion claims before allowing an agent to stop.

## Evidence rules

- Attempting a command is not evidence that it passed.
- Local success is not evidence that remote CI passed.
- A CI run must match the current HEAD.
- Missing, stale, skipped, failed, or malformed evidence must not be reported as success.
- Changes to the verification contract require explicit human confirmation after the contract has been locked for a conversation.

The detailed agent rules are maintained in `templates/AGENTS.md`.
