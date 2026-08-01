import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'coverage']);
const JS_TEST_FILE = /(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i;
const DISABLED_JS_TEST = /^\s*(?:test|it|describe)\.(?:skip|only)\s*\(/;
const DISABLED_JS_ALIAS = /^\s*(?:xit|xtest)\s*\(/;
const DISABLED_RUST_TEST = /^\s*#\[ignore(?:\([^\]]*\))?\]/;

export function verifyCodeTask(cwd = process.cwd()) {
  const issues = [];

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;

    for (const file of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(file)) continue;

      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const relativePath = path.relative(cwd, fullPath).replaceAll(path.sep, '/');
      const isRust = file.endsWith('.rs');
      const isJavaScriptTest = JS_TEST_FILE.test(relativePath);
      if (!isRust && !isJavaScriptTest) continue;

      const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        const disabled = isRust
          ? DISABLED_RUST_TEST.test(line)
          : DISABLED_JS_TEST.test(line) || DISABLED_JS_ALIAS.test(line);

        if (disabled) {
          issues.push({
            file: relativePath,
            line: index + 1,
            content: line.trim()
          });
        }
      });
    }
  };

  walk(cwd);

  if (issues.length > 0) {
    return {
      success: false,
      issues,
      reason: `Found disabled or focused tests: ${issues
        .map((issue) => `${issue.file}:${issue.line} (${issue.content})`)
        .join('; ')}`
    };
  }

  return { success: true, issues: [], reason: '' };
}

if (process.argv[1] && process.argv[1].endsWith('verify-code-task.mjs')) {
  const result = verifyCodeTask();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}
