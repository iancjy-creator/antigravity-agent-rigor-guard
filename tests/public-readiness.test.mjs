import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyCodeTask } from '../scripts/verify-code-task.mjs';

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('Public release readiness', () => {
  it('installs with generated portable hook paths', () => {
    const installDir = makeTempDir('rigor-guard-install-');
    try {
      execFileSync(process.execPath, ['install.mjs'], {
        cwd: process.cwd(),
        env: { ...process.env, RIGOR_GUARD_PLUGIN_DIR: installDir },
        encoding: 'utf-8'
      });

      const hooksPath = path.join(installDir, 'hooks.json');
      assert.equal(fs.existsSync(hooksPath), true);

      const hooksText = fs.readFileSync(hooksPath, 'utf-8');
      assert.equal(hooksText.includes('__RIGOR_GUARD_PLUGIN_DIR__'), false);
      assert.equal(hooksText.includes('/Users/'), false);
      assert.equal(hooksText.includes(installDir), true);
      assert.equal(fs.existsSync(path.join(installDir, 'scripts', 'guard-command.mjs')), true);
    } finally {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
  });

  it('does not flag disabled-test text stored inside fixture strings', () => {
    const fixtureDir = makeTempDir('rigor-guard-code-scan-');
    try {
      fs.mkdirSync(path.join(fixtureDir, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(fixtureDir, 'tests', 'fixture.test.mjs'),
        "const sample = 'test.skip(\\\"example\\\", () => {})';\n"
      );

      const result = verifyCodeTask(fixtureDir);
      assert.equal(result.success, true);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('flags an actual focused or skipped test declaration', () => {
    const fixtureDir = makeTempDir('rigor-guard-code-scan-');
    try {
      fs.mkdirSync(path.join(fixtureDir, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(fixtureDir, 'tests', 'unsafe.test.mjs'),
        "test.skip('example', () => {});\n"
      );

      const result = verifyCodeTask(fixtureDir);
      assert.equal(result.success, false);
      assert.equal(result.issues.length, 1);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
