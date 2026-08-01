# Security Policy

Antigravity Rigor Guard operates around command execution, verification evidence, and agent completion decisions. Security reports are taken seriously.

## Supported versions

| Version | Supported |
|---|---|
| 1.x | Yes |
| Earlier development snapshots | No |

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting or repository security-advisory flow when available.

If private reporting is not available, contact the repository owner through the GitHub profile before sharing technical details. Do not place credentials, exploit steps, private logs, or bypass details in a public issue.

Useful information includes:

- affected version or commit;
- operating system and Node.js version;
- Antigravity hook type and a minimized payload;
- the expected guard decision;
- the observed decision;
- whether the issue permits command bypass, evidence tampering, secret exposure, or premature completion.

## Scope

Examples of in-scope reports:

- a dangerous command that bypasses the configured guard;
- modification or deletion of the ledger without detection;
- secret values written without redaction;
- a malformed payload that unexpectedly fails open;
- a Stop gate that allows completion without required evidence;
- path injection or command injection in generated hook configuration.

General feature requests and non-security false positives should be filed as normal issues.

## Disclosure

Please allow reasonable time for validation and remediation before public disclosure. Credit will be provided when requested and appropriate.
