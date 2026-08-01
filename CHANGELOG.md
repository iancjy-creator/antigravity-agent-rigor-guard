# Changelog

All notable changes to Antigravity Rigor Guard are documented here.

The project follows semantic versioning.

## [Unreleased]

### Added

- Portable hook installation with generated absolute paths.
- Public English and Simplified Chinese documentation.
- MIT license, contribution guide, and security policy.
- Installation and scanner regression tests.
- Node.js 20 and 22 CI coverage.

### Changed

- Tightened disabled-test and test-preservation matching to reduce false positives from fixture strings.
- Expanded package metadata and verification scripts.

### Removed

- Internal project delivery material and developer-specific absolute paths from the release branch.

## [1.0.0] - 2026-08-01

### Added

- `PreToolUse`, `PostToolUse`, and `Stop` hook integration.
- Dangerous Git and shell command blocking.
- Contract SHA-256 locking and evidence-ledger protection.
- Secret redaction for common credential patterns.
- Test deletion and test weakening detection.
- Local verification-command execution.
- GitHub Actions HEAD verification.
- Delivery-report and transcript-claim auditing.
- Process-level failure drills.
