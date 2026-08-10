import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isEmbeddingOnly,
  modelSupportsThinking,
  filterGenerativeModels,
} from '../lib/capabilities.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'finetuna.js');

describe('capabilities', () => {
  it('detects embedding-only vs generative', () => {
    assert.equal(isEmbeddingOnly({ capabilities: ['embedding'] }), true);
    assert.equal(isEmbeddingOnly({ capabilities: ['embedding', 'completion'] }), false);
    assert.equal(isEmbeddingOnly({ capabilities: ['completion'] }), false);
    assert.equal(isEmbeddingOnly(null), false);
  });

  it('detects thinking capability', () => {
    assert.equal(modelSupportsThinking({ capabilities: ['thinking', 'completion'] }), true);
    assert.equal(modelSupportsThinking({ capabilities: ['completion'] }), false);
  });

  it('filters embedding-only names from picker lists', () => {
    const tags = new Map([
      ['nomic-embed-text:latest', { capabilities: ['embedding'] }],
      ['llama3.2:latest', { capabilities: ['completion'] }],
      ['llama3.2', { capabilities: ['completion'] }],
    ]);
    const { kept, skipped } = filterGenerativeModels(
      ['nomic-embed-text:latest', 'llama3.2:latest'],
      tags,
    );
    assert.deepEqual(kept, ['llama3.2:latest']);
    assert.deepEqual(skipped, ['nomic-embed-text:latest']);
  });
});

describe('--verify / non-interactive flags', () => {
  it('help lists --verify, --name, --ctx', () => {
    const run = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', cwd: root });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /--verify/);
    assert.match(run.stdout, /--name/);
    assert.match(run.stdout, /--ctx/);
  });

  it('--name without --model exits non-zero', () => {
    const run = spawnSync(process.execPath, [cli, '--name', 'x-finetuna', '--ctx', '4096'], {
      encoding: 'utf8',
      cwd: root,
    });
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}\n${run.stderr}`, /requires.*--model/i);
  });
});
