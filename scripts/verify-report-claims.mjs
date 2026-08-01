import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

function runGh(args, cwd) {
  return execFileSync('gh', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, PAGER: 'cat' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

export function verifyReportClaims(cwd = process.cwd(), reportGlob = 'docs/deliverables/*.md', remoteInfo = {}) {
  // If remoteInfo is empty, dynamically query git/gh
  let headSha = remoteInfo.headSha;
  let parentSha = '';
  let ciConclusion = remoteInfo.runInfo?.conclusion;

  if (!headSha) {
    try {
      headSha = execSync('git --no-pager rev-parse HEAD', { cwd, encoding: 'utf-8', env: { ...process.env, PAGER: 'cat' } }).trim();
      parentSha = execSync('git --no-pager rev-parse HEAD~1', { cwd, encoding: 'utf-8', env: { ...process.env, PAGER: 'cat' } }).trim();
    } catch {
      // Ignore if not a git repo
    }
  }

  if (!ciConclusion && headSha) {
    try {
      const branch = execSync('git --no-pager branch --show-current', { cwd, encoding: 'utf-8', env: { ...process.env, PAGER: 'cat' } }).trim();
      const runsRaw = runGh(['run', 'list', '--branch', branch, '--limit', '5', '--json', 'headSha,conclusion'], cwd);
      const runs = JSON.parse(runsRaw);
      const match = runs.find(r => r.headSha === headSha || (parentSha && r.headSha === parentSha));
      if (match) {
        ciConclusion = match.conclusion;
      }
    } catch {
      // Ignore
    }
  }

  // Find report files
  const reportFiles = [];
  const searchDirs = ['docs/deliverables', 'docs/audits', 'docs/product', 'docs'];

  for (const dir of searchDirs) {
    const fullDir = path.join(cwd, dir);
    if (fs.existsSync(fullDir)) {
      const files = fs.readdirSync(fullDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          reportFiles.push(path.join(fullDir, file));
        }
      }
    }
  }

  if (fs.existsSync(path.join(cwd, 'README.md'))) {
    reportFiles.push(path.join(cwd, 'README.md'));
  }

  if (reportFiles.length === 0) {
    return {
      success: true,
      reason: 'No report files found to check.'
    };
  }

  const forbiddenClaims = [
    '100%',
    '彻底修复',
    '全部完成',
    '全部通过',
    '全部就绪',
    'CI PASS',
    '零错误',
    '成功推送'
  ];

  for (const reportPath of reportFiles) {
    const content = fs.readFileSync(reportPath, 'utf-8');

    // Parse YAML frontmatter if present
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match) {
      const yaml = match[1];
      const frontmatter = {};
      yaml.split('\n').forEach(line => {
        const idx = line.indexOf(':');
        if (idx !== -1) {
          const key = line.substring(0, idx).trim();
          const val = line.substring(idx + 1).trim();
          frontmatter[key] = val;
        }
      });

      if (frontmatter.remote_head && headSha) {
        const matchesCurrent = frontmatter.remote_head === headSha || headSha.startsWith(frontmatter.remote_head);
        const matchesParent = parentSha && (frontmatter.remote_head === parentSha || parentSha.startsWith(frontmatter.remote_head));

        if (!matchesCurrent && !matchesParent) {
          return {
            success: false,
            file: reportPath,
            reason: `RIGOR_GATE_FAILED: Report remote_head (${frontmatter.remote_head}) does not match current local Head SHA (${headSha}) or parent SHA (${parentSha}).`
          };
        }
      }

      if (frontmatter.ci_conclusion && frontmatter.ci_conclusion !== 'success' && ciConclusion !== 'success') {
        for (const claim of forbiddenClaims) {
          if (content.includes(claim)) {
            return {
              success: false,
              file: reportPath,
              reason: `RIGOR_GATE_FAILED: Report contains completion claim '${claim}' while CI conclusion is not success.`
            };
          }
        }
      }
    }
  }

  return {
    success: true,
    reason: ''
  };
}

if (process.argv[1] && process.argv[1].endsWith('verify-report-claims.mjs')) {
  const result = verifyReportClaims();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}
