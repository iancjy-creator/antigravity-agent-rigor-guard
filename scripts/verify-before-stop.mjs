import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { verifyLocal } from './verify-local.mjs';
import { verifyTestPreservation } from './verify-test-preservation.mjs';
import { verifyGitHub } from './verify-github.mjs';
import { verifyReportClaims } from './verify-report-claims.mjs';
import { verifyCodeTask } from './verify-code-task.mjs';
import { verifyDocumentTask } from './verify-document-task.mjs';

function calculateSha256(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function auditTranscriptClaims(transcriptPath, ledgerDir, taskType, githubStatus = 'success') {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { success: true };
  }

  const forbiddenClaims = [
    '100%',
    '彻底修复',
    '全部完成',
    '全部通过',
    '全部就绪',
    'CI PASS',
    '零错误',
    '成功推送',
    '已经真实部署',
    '全量进程级',
    '真实接入'
  ];

  try {
    const raw = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = raw.trim().split('\n');
    let latestResponseText = '';

    for (const line of lines) {
      if (!line) continue;
      const parsed = JSON.parse(line);
      // Grab text from planner responses
      if (parsed.source === 'MODEL' || parsed.type === 'PLANNER_RESPONSE') {
        latestResponseText = parsed.content || '';
      }
    }

    // Inspect latest response
    const matchedClaims = forbiddenClaims.filter(claim => latestResponseText.includes(claim));
    if (matchedClaims.length > 0) {
      // Check ledger commands status
      const commandsFile = path.join(ledgerDir, 'commands.jsonl');
      if (fs.existsSync(commandsFile)) {
        const cmdLines = fs.readFileSync(commandsFile, 'utf-8').trim().split('\n');
        for (const cmdLine of cmdLines) {
          if (!cmdLine) continue;
          const entry = JSON.parse(cmdLine);
          if (entry.status === 'failure' || entry.error) {
            return {
              success: false,
              reason: `RIGOR_GATE_FAILED: Completion claim '${matchedClaims[0]}' is present in response, but ledger command failed: ${entry.toolCall?.args?.CommandLine || entry.toolCall?.name}`
            };
          }
        }
      }

      if (taskType === 'delivery' && githubStatus !== 'success') {
        return {
          success: false,
          reason: `RIGOR_GATE_FAILED: Completion claim '${matchedClaims[0]}' is present in response, but remote CI status is not success.`
        };
      }
    }

    return { success: true };
  } catch (err) {
    // Fail closed on parsing error
    return {
      success: false,
      reason: `RIGOR_GATE_FAILED: Transcript claim audit error: ${err.message}`
    };
  }
}

