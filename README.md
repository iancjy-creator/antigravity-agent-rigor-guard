# Antigravity Rigor Guard

[![Rigor Guard CI](https://github.com/iancjy-creator/antigravity-agent-rigor-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/iancjy-creator/antigravity-agent-rigor-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](package.json)

**Fail-closed guardrails and verification gates for AI coding agents in Google Antigravity.**

[简体中文](README.zh-CN.md)

Antigravity Rigor Guard intercepts unsafe tool calls, records auditable execution evidence, detects test degradation, and prevents an agent from declaring a task complete before the configured checks have actually passed.

> This is an independent community project. It is not affiliated with, endorsed by, or maintained by Google.

## Why this project exists

Coding agents are good at producing changes quickly, but speed creates a second problem: verifying that the reported result matches the repository state.

Common failure modes include:

- force-pushing or rewriting history;
- bypassing local hooks and CI;
- deleting, skipping, or weakening tests;
- suppressing command errors;
- reusing stale commit SHAs or old reports;
- claiming completion before local and remote checks finish.

Rigor Guard adds enforcement around those failure modes instead of relying only on prompt instructions.

## Core capabilities

| Layer | Behavior |
|---|---|
| `PreToolUse` | Denies dangerous Git and shell commands, blocks evidence tampering, and requires confirmation for protected contract changes. |
| `PostToolUse` | Updates an append-only-style local ledger with success or failure status for each recorded tool call. |
| Test preservation | Compares the current branch with its base and detects deleted test files, removed test declarations, and newly skipped or focused tests. |
| Local verification | Runs repository-specific commands defined in `.agents/verification-contract.json`. |
| Remote verification | Uses the GitHub CLI to confirm that the current HEAD has a completed, successful GitHub Actions run. |
| Report audit | Checks delivery-report metadata against the current commit and CI result. |
| Stop gate | Returns `continue` until all checks required by the selected task mode pass. |

## How it works

```text
Agent tool request
       │
       ▼
PreToolUse guard ── deny / force_ask / allow
       │
       ▼
Command or file operation
       │
       ▼
PostToolUse ledger update
       │
       ▼
Agent requests completion
       │
       ▼
Stop gate
  ├─ contract integrity
  ├─ test preservation
  ├─ disabled-test scan
  ├─ document scan
  ├─ local verification commands
  ├─ GitHub Actions status (delivery mode)
  └─ report and transcript claim audit
       │
       ▼
allow or continue
```

The ledger is stored outside the managed repository under:

```text
~/.gemini/antigravity/rigor-ledger/<conversation-id>/
```

Sensitive values matching common token, password, bearer-auth, and API-key patterns are redacted before tool calls are written to the ledger.

## Requirements

- Node.js 20 or newer;
- Git;
- Google Antigravity with command hooks enabled;
- GitHub CLI (`gh`) authenticated when using `delivery` mode;
- a GitHub Actions workflow for remote verification.

## Quick start

```bash
git clone https://github.com/iancjy-creator/antigravity-agent-rigor-guard.git
cd antigravity-agent-rigor-guard
npm ci
npm run check
npm run install-plugin
```

The installer writes the plugin to:

```text
~/.gemini/config/plugins/rigor-guard/
```

The source `hooks.json` contains a portable install-path marker. `install.mjs` replaces it with the actual installation directory, so no developer-specific absolute path is committed to the repository.

To install into a custom directory:

```bash
RIGOR_GUARD_PLUGIN_DIR=/absolute/path/to/rigor-guard npm run install-plugin
```

To remove the installed plugin:

```bash
npm run uninstall-plugin
```

## Add the repository contract

Copy the agent rules and verification contract into the repository you want to protect:

```bash
cp templates/AGENTS.md /path/to/project/AGENTS.md
mkdir -p /path/to/project/.agents
cp templates/verification-contract.json /path/to/project/.agents/verification-contract.json
```

Then edit the verification commands for that project. A minimal local-only contract looks like this:

```json
{
  "taskType": "local_only",
  "baseBranch": "main",
  "verificationCommands": [
    "npm test",
    "npm run build"
  ]
}
```

A delivery contract can require remote CI and report checks:

```json
{
  "taskType": "delivery",
  "baseBranch": "main",
  "requireCleanTreeOnStop": true,
  "requireDraftPr": true,
  "forbidMerge": true,
  "verificationCommands": [
    "npm test",
    "npm run build"
  ],
  "reportGlobs": [
    "docs/deliverables/*.md"
  ]
}
```

## Task modes

### `local_only`

Runs contract-integrity, test-preservation, code, document, and local command checks. It does not require a GitHub Actions run.

Use this mode for local experiments, early implementation work, and repositories without remote CI.

### `delivery`

Runs the local checks and additionally requires:

- a GitHub Actions run for the current HEAD;
- `completed` status and `success` conclusion;
- no skipped, failed, or cancelled core build/test steps;
- delivery reports that do not contradict the current SHA or CI result.

Use this mode for review-ready or externally delivered work.

## Decisions returned by the hooks

| Decision | Meaning |
|---|---|
| `allow` | The requested operation or completion is permitted. |
| `deny` | The operation is blocked. |
| `force_ask` | The operation requires explicit human confirmation. |
| `continue` | The agent may not stop yet because verification is incomplete or failed. |

## Commands currently blocked

The default guard denies examples such as:

```text
git push --force
git push --force-with-lease
git reset --hard
git clean -fd
git commit -am
git commit --no-verify
LEFTHOOK=0 ...
... || true
... 2>/dev/null
gh pr merge
gh pr ready
git push origin main
```

It also protects the local rigor ledger, verification evidence files, `.agents/`, and `verification-contract.json` from unapproved modification.

## Project layout

```text
.
├── .agents/verification-contract.json
├── .github/workflows/ci.yml
├── hooks.json
├── install.mjs
├── uninstall.mjs
├── plugin.json
├── rules/
├── scripts/
├── templates/
├── tests/
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## Development

```bash
npm ci
npm test
npm run check
```

The test suite includes process-level drills for dangerous-command blocking, contract tampering, secret redaction, skipped-test detection, stop-gate behavior, and portable installation.

## Security model and limitations

Rigor Guard is a defense-in-depth tool, not an operating-system sandbox.

- Command blocking is pattern-based and should be combined with repository permissions, branch protection, least-privilege credentials, and CI rules.
- The local ledger improves auditability but cannot defend against a user or process with unrestricted access to the same machine.
- Remote verification depends on the GitHub CLI and the correctness of the target repository's workflow configuration.
- Hook payload formats can change as Antigravity evolves; compatibility reports are welcome.

Please report security concerns according to [SECURITY.md](SECURITY.md).

## Contributing

Bug reports, compatibility findings, new guard patterns, and additional process-level drills are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT License. See [LICENSE](LICENSE).
