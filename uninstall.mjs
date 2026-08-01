import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const pluginDir = path.resolve(
  process.env.RIGOR_GUARD_PLUGIN_DIR ||
    path.join(os.homedir(), '.gemini', 'config', 'plugins', 'rigor-guard')
);

if (!fs.existsSync(pluginDir)) {
  console.log(`Rigor Guard is not installed at: ${pluginDir}`);
  process.exit(0);
}

fs.rmSync(pluginDir, { recursive: true, force: true });
console.log(`Removed Rigor Guard from: ${pluginDir}`);
