import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { detectInstalled, resolveFinetunaPaths } from '../lib/paths.js';

describe('detectInstalled', () => {
  it('is false for a checkout entry path', () => {
    assert.equal(detectInstalled('/Users/me/src/finetuna/finetuna.js', {}), false);
  });

  it('is true under node_modules', () => {
    assert.equal(
      detectInstalled('/Users/me/.local/share/pnpm/global/5/node_modules/finetuna/finetuna.js', {}),
      true,
    );
    assert.equal(detectInstalled('C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\finetuna\\finetuna.js', {}), true);
  });

  it('honors FINETUNA_FORCE_INSTALLED', () => {
    assert.equal(detectInstalled('/tmp/finetuna.js', { FINETUNA_FORCE_INSTALLED: '1' }), true);
  });
});

describe('resolveFinetunaPaths', () => {
  const homedir = '/home/tester';
  const cwd = '/work/project';

  it('keeps state in cwd for checkout', () => {
    const p = resolveFinetunaPaths({
      cwd,
      homedir,
      entryPath: path.join(cwd, 'finetuna.js'),
      env: {},
    });
    assert.equal(p.installed, false);
    assert.equal(p.dataDir, path.resolve(cwd));
    assert.equal(p.stateFile, path.join(path.resolve(cwd), '.finetuna-state.json'));
    assert.equal(p.modelfilePath, path.join(path.resolve(cwd), 'Modelfile-finetuna'));
    assert.equal(p.usingSeparateDataDir, false);
  });

  it('uses ~/.finetuna for installed mode; Modelfile stays in cwd', () => {
    const entry = path.join(homedir, 'node_modules', 'finetuna', 'finetuna.js');
    const p = resolveFinetunaPaths({
      cwd,
      homedir,
      entryPath: entry,
      env: {},
    });
    assert.equal(p.installed, true);
    assert.equal(p.dataDir, path.join(homedir, '.finetuna'));
    assert.equal(p.stateFile, path.join(homedir, '.finetuna', '.finetuna-state.json'));
    assert.equal(p.resultsFile, path.join(homedir, '.finetuna', 'finetuna-results.json'));
    assert.equal(p.benchmarkFile, path.join(homedir, '.finetuna', 'finetuna-benchmark.md'));
    assert.equal(p.modelfilePath, path.join(path.resolve(cwd), 'Modelfile-finetuna'));
    assert.equal(p.usingSeparateDataDir, true);
  });

  it('FINETUNA_DIR overrides data dir', () => {
    const p = resolveFinetunaPaths({
      cwd,
      homedir,
      entryPath: path.join(cwd, 'finetuna.js'),
      env: { FINETUNA_DIR: '/custom/data' },
    });
    assert.equal(p.dataDir, path.resolve('/custom/data'));
    assert.equal(p.stateFile, path.join(path.resolve('/custom/data'), '.finetuna-state.json'));
    assert.equal(p.modelfilePath, path.join(path.resolve(cwd), 'Modelfile-finetuna'));
  });

  it('default home path matches os.homedir pattern', () => {
    const p = resolveFinetunaPaths({
      cwd: os.tmpdir(),
      homedir: os.homedir(),
      entryPath: path.join(os.homedir(), '.npm', 'node_modules', 'finetuna', 'finetuna.js'),
      env: {},
    });
    assert.equal(p.dataDir, path.join(os.homedir(), '.finetuna'));
  });
});
