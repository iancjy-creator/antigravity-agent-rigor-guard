import fs from 'node:fs';
import path from 'node:path';

export function verifyDocumentTask(cwd = process.cwd()) {
  const issues = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'target') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (file.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          // Check for placeholders
          if (/TODO|FIXME|\[placeholder\]|lorem ipsum/i.test(line)) {
            // Allow lines in AGENTS.md or templates or reports that are describing rules or code comments
            if (fullPath.includes('AGENTS.md') || fullPath.includes('templates/') || fullPath.includes('rules/')) {
              return;
            }
            issues.push({
              file: path.relative(cwd, fullPath),
              line: index + 1,
              content: line.trim()
            });
          }
        });
      }
    }
  };

  walk(cwd);

  if (issues.length > 0) {
    return {
      success: false,
      issues,
      reason: `Found document placeholders: ${issues.map(i => `${i.file}:${i.line} (${i.content})`).join('; ')}`
    };
  }

  return { success: true, reason: '' };
}

if (process.argv[1] && process.argv[1].endsWith('verify-document-task.mjs')) {
  const res = verifyDocumentTask();
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.success ? 0 : 1);
}
