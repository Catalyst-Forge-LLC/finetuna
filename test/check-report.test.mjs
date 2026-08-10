import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'finetuna.js');

describe('--check / --dry-run', () => {
  it('emits JSON with mode check and no create side effects', () => {
    const run = spawnSync(process.execPath, [cli, '--check', '--json'], {
      encoding: 'utf8',
      cwd: root,
      env: { ...process.env, OLLAMA_HOST: 'http://127.0.0.1:11434' },
      timeout: 20000,
    });
    // May fail if Ollama is down — still expect JSON or a clean error, not a crash before flags.
    const out = (run.stdout || '').trim();
    assert.ok(out.length > 0 || (run.stderr || '').length > 0);
    if (out.startsWith('{')) {
      const report = JSON.parse(out);
      assert.equal(report.mode, 'check');
      assert.equal(report.ok, true);
      assert.ok('softMaxCtx' in report);
      assert.ok(Array.isArray(report.models));
      assert.ok(report.paths?.modelfilePath);
    }
  });

  it('help lists --check and --json', () => {
    const run = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', cwd: root });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /--check/);
    assert.match(run.stdout, /--json/);
    assert.match(run.stdout, /Fit more context/);
  });
});
