# Contributing to Antigravity Rigor Guard

Contributions are welcome, especially compatibility reports, new process-level drills, safer command-detection rules, and improvements to verification reliability.

## Before opening a change

1. Search existing issues and pull requests.
2. Keep the change focused on one behavior.
3. Add or update a process-level test for every guard or verifier change.
4. Do not weaken, skip, or remove existing tests.
5. Do not include private repository names, local absolute paths, access tokens, logs containing credentials, or internal delivery reports.

## Development setup

```bash
git clone https://github.com/iancjy-creator/antigravity-agent-rigor-guard.git
cd antigravity-agent-rigor-guard
npm ci
npm run check
```

Node.js 20 and 22 are tested in CI.

## Pull request expectations

A pull request should include:

- a concise problem statement;
- the behavior before and after the change;
- tests that reproduce the original failure or prove the new behavior;
- any Antigravity hook payload assumptions;
- compatibility notes for macOS, Linux, or Windows when relevant.

Please keep pull requests in draft state until the test suite passes and the implementation is ready for review.

## Guard-rule changes

Command blocking is security-sensitive. New patterns should:

- target a clear unsafe behavior;
- avoid broad matches that block normal development;
- include an allowed-case test when false positives are plausible;
- return `force_ask` rather than `deny` when explicit human approval is sufficient.

## Verification changes

Verification logic should fail closed when evidence is missing or malformed, but it should not claim that an external system failed when the system was never checked. Error messages should identify the missing evidence or failed command.

## Security reports

Do not open a public issue for a vulnerability that exposes credentials, permits evidence tampering, or bypasses a verification gate. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contribution may be distributed under the MIT License used by this project.
