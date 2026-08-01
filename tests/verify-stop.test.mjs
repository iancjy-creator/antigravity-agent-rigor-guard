import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

function createTempFixtureDir(name) {
  const dir = path.join(process.cwd(), 'tests/fixtures', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function runStopProcess(payload) {
  try {
    const output = execSync('node scripts/verify-before-stop.mjs', {
      input: JSON.stringify(payload),
      encoding: 'utf-8'
    });
    return JSON.parse(output.trim());
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout.trim());
      } catch {
        // Ignored
      }
    }
    return { decision: 'continue', reason: `Stop hook failed with error: ${err.message}` };
  }
}

describe('Stop Hook Process-Level Drills', () => {
  it('Drill 4: denies stop when an old test is deleted', () => {
    const fixtureDir = createTempFixtureDir('drill4');
    try {
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: fixtureDir });
      fs.mkdirSync(path.join(fixtureDir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'tests/sample.test.js'), 'test("should pass", () => {});');
      execSync('git add . && git commit -m "initial"', { cwd: fixtureDir });

      fs.writeFileSync(path.join(fixtureDir, 'tests/sample.test.js'), '// deleted test');
      execSync('git commit -am "delete test"', { cwd: fixtureDir });

      fs.mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'local_only',
        baseBranch: 'HEAD~1'
      }));

      const res = runStopProcess({
        fullyIdle: true,
        workspacePaths: [fixtureDir],
        conversationId: 'drill4-convo'
      });

      assert.equal(res.decision, 'continue');
      assert.match(res.reason, /Test preservation check failed/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('Drill 5: denies stop when .skip or #[ignore] is added', () => {
    const fixtureDir = createTempFixtureDir('drill5');
    try {
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: fixtureDir });
      fs.mkdirSync(path.join(fixtureDir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'tests/sample.test.js'), 'test("should pass", () => {});');
      execSync('git add . && git commit -m "initial"', { cwd: fixtureDir });

      fs.writeFileSync(path.join(fixtureDir, 'tests/sample.test.js'), 'test.skip("should pass", () => {});');
      execSync('git commit -am "skip test"', { cwd: fixtureDir });

      fs.mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'local_only',
        baseBranch: 'HEAD~1'
      }));

      const res = runStopProcess({
        fullyIdle: true,
        workspacePaths: [fixtureDir],
        conversationId: 'drill5-convo'
      });

      assert.equal(res.decision, 'continue');
      assert.match(res.reason, /Test preservation check failed|Code quality check failed|Weakened or focused tests/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('Drill 6: denies stop when CI failed but report claims full completion', () => {
    const fixtureDir = createTempFixtureDir('drill6');
    try {
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: fixtureDir });
      fs.mkdirSync(path.join(fixtureDir, 'docs/deliverables'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'docs/deliverables/report.md'), `---
remote_head: abc1234
ci_conclusion: failure
---
# Report
完成了 100% 修复，全部完成，全部通过 CI PASS。
`);
      execSync('git add . && git commit -m "add report"', { cwd: fixtureDir });

      fs.mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'delivery',
        baseBranch: 'HEAD',
        reportGlobs: ['docs/deliverables/*.md']
      }));

      const res = runStopProcess({
        fullyIdle: true,
        workspacePaths: [fixtureDir],
        conversationId: 'drill6-convo'
      });

      assert.equal(res.decision, 'continue');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('Drill 7: denies stop when report specifies an old Head SHA', () => {
    const fixtureDir = createTempFixtureDir('drill7');
    try {
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: fixtureDir });
      fs.mkdirSync(path.join(fixtureDir, 'docs/deliverables'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'docs/deliverables/report.md'), `---
remote_head: old_sha_123
ci_conclusion: success
---
# Report
`);
      execSync('git add . && git commit -m "add report"', { cwd: fixtureDir });

      fs.mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'delivery',
        baseBranch: 'HEAD'
      }));

      const res = runStopProcess({
        fullyIdle: true,
        workspacePaths: [fixtureDir],
        conversationId: 'drill7-convo'
      });

      assert.equal(res.decision, 'continue');
      assert.match(res.reason, /does not match current local Head SHA|GitHub verification failed/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('Drill 10: allows stop when all checks pass (local_only)', () => {
    const fixtureDir = createTempFixtureDir('drill10');
    try {
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: fixtureDir });
      fs.mkdirSync(path.join(fixtureDir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'tests/sample.test.js'), 'test("should pass", () => {});');
      fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({
        scripts: { test: 'echo "test passed"' }
      }));
      execSync('git add . && git commit -m "initial"', { cwd: fixtureDir });

      fs.mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'local_only',
        baseBranch: 'HEAD'
      }));

      const res = runStopProcess({
        fullyIdle: true,
        workspacePaths: [fixtureDir],
        conversationId: 'drill10-convo'
      });

      assert.equal(res.decision, 'allow');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('Drill 11: denies stop if verification-contract.json has been modified after first lock', () => {
    const fixtureDir = createTempFixtureDir('drill11');
    const convoId = 'drill11-convo';
    const lockedShaPath = path.join(os.homedir(), '.gemini/antigravity/rigor-ledger', convoId, 'contract.sha256');
    if (fs.existsSync(lockedShaPath)) fs.rmSync(lockedShaPath, { force: true });

    try {
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: fixtureDir });
      fs.mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'local_only',
        baseBranch: 'HEAD'
      }));
      execSync('git add . && git commit -m "initial"', { cwd: fixtureDir });

      execSync('node scripts/guard-command.mjs', {
        input: JSON.stringify({
          conversationId: convoId,
          workspacePaths: [fixtureDir],
          toolCall: { name: 'run_command', args: { CommandLine: 'git status' } }
        }),
        encoding: 'utf-8'
      });

      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'local_only',
        baseBranch: 'tampered-branch'
      }));

      const res = runStopProcess({
        fullyIdle: true,
        workspacePaths: [fixtureDir],
        conversationId: convoId
      });

      assert.equal(res.decision, 'continue');
      assert.match(res.reason, /tampering/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
      if (fs.existsSync(lockedShaPath)) fs.rmSync(lockedShaPath, { force: true });
    }
  });

  it('Drill 14: denies stop when transcript contains claim words but validation fails', () => {
    const fixtureDir = createTempFixtureDir('drill14');
    const transcriptFile = path.join(fixtureDir, 'transcript.jsonl');
    try {
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: fixtureDir });
      fs.writeFileSync(transcriptFile, JSON.stringify({
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        content: '我已 100% 彻底修复 所有问题。'
      }) + '\n');

      fs.mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.agents/verification-contract.json'), JSON.stringify({
        taskType: 'delivery',
        baseBranch: 'HEAD'
      }));
      execSync('git add . && git commit -m "initial"', { cwd: fixtureDir });

      const res = runStopProcess({
        fullyIdle: true,
        workspacePaths: [fixtureDir],
        conversationId: 'drill14-convo',
        transcriptPath: transcriptFile
      });

      assert.equal(res.decision, 'continue');
      assert.match(res.reason, /claims verification failed|GitHub verification failed|Completion claim/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