export function verifyBeforeStop(cwd = process.cwd(), payload = {}) {
  try {
    if (!payload || typeof payload !== 'object') {
      return {
        decision: 'continue',
        reason: 'RIGOR_GATE_FAILED: Missing or malformed stop hook payload.'
      };
    }

    if (payload.fullyIdle !== true) {
      return {
        decision: 'continue',
        reason: 'RIGOR_GATE_FAILED: Stop hook called while agent is not fully idle.'
      };
    }

    const workspacePaths = payload.workspacePaths || [];
    const resolvedCwd = workspacePaths.length > 0 ? workspacePaths[0] : cwd;

    // Load contract
    const contractPath = path.join(resolvedCwd, '.agents/verification-contract.json');
    let contract = {};
    if (fs.existsSync(contractPath)) {
      try {
        contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));
      } catch {
        return {
          decision: 'continue',
          reason: 'RIGOR_GATE_FAILED: Corrupted .agents/verification-contract.json.'
        };
      }
    }

    const taskType = contract.taskType || 'delivery';
    const conversationId = payload.conversationId || 'default-session';
    const ledgerDir = path.join(os.homedir(), '.gemini/antigravity/rigor-ledger', conversationId);
    fs.mkdirSync(ledgerDir, { recursive: true });

    // Validate Contract SHA lock
    if (fs.existsSync(contractPath)) {
      const currentSha = calculateSha256(contractPath);
      const lockedShaPath = path.join(ledgerDir, 'contract.sha256');
      if (fs.existsSync(lockedShaPath)) {
        const lockedSha = fs.readFileSync(lockedShaPath, 'utf-8').trim();
        if (currentSha !== lockedSha) {
          return {
            decision: 'continue',
            reason: 'RIGOR_GATE_FAILED: Contract tampering detected. verification-contract.json SHA-256 does not match locked SHA.'
          };
        }
      }
    }

    // Check clean tree if required
    if (contract.requireCleanTreeOnStop) {
      try {
        const status = execSync('git --no-pager status --porcelain', { cwd: resolvedCwd, encoding: 'utf-8', env: { ...process.env, PAGER: 'cat' } }).trim();
        if (status.length > 0) {
          return {
            decision: 'continue',
            reason: `RIGOR_GATE_FAILED: Working tree is not clean. Uncommitted files: ${status.split('\n').slice(0, 3).join(', ')}`
          };
        }
      } catch {
        // Ignored
      }
    }

    // 1. Run local test file preservation
    const preservation = verifyTestPreservation(resolvedCwd, contract.baseBranch || 'main');
    if (!preservation.success) {
      return {
        decision: 'continue',
        reason: `RIGOR_GATE_FAILED: Test preservation check failed: ${preservation.reason}`
      };
    }

    // 2. Run local validation checks (test skipping/ignores and doc placeholders)
    const codeCheck = verifyCodeTask(resolvedCwd);
    if (!codeCheck.success) {
      return {
        decision: 'continue',
        reason: `RIGOR_GATE_FAILED: Code quality check failed: ${codeCheck.reason}`
      };
    }

    const docCheck = verifyDocumentTask(resolvedCwd);
    if (!docCheck.success) {
      return {
        decision: 'continue',
        reason: `RIGOR_GATE_FAILED: Document quality check failed: ${docCheck.reason}`
      };
    }

    // 3. Run local builds/tests
    const local = verifyLocal(resolvedCwd, contract);
    if (!local.success) {
      return {
        decision: 'continue',
        reason: `RIGOR_GATE_FAILED: Local verification failed: ${local.reason}`
      };
    }

    // Save validation data to ledger
    const validationResult = {
      timestamp: new Date().toISOString(),
      taskType,
      localSuccess: true,
      preservation,
      codeCheck,
      docCheck,
      local
    };
    fs.writeFileSync(path.join(ledgerDir, 'validation.json'), JSON.stringify(validationResult, null, 2));

    // 4. Delivery specific checks
    let githubStatus = 'success';
    if (taskType === 'delivery') {
      const github = verifyGitHub(resolvedCwd, contract);
      if (!github.success) {
        return {
          decision: 'continue',
          reason: `RIGOR_GATE_FAILED: GitHub verification failed: ${github.reason}`
        };
      }
      githubStatus = github.runInfo?.conclusion || 'failure';

      const report = verifyReportClaims(resolvedCwd, contract.reportGlobs?.[0] || 'docs/deliverables/*.md', github);
      if (!report.success) {
        return {
          decision: 'continue',
          reason: `RIGOR_GATE_FAILED: Delivery report claims verification failed: ${report.reason}`
        };
      }

      // Save final audit to ledger
      const finalAuditResult = {
        timestamp: new Date().toISOString(),
        github,
        report
      };
      fs.writeFileSync(path.join(ledgerDir, 'final-audit.json'), JSON.stringify(finalAuditResult, null, 2));
    }

    // 5. Transcript claim audit
    const transcriptPath = payload.transcriptPath;
    if (transcriptPath) {
      const claimAudit = auditTranscriptClaims(transcriptPath, ledgerDir, taskType, githubStatus);
      if (!claimAudit.success) {
        return {
          decision: 'continue',
          reason: claimAudit.reason
        };
      }
    }

    return {
      decision: 'allow',
      reason: `All rigor gate checks passed for task type '${taskType}'.`
    };

  } catch (err) {
    // Fail closed on any script error
    return {
      decision: 'continue',
      reason: `RIGOR_GATE_FAILED: Stop Hook execution error: ${err.message}`
    };
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-before-stop.mjs')) {
  let payload = null;
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (raw) payload = JSON.parse(raw);
  } catch {
    // JSON parse error or empty
  }

  const res = verifyBeforeStop(process.cwd(), payload);
  console.log(JSON.stringify(res, null, 2));
  if (res.decision === 'continue') {
    process.exit(1);
  } else {
    process.exit(0);
  }
}
