/**
 * Artifact path resolution (Finetuna 1.1 / D12 Option A).
 *
 * Checkout: state/results/benchmark + Modelfile under process.cwd()
 * Installed (entry under node_modules): state/results/benchmark under ~/.finetuna/
 *   Modelfile stays in cwd (user-facing editable artifact)
 * Override data dir anytime with FINETUNA_DIR.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const STATE_NAME = '.finetuna-state.json';
const RESULTS_NAME = 'finetuna-results.json';
const BENCHMARK_NAME = 'finetuna-benchmark.md';
const MODELFILE_NAME = 'Modelfile-finetuna';

/** True when the CLI entry was resolved from a package install (global/local node_modules). */
export function detectInstalled(entryPath = process.argv[1], env = process.env) {
  if (env.FINETUNA_FORCE_INSTALLED === '1' || env.FINETUNA_FORCE_INSTALLED === 'true') return true;
  const p = String(entryPath || '').replace(/\\/g, '/');
  return /(?:^|\/)node_modules\//.test(p);
}

/**
 * @param {{
 *   cwd?: string,
 *   env?: NodeJS.ProcessEnv,
 *   entryPath?: string,
 *   homedir?: string,
 * }} [opts]
 */
export function resolveFinetunaPaths({
  cwd = process.cwd(),
  env = process.env,
  entryPath = process.argv[1],
  homedir = os.homedir(),
} = {}) {
  const installed = detectInstalled(entryPath, env);
  const forced = String(env.FINETUNA_DIR || '').trim();
  const dataDir = forced
    ? path.resolve(forced)
    : installed
      ? path.join(homedir, '.finetuna')
      : path.resolve(cwd);

  const modelfilePath = path.join(path.resolve(cwd), MODELFILE_NAME);

  return {
    installed,
    dataDir,
    stateFile: path.join(dataDir, STATE_NAME),
    resultsFile: path.join(dataDir, RESULTS_NAME),
    benchmarkFile: path.join(dataDir, BENCHMARK_NAME),
    modelfilePath,
    usingSeparateDataDir: path.resolve(dataDir) !== path.resolve(cwd),
  };
}

/** Ensure the data directory exists (no-op if it is cwd and already exists). */
export function ensureDataDir(paths) {
  if (!paths?.dataDir) return;
  fs.mkdirSync(paths.dataDir, { recursive: true });
}

/** Package root (parent of lib/). Useful for diagnostics. */
export function packageRootFromHere(metaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
}
