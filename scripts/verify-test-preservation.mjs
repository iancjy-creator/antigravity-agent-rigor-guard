import { execFileSync } from 'node:child_process';

const JS_TEST_FILE = /(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i;
const RUST_TEST_FILE = /(^|\/)tests?\/.*\.rs$|\.rs$/i;
const TEST_DECLARATION = /^\s*(?:test|it|describe)\s*\(/;
const DISABLED_JS_TEST = /^\s*(?:test|it|describe)\.(?:skip|only)\s*\(/;
const DISABLED_JS_ALIAS = /^\s*(?:xit|xtest)\s*\(/;
const RUST_TEST_ATTRIBUTE = /^\s*#\[(?:tokio::)?test\]/;
const DISABLED_RUST_TEST = /^\s*#\[ignore(?:\([^\]]*\))?\]/;
const RUST_TEST_FUNCTION = /^\s*(?:pub\s+)?fn\s+test_\w+/;
const SAFE_GIT_REF = /^[A-Za-z0-9._~^\/-]+$/;

function runDiff(cwd, baseBranch) {
  if (!SAFE_GIT_REF.test(baseBranch)) {
    throw new Error(`Unsafe baseBranch value: ${baseBranch}`);
  }

  const isDirectRef = baseBranch.startsWith('HEAD') || /^[0-9a-f]{7,40}$/i.test(baseBranch);
  const candidateRefs = isDirectRef
    ? [baseBranch]
    : [`origin/${baseBranch}`, baseBranch, 'HEAD~1'];

  for (const ref of [...new Set(candidateRefs)]) {
    try {
      return execFileSync(
        'git',
        ['--no-pager', 'diff', '-U2', `${ref}...HEAD`],
        {
          cwd,
          encoding: 'utf-8',
          env: { ...process.env, PAGER: 'cat' },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );
    } catch {
      // Try the next comparison strategy.
    }
  }
  return '';
}

function isTestFile(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  return JS_TEST_FILE.test(normalized) || RUST_TEST_FILE.test(normalized);
}

export function verifyTestPreservation(cwd = process.cwd(), baseBranch = 'main') {
  try {
    const diff = runDiff(cwd, baseBranch);
    const deletedTests = [];
    const weakenedTests = [];
    const deletedFiles = [];

    let currentFile = '';
    for (const line of diff.split('\n')) {
      if (line.startsWith('--- a/')) {
        currentFile = line.substring(6);
        continue;
      }

      if (line.startsWith('+++ /dev/null')) {
        if (isTestFile(currentFile)) deletedFiles.push(currentFile);
        continue;
      }

      if (!isTestFile(currentFile)) continue;

      if (line.startsWith('-') && !line.startsWith('---')) {
        const removed = line.substring(1);
        if (
          TEST_DECLARATION.test(removed) ||
          RUST_TEST_ATTRIBUTE.test(removed) ||
          RUST_TEST_FUNCTION.test(removed)
        ) {
          deletedTests.push({ file: currentFile, snippet: removed.trim() });
        }
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        const added = line.substring(1);
        if (
          DISABLED_JS_TEST.test(added) ||
          DISABLED_JS_ALIAS.test(added) ||
          DISABLED_RUST_TEST.test(added)
        ) {
          weakenedTests.push({ file: currentFile, snippet: added.trim() });
        }
      }
    }

    if (deletedFiles.length || deletedTests.length || weakenedTests.length) {
      const reasons = [];
      if (deletedFiles.length) reasons.push(`Deleted test files: ${deletedFiles.join(', ')}`);
      if (deletedTests.length) {
        reasons.push(`Deleted tests: ${deletedTests.map((test) => `${test.file}:${test.snippet}`).join('; ')}`);
      }
      if (weakenedTests.length) {
        reasons.push(
          `Weakened or focused tests: ${weakenedTests
            .map((test) => `${test.file}:${test.snippet}`)
            .join('; ')}`
        );
      }

      return {
        success: false,
        deletedFiles,
        deletedTests,
        weakenedTests,
        reason: reasons.join(' | ')
      };
    }

    return {
      success: true,
      deletedFiles: [],
      deletedTests: [],
      weakenedTests: [],
      reason: ''
    };
  } catch (error) {
    return {
      success: false,
      reason: `Verification script failed: ${error.message}`
    };
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-test-preservation.mjs')) {
  const result = verifyTestPreservation();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}
