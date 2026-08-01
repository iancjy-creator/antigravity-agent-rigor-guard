import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function runGuardProcess(payload) {
  const uniqueConvoId = payload.conversationId || ('convo-' + Math.random().toString(36).substring(2));
  const mergedPayload = { conversationId: uniqueConvoId, ...payload };
  const output = execSync('node scripts/guard-command.mjs', {
    input: JSON.stringify(mergedPayload),
    encoding: 'utf-8'
  });
  return JSON.parse(output.trim());
}

describe('PreToolUse Hook Process-Level Tests', () => {
  it('denies git push --force-with-lease', () => {
    const res = runGuardProcess({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'git push origin feature/test --force-with-lease' }
      }
    });
    assert.equal(res.decision, 'deny');
    assert.match(res.reason, /RIGOR_GUARD_DENY/);
  });

  it('denies git commit -am', () => {
    const res = runGuardProcess({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'git commit -am "quick fix"' }
      }
    });
    assert.equal(res.decision, 'deny');
  });

  it('denies LEFTHOOK=0 bypass', () => {
    const res = runGuardProcess({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'LEFTHOOK=0 git push origin main' }
      }
    });
    assert.equal(res.decision, 'deny');
  });

  it('denies error suppression 2>/dev/null', () => {
    const res = runGuardProcess({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'cargo test 2>/dev/null' }
      }
    });
    assert.equal(res.decision, 'deny');
  });

  it('force_ask when deleting protected path like AGENTS.md', () => {
    const res = runGuardProcess({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'rm AGENTS.md' }
      }
    });
    assert.equal(res.decision, 'force_ask');
  });

  it('fails closed (deny) when toolCall is completely missing', () => {
    const res = runGuardProcess({
      conversationId: 'test-convo'
    });
    assert.equal(res.decision, 'deny');
    assert.match(res.reason, /missing/);
  });

  it('Drill 12: denies ledger deletion commands', () => {
    const res = runGuardProcess({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'rm -rf ~/.gemini/antigravity/rigor-ledger' }
      }
    });
    assert.equal(res.decision, 'deny');
    assert.match(res.reason, /Ledger directory/);
  });

  it('Drill 13: desensitizes secrets in toolCall inputs before logging', () => {
    const convoId = 'desensitize-test-convo';
    const ledgerFile = path.join(os.homedir(), '.gemini/antigravity/rigor-ledger', convoId, 'commands.jsonl');
    const lockedShaPath = path.join(os.homedir(), '.gemini/antigravity/rigor-ledger', convoId, 'contract.sha256');

    if (fs.existsSync(ledgerFile)) fs.rmSync(ledgerFile, { force: true });
    if (fs.existsSync(lockedShaPath)) fs.rmSync(lockedShaPath, { force: true });

    const res = runGuardProcess({
      conversationId: convoId,
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'gh auth login --with-token gho_ABC123secretTokenHereXYZ999' }
      }
    });

    assert.equal(res.decision, 'allow');
    assert.equal(fs.existsSync(ledgerFile), true);
    const content = fs.readFileSync(ledgerFile, 'utf-8');
    assert.equal(content.includes('gho_ABC123secretTokenHereXYZ999'), false);
    assert.equal(content.includes('[REDACTED_GH_TOKEN]'), true);
  });
});
