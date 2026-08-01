import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(
  process.env.RIGOR_GUARD_PLUGIN_DIR ||
    path.join(os.homedir(), '.gemini', 'config', 'plugins', 'rigor-guard')
);
const hooksTemplatePath = path.join(sourceDir, 'hooks.json');

function validateHooks(hooks) {
  const namedHook = hooks['rigor-guard'];
  if (!namedHook) throw new Error('Missing top-level hook "rigor-guard"');
  if (!Array.isArray(namedHook.PreToolUse)) throw new Error('PreToolUse must be an array');
  if (!Array.isArray(namedHook.PostToolUse)) throw new Error('PostToolUse must be an array');
  if (!Array.isArray(namedHook.Stop)) throw new Error('Stop must be an array');

  const preToolHook = namedHook.PreToolUse[0];
  const postToolHook = namedHook.PostToolUse[0];
  if (!preToolHook || typeof preToolHook.matcher !== 'string' || !Array.isArray(preToolHook.hooks)) {
    throw new Error('PreToolUse must contain a string matcher and hooks array');
  }
  if (!postToolHook || typeof postToolHook.matcher !== 'string' || !Array.isArray(postToolHook.hooks)) {
    throw new Error('PostToolUse must contain a string matcher and hooks array');
  }
}

function replacePlaceholder(value) {
  if (typeof value === 'string') {
    return value.replaceAll('__RIGOR_GUARD_PLUGIN_DIR__', pluginDir);
  }
  if (Array.isArray(value)) return value.map(replacePlaceholder);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePlaceholder(item)]));
  }
  return value;
}

function copyRecursiveSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

try {
  const hooksTemplate = JSON.parse(fs.readFileSync(hooksTemplatePath, 'utf-8'));
  validateHooks(hooksTemplate);

  console.log(`Installing Antigravity Rigor Guard to: ${pluginDir}`);
  fs.mkdirSync(pluginDir, { recursive: true });

  for (const item of ['plugin.json', 'scripts', 'rules', 'templates']) {
    const src = path.join(sourceDir, item);
    if (fs.existsSync(src)) {
      copyRecursiveSync(src, path.join(pluginDir, item));
      console.log(`- Copied ${item}`);
    }
  }

  const renderedHooks = replacePlaceholder(hooksTemplate);
  validateHooks(renderedHooks);
  fs.writeFileSync(path.join(pluginDir, 'hooks.json'), `${JSON.stringify(renderedHooks, null, 2)}\n`);
  console.log('- Generated hooks.json with portable install paths');
  console.log('Rigor Guard installed successfully.');
} catch (error) {
  console.error(`Rigor Guard installation failed: ${error.message}`);
  process.exit(1);
}
