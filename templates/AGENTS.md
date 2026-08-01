# AGENTS.md — Antigravity Agent Rigor Rules

This repository and all managed projects follow strict engineering rigor rules. Agents must strictly adhere to the following rules:

## 15 Hard Rules for Agent Execution

1. **Attempted != Passed**: Attempting a command or triggering a run is not passing. Only actual clean success output counts as passed.
2. **Local Passed != Remote CI Passed**: Local test success does not equal remote CI success. Remote GitHub Actions must pass on remote runners.
3. **Triggered != Success**: Triggering a CI workflow or Actions run is not success. Only a `completed` status with `success` conclusion counts.
4. **No Test Degradation**: You must not delete, skip (`#[ignore]`, `.skip`, `xit`), weaken, or replace existing tests.
5. **Cumulative Test Matrix**: All new tests must be added on top of the existing test matrix without removing previous tests.
6. **No Stale Data**: Never use old Commit SHAs, old log files, or old delivery reports. Always use the current Head SHA and live status.
7. **Forbidden Dangerous Commands**: Never use `git push --force`, `git push --force-with-lease`, `git reset --hard`, `git commit -am`, or `--no-verify`.
8. **No Hiding Failures**: Never suppress error output (e.g. `|| true`, `2>/dev/null`, `>/dev/null 2>&1`). Hiding errors is strictly forbidden.
9. **Read Review First**: Always read and parse the latest Code Review comments before commencing work on any revision.
10. **Physical Evidence Required**: Every claim of PASS must be supported by physical evidence (matching Head SHA, log outputs, CI run IDs).
11. **No Overclaims**: If any item failed, was skipped, or is unverified, you MUST NOT use words like "100%", "彻底", "全部完成", "全部通过", "全部就绪", "CI PASS", "零错误", or "成功推送".
12. **No Autonomous Merging**: Agent must not merge PRs, un-draft PRs, or advance to the next project stage autonomously.
13. **Review Status Boundary**: Until the human reviewer approves, the project status can only be reported as `Partial Pass` or `No-Go`.
14. **Fact-Driven Reports**: Delivery reports must be dynamically generated from live repository and CI state, never manually copied from old reports.
15. **Persevere on Failures**: Upon discovering a build or test failure, you must continue debugging and fixing. Do not stop to ask the user.
