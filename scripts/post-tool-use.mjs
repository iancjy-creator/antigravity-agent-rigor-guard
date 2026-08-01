import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function recordPostToolUse(input) {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const conversationId = input.conversationId || 'default-session';
  const stepIdx = input.stepIdx;
  const error = input.error || '';

  const ledgerDir = path.join(os.homedir(), '.gemini/antigravity/rigor-ledger', conversationId);
  const commandsFile = path.join(ledgerDir, 'commands.jsonl');

  if (fs.existsSync(commandsFile)) {
    try {
      const lines = fs.readFileSync(commandsFile, 'utf-8').trim().split('\n');
      const updatedLines = lines.map(line => {
        if (!line) return '';
        const entry = JSON.parse(line);
        if (entry.toolCall && entry.toolCall.stepIdx === stepIdx) {
          entry.error = error;
          entry.endTime = new Date().toISOString();
          entry.status = error ? 'failure' : 'success';
        }
        return JSON.stringify(entry);
      });
      fs.writeFileSync(commandsFile, updatedLines.filter(Boolean).join('\n') + '\n');
    } catch {
      // Ignore write errors to prevent blocking the post-tool execution
    }
  }

  return {};
}

if (process.argv[1] && process.argv[1].endsWith('post-tool-use.mjs')) {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (raw) {
      const input = JSON.parse(raw);
      const res = recordPostToolUse(input);
      console.log(JSON.stringify(res));
    } else {
      console.log(JSON.stringify({}));
    }
  } catch {
    console.log(JSON.stringify({}));
  }
}
