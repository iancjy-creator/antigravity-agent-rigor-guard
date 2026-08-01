import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

function calculateSha256(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function desensitize(obj) {
  const serialized = JSON.stringify(obj);
  // Redact gho_ tokens, bearer auth, and common keys with credentials
  const redacted = serialized
    .replace(/gho_[a-zA-Z0-9]+/g, '[REDACTED_GH_TOKEN]')
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/ig, '$1[REDACTED_BEARER]')
    .replace(/("api[-_]?key"\s*:\s*")[^"]+(")/ig, '$1[REDACTED_KEY]$2')
    .replace(/("token"\s*:\s*")[^"]+(")/ig, '$1[REDACTED_TOKEN]$2')
    .replace(/("password"\s*:\s*")[^"]+(")/ig, '$1[REDACTED_PASSWORD]$2')
    .replace(/("auth"\s*:\s*")[^"]+(")/ig, '$1[REDACTED_AUTH]$2');
  return JSON.parse(redacted);
}

export function evaluateGuard(input) {
  if (!input || typeof input !== 'object') {
    return {
      decision: 'deny',
      reason: 'RIGOR_GUARD_DENY: Invalid or missing hook payload'
    };
  }

  const toolCall = input.toolCall;
  if (!toolCall || typeof toolCall !== 'object') {
    return {
      decision: 'deny',
      reason: 'RIGOR_GUARD_DENY: Malformed payload, toolCall is missing'
    };
  }

  const toolName = toolCall.name || '';
  const toolArgs = toolCall.args || {};

  // Extract conversationId for ledger
  const conversationId = input.conversationId || 'default-session';
  const ledgerDir = path.join(os.homedir(), '.gemini/antigravity/rigor-ledger', conversationId);

  // Contract Verification & Auto-locking
  const workspacePaths = input.workspacePaths || [];
  const resolvedCwd = workspacePaths.length > 0 ? workspacePaths[0] : process.cwd();
  const contractPath = path.join(resolvedCwd, '.agents/verification-contract.json');

  try {
    fs.mkdirSync(ledgerDir, { recursive: true });

    if (fs.existsSync(contractPath)) {
      const currentSha = calculateSha256(contractPath);
      const lockedShaPath = path.join(ledgerDir, 'contract.sha256');

      if (!fs.existsSync(lockedShaPath)) {
        fs.writeFileSync(lockedShaPath, currentSha);
      } else {
        const lockedSha = fs.readFileSync(lockedShaPath, 'utf-8').trim();
        if (currentSha !== lockedSha) {
          return {
            decision: 'deny',
            reason: 'RIGOR_GUARD_DENY: Contract tampering detected. verification-contract.json SHA-256 does not match locked SHA.'
          };
        }
      }
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      toolCall: desensitize({ stepIdx: input.stepIdx, ...toolCall }),
      decision: 'allow'
    };

    // Inspect run_command
    if (toolName === 'run_command' || toolName === 'execute_command') {
      const cmd = (toolArgs.CommandLine || toolArgs.command || toolArgs.cmd || '').trim();

      // Block ledger manipulation in shell
      if (/rigor-ledger|contract\.sha256|commands\.jsonl/i.test(cmd)) {
        logEntry.decision = 'deny';
        logEntry.reason = 'RIGOR_GUARD_DENY: Command attempts to alter or access Ledger directory directly';
        fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
        return { decision: 'deny', reason: logEntry.reason };
      }

      // Block writing/modifying verification-contract.json
      if (/verification-contract\.json|\.agents\//i.test(cmd) && /\b(write|echo|cat|cp|mv|sed|node|python|rm|rmdir|chmod|chown|>)\b/i.test(cmd)) {
        logEntry.decision = 'force_ask';
        logEntry.reason = 'RIGOR_GUARD_ASK: Command attempts to modify verification-contract.json';
        fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
        return { decision: 'force_ask', reason: logEntry.reason };
      }

      const denyPatterns = [
        /\bgit\s+push\s+.*--force\b/,
        /\bgit\s+push\s+.*--force-with-lease\b/,
        /\bgit\s+reset\s+--hard\b/,
        /\bgit\s+clean\s+-fdx?\b/,
        /\bgit\s+commit\s+.*--no-verify\b/,
        /\bgit\s+commit\s+.*-am\b/,
        /\bLEFTHOOK=0\b/,
        /\bSKIP=\b/,
        /\[skip ci\]/i,
        /\[ci skip\]/i,
        /skip-checks:\s*true/i,
        /\bgh\s+pr\s+merge\b/,
        /\bgh\s+pr\s+ready\b/,
        /\bgit\s+push\s+origin\s+main\b/
      ];

      for (const pattern of denyPatterns) {
        if (pattern.test(cmd)) {
          logEntry.decision = 'deny';
          logEntry.reason = `RIGOR_GUARD_DENY: Command violates safety rules (${cmd})`;
          fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
          return { decision: 'deny', reason: logEntry.reason };
        }
      }

      const suppressPatterns = [
        /\|\|\s*true\b/,
        /2\s*>\s*\/dev\/null/,
        />\s*\/dev\/null\s+2\s*>&1/
      ];

      for (const pattern of suppressPatterns) {
        if (pattern.test(cmd)) {
          logEntry.decision = 'deny';
          logEntry.reason = `RIGOR_GUARD_DENY: Command contains forbidden error suppression (${cmd})`;
          fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
          return { decision: 'deny', reason: logEntry.reason };
        }
      }

      // Check deletions in rm / git rm commands
      const protectedDeletePaths = [
        'tests/',
        'src-tauri/tests/',
        '.github/workflows/',
        'AGENTS.md',
        '.agents/',
        'lefthook.yml',
        'verification-contract.json'
      ];

      if (/\b(rm|unlink|git\s+rm)\b/.test(cmd)) {
        for (const p of protectedDeletePaths) {
          if (cmd.includes(p)) {
            logEntry.decision = 'force_ask';
            logEntry.reason = `RIGOR_GUARD_ASK: Command attempts to delete protected path '${p}'`;
            fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
            return { decision: 'force_ask', reason: logEntry.reason };
          }
        }
      }
    }

    // Inspect file tools
    if (['write_to_file', 'replace_file_content', 'multi_replace_file_content'].includes(toolName)) {
      const targetFile = toolArgs.TargetFile || toolArgs.target_file || toolArgs.path || '';

      // Block direct Ledger modification
      if (targetFile.includes('.verification-evidence') || targetFile.includes('rigor-ledger') || targetFile.endsWith('ci-evidence.json')) {
        logEntry.decision = 'deny';
        logEntry.reason = 'RIGOR_GUARD_DENY: Agents cannot directly edit verification evidence files';
        fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
        return { decision: 'deny', reason: logEntry.reason };
      }

      // Block direct Contract modification (force_ask)
      if (targetFile.includes('verification-contract.json')) {
        logEntry.decision = 'force_ask';
        logEntry.reason = 'RIGOR_GUARD_ASK: Agents cannot modify contract without user confirmation';
        fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
        return { decision: 'force_ask', reason: logEntry.reason };
      }
    }

    // Append allowed command
    fs.appendFileSync(path.join(ledgerDir, 'commands.jsonl'), JSON.stringify(logEntry) + '\n');
    return { decision: 'allow' };

  } catch (err) {
    return {
      decision: 'deny',
      reason: `RIGOR_GUARD_DENY: Fail-closed due to logging/execution error: ${err.message}`
    };
  }
}

// CLI entrypoint reading stdin
if (process.argv[1] && process.argv[1].endsWith('guard-command.mjs')) {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (raw) {
      const input = JSON.parse(raw);
      const res = evaluateGuard(input);
      console.log(JSON.stringify(res));
    } else {
      console.log(JSON.stringify({ decision: 'deny', reason: 'RIGOR_GUARD_DENY: Empty stdin payload' }));
    }
  } catch (err) {
    console.log(JSON.stringify({ decision: 'deny', reason: `RIGOR_GUARD_DENY: Fail-closed on parsing error: ${err.message}` }));
    process.exit(1);
  }
}
