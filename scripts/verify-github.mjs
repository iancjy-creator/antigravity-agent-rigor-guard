import { execFileSync, execSync } from 'node:child_process';

function runGh(args, cwd) {
  return execFileSync('gh', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, PAGER: 'cat' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

export function verifyGitHub(cwd = process.cwd(), contract = {}) {
  try {
    const headSha = execSync('git --no-pager rev-parse HEAD', { cwd, encoding: 'utf-8', env: { ...process.env, PAGER: 'cat' } }).trim();
    const branch = execSync('git --no-pager branch --show-current', { cwd, encoding: 'utf-8', env: { ...process.env, PAGER: 'cat' } }).trim();

    // Fetch PR info via gh without shell interpolation.
    let prInfo = null;
    try {
      const prRaw = runGh(['pr', 'list', '--head', branch, '--json', 'number,isDraft,state,url,headRefOid'], cwd);
      const prs = JSON.parse(prRaw);
      if (prs.length > 0) {
        prInfo = prs[0];
      }
    } catch {
      // gh CLI might fail if offline or not logged in
    }

    if (contract.requireDraftPr && prInfo) {
      if (!prInfo.isDraft) {
        return {
          success: false,
          reason: `RIGOR_GATE_FAILED: PR #${prInfo.number} is not in Draft state.`
        };
      }
    }

    if (contract.forbidMerge && prInfo) {
      if (prInfo.state === 'MERGED') {
        return {
          success: false,
          reason: `RIGOR_GATE_FAILED: PR #${prInfo.number} has been merged.`
        };
      }
    }

    // Fetch Actions Run info
    let runs = [];
    try {
      const runsRaw = runGh(['run', 'list', '--branch', branch, '--limit', '5', '--json', 'databaseId,headSha,status,conclusion,workflowName,url'], cwd);
      runs = JSON.parse(runsRaw);
    } catch {
      // Fallback
    }

    const matchingRun = runs.find(r => r.headSha === headSha);

    if (!matchingRun) {
      return {
        success: false,
        headSha,
        branch,
        prInfo,
        reason: `RIGOR_GATE_FAILED: No GitHub Actions Run found for current Head SHA (${headSha.substring(0, 7)}).`
      };
    }

    if (matchingRun.status !== 'completed') {
      return {
        success: false,
        headSha,
        branch,
        runInfo: matchingRun,
        reason: `RIGOR_GATE_FAILED: GitHub Actions Run #${matchingRun.databaseId} status is '${matchingRun.status}' (expected 'completed').`
      };
    }

    if (matchingRun.conclusion !== 'success') {
      return {
        success: false,
        headSha,
        branch,
        runInfo: matchingRun,
        reason: `RIGOR_GATE_FAILED: GitHub Actions Run #${matchingRun.databaseId} conclusion is '${matchingRun.conclusion}' (expected 'success').`
      };
    }

    // Inspect Job steps
    let jobsInfo = [];
    try {
      const viewRaw = runGh(['run', 'view', String(matchingRun.databaseId), '--json', 'jobs'], cwd);
      const parsedView = JSON.parse(viewRaw);
      jobsInfo = parsedView.jobs || [];
    } catch {
      // Ignored
    }

    const skippedSteps = [];
    for (const job of jobsInfo) {
      for (const step of (job.steps || [])) {
        if (step.conclusion === 'skipped' || step.conclusion === 'failure' || step.conclusion === 'cancelled') {
          // Check if it's a required step
          const name = step.name.toLowerCase();
          if (name.includes('fmt') || name.includes('clippy') || name.includes('test') || name.includes('tsc') || name.includes('build')) {
            skippedSteps.push({ job: job.name, step: step.name, conclusion: step.conclusion });
          }
        }
      }
    }

    if (skippedSteps.length > 0) {
      return {
        success: false,
        headSha,
        branch,
        runInfo: matchingRun,
        skippedSteps,
        reason: `RIGOR_GATE_FAILED: Actions Run contains non-success core steps: ${skippedSteps.map(s => `${s.step} (${s.conclusion})`).join(', ')}`
      };
    }

    return {
      success: true,
      headSha,
      branch,
      prInfo,
      runInfo: matchingRun,
      jobsInfo,
      reason: ''
    };

  } catch (err) {
    return {
      success: false,
      reason: `GitHub verification error: ${err.message}`
    };
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-github.mjs')) {
  const res = verifyGitHub();
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.success ? 0 : 1);
}
