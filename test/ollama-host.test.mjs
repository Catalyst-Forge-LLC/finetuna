import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLocalOllamaBase,
  ollamaHostLabel,
  parsePsModels,
  findPsModel,
  gpuFitFromPsModel,
  FIT_RATIO_DISCRETE,
  FIT_RATIO_UNIFIED,
} from '../lib/ollama-host.js';

describe('isLocalOllamaBase', () => {
  it('treats loopback hosts as local', () => {
    assert.equal(isLocalOllamaBase('http://127.0.0.1:11434'), true);
    assert.equal(isLocalOllamaBase('http://localhost:11434'), true);
    assert.equal(isLocalOllamaBase('http://[::1]:11434'), true);
    assert.equal(isLocalOllamaBase('127.0.0.1:11434'), true);
  });

  it('treats LAN / remote hosts as remote', () => {
    assert.equal(isLocalOllamaBase('http://192.168.1.10:11434'), false);
    assert.equal(isLocalOllamaBase('http://ollama.tailnet.ts.net'), false);
    assert.equal(isLocalOllamaBase('https://example.com:11434'), false);
  });
});

describe('ollamaHostLabel', () => {
  it('returns hostname for display', () => {
    assert.equal(ollamaHostLabel('http://192.168.1.10:11434'), '192.168.1.10');
    assert.equal(ollamaHostLabel('http://localhost:11434'), 'localhost');
  });
});

describe('parsePsModels / findPsModel', () => {
  it('normalizes size fields and finds by name', () => {
    const models = parsePsModels({
      models: [
        { name: 'gemma4-finetuna:latest', size: 1000, size_vram: 1000 },
        { model: 'other', size: 500, size_vram: 100 },
      ],
    });
    assert.equal(models.length, 2);
    assert.equal(models[0].sizeVram, 1000);
    assert.ok(findPsModel(models, 'gemma4-finetuna'));
    assert.ok(findPsModel(models, 'gemma4-finetuna:latest'));
    assert.equal(findPsModel(models, 'missing'), null);
  });
});

describe('gpuFitFromPsModel', () => {
  it('passes when size_vram === size (discrete)', () => {
    const fit = gpuFitFromPsModel({ size: 8_000_000_000, sizeVram: 8_000_000_000 });
    assert.equal(fit.ok, true);
    assert.equal(fit.reason, 'full');
    assert.ok(fit.ratio >= FIT_RATIO_DISCRETE);
  });

  it('fails partial offload on discrete GPU', () => {
    const fit = gpuFitFromPsModel({ size: 1000, sizeVram: 500 }, { unified: false });
    assert.equal(fit.ok, false);
    assert.equal(fit.reason, 'partial');
  });

  it('allows softer ratio on unified memory', () => {
    const fit = gpuFitFromPsModel({ size: 1000, sizeVram: 600 }, { unified: true });
    assert.equal(fit.ok, true);
    assert.ok(fit.ratio >= FIT_RATIO_UNIFIED);
  });

  it('fails cpu-only residency', () => {
    const fit = gpuFitFromPsModel({ size: 1000, sizeVram: 0 });
    assert.equal(fit.ok, false);
    assert.equal(fit.reason, 'cpu-only');
  });

  it('does not hard-fail when sizes are missing', () => {
    const fit = gpuFitFromPsModel({ size: null, sizeVram: null });
    assert.equal(fit.ok, true);
    assert.equal(fit.reason, 'unknown-size');
  });
});
