import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function verifyLocal(cwd = process.cwd(), contract = {}) {
  // Try loading contract from workspace if empty
  if (!contract.verificationCommands) {
    const contractPath = path.join(cwd, '.agents/verification-contract.json');
    if (fs.existsSync(contractPath)) {
      try {
        contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));
      } catch {
        // Ignored
      }
    }
  }

  let commands = contract.verificationCommands;

  if (!commands || commands.length === 0) {
    if (fs.existsSync(path.join(cwd, 'src-tauri/Cargo.toml'))) {
      commands = [
        'cargo fmt --manifest-path src-tauri/Cargo.toml --check',
        'cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings',
        'cargo test --manifest-path src-tauri/Cargo.toml',
        'npx tsc --noEmit',
        'npm run build'
      ];
    } else if (fs.existsSync(path.join(cwd, 'package.json'))) {
      commands = ['npm test'];
    } else {
      commands = [];
    }
  }

  const results = [];
  let allSuccess = true;

  for (const cmd of commands) {
    try {
      execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf-8' });
      results.push({ command: cmd, success: true });
    } catch (err) {
      allSuccess = false;
      results.push({
        command: cmd,
        success: false,
        output: err.stdout || err.stderr || err.message
      });
      break; // Stop on first error
    }
  }

  return {
    success: allSuccess,
    results,
    reason: allSuccess ? '' : `Local verification failed on: ${results.filter(r => !r.success).map(r => r.command).join(', ')}`
  };
}

if (process.argv[1] && process.argv[1].endsWith('verify-local.mjs')) {
  const res = verifyLocal();
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.success ? 0 : 1);
}
