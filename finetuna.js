import enquirerPkg from 'enquirer';
const { prompt } = enquirerPkg;
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// https://grok.com/share/bGVnYWN5_c4d382dd-9452-4610-bff8-3cdbe9a4fb5d

// Simple CLI flag parser
function parseFlags() {
  const argv = process.argv.slice(2);
  const flags = {
    timeoutMs: process.env.FINETUNA_TIMEOUT ? parseInt(process.env.FINETUNA_TIMEOUT, 10) : 20000,
    genTimeoutMs: process.env.FINETUNA_GEN_TIMEOUT ? parseInt(process.env.FINETUNA_GEN_TIMEOUT, 10) : 60000,
    benchRepeats: process.env.BENCH_REPEATS ? parseInt(process.env.BENCH_REPEATS, 10) : 3,
    autoTune: false,
    verbose: false,
    skipBatch: false,
    skipCtx: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage: node finetuna.js [options]',
          '',
          'Options:',
          '  --timeout <ms>        Prompt-eval / API timeout (default: 20000)',
          '  --gen-timeout <ms>    Generation benchmark timeout (default: 60000)',
          '  --bench-repeats <N>   Benchmark repeats per candidate (default: 3)',
          '  --auto-tune           Skip auto-tune confirmation prompt',
          '  --skip-batch          Skip Phase 1 (num_batch sweep)',
          '  --skip-ctx            Skip Phase 2 (num_ctx sweep)',
          '  --verbose             Print raw ollama list / ollama ps output',
          '',
          'Environment variables (override defaults, flags take precedence):',
          '  OLLAMA_HOST           Ollama HTTP base URL (default http://127.0.0.1:11434)',
          '  FINETUNA_TIMEOUT      Same as --timeout',
          '  FINETUNA_GEN_TIMEOUT  Same as --gen-timeout',
          '  BENCH_REPEATS         Same as --bench-repeats',
        ].join('\n'),
      );
      process.exit(0);
    }
    const next = argv[i + 1];
    if (a === '--timeout' && next) {
      flags.timeoutMs = parseInt(next, 10) || flags.timeoutMs;
      i++;
      continue;
    }
    if (a.startsWith('--timeout=')) {
      flags.timeoutMs = parseInt(a.split('=')[1], 10) || flags.timeoutMs;
      continue;
    }
    if (a === '--gen-timeout' && next) {
      flags.genTimeoutMs = parseInt(next, 10) || flags.genTimeoutMs;
      i++;
      continue;
    }
    if (a.startsWith('--gen-timeout=')) {
      flags.genTimeoutMs = parseInt(a.split('=')[1], 10) || flags.genTimeoutMs;
      continue;
    }
    if (a === '--bench-repeats' && next) {
      flags.benchRepeats = parseInt(next, 10) || flags.benchRepeats;
      i++;
      continue;
    }
    if (a.startsWith('--bench-repeats=')) {
      flags.benchRepeats = parseInt(a.split('=')[1], 10) || flags.benchRepeats;
      continue;
    }
    if (a === '--auto-tune') {
      flags.autoTune = true;
      continue;
    }
    if (a === '--verbose') {
      flags.verbose = true;
      continue;
    }
    if (a === '--skip-batch') {
      flags.skipBatch = true;
      continue;
    }
    if (a === '--skip-ctx') {
      flags.skipCtx = true;
      continue;
    }
  }

  return flags;
}

const FLAGS = parseFlags();

/** Ollama HTTP API base (same env as Ollama CLI: host/port, default 127.0.0.1:11434). */
function getOllamaBase() {
  let raw = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').trim();
  raw = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  return raw;
}

const OLLAMA_BASE = getOllamaBase();

function createTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

// Validate model name to prevent command injection (ollama names: alphanumeric, dash, underscore, dot, colon)
function sanitizeName(name) {
  if (!/^[a-zA-Z0-9_:.-]+$/.test(name)) {
    throw new Error(`Invalid model name "${name}" — only letters, numbers, -, _, ., : are allowed.`);
  }
  return name;
}

const activeAbortControllers = new Set();
process.on('SIGINT', () => {
  console.log('\n\n👋 Interrupted — cleaning up...');
  for (const ac of activeAbortControllers) {
    try {
      ac.abort();
    } catch (_) {}
  }
  process.exit(130);
});

function detectVRAM() {
  try {
    const nvidia = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', { encoding: 'utf8' }).trim();
    const mib = parseInt(nvidia, 10);
    return Math.round(mib / 1024);
  } catch (e) {
    try {
      const rocm = execSync('rocm-smi --showmeminfo vram', { encoding: 'utf8', timeout: 8000 });
      const b = rocm.match(/VRAM Total Memory \(B\):\s*(\d+)/i);
      if (b) return Math.max(1, Math.round(parseInt(b[1], 10) / (1024 * 1024 * 1024)));
    } catch (eR) {
      /* no ROCm */
    }
    try {
      const ps = execSync('powershell -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1).AdapterRAM / 1GB"', {
        encoding: 'utf8',
      }).trim();
      const gb = Math.round(parseFloat(ps));
      return gb > 0 ? gb : null;
    } catch (e2) {
      return null;
    }
  }
}

/** Ascending context sizes offered in prompts (common Ollama / llama.cpp steps). */
const CONTEXT_TIERS = [4096, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304, 131072];

/**
 * Soft ceiling for the context picker from total VRAM (GB). Not model-specific; rough guide only.
 * Uses vramGB * 2048 (capped at 131072) so larger GPUs see larger preset steps before Custom.
 */
function maxSuggestedCtxFromVram(vramGB) {
  if (vramGB == null || vramGB < 1) return 65536;
  return Math.min(131072, Math.round(vramGB * 2048));
}

function contextTierShortLabel(n) {
  if (n <= 4096) return 'Fastest / low memory';
  if (n <= 8192) return 'Balanced (typical default)';
  if (n <= 12288) return 'High';
  if (n <= 16384) return 'Large';
  if (n <= 24576) return 'Very large';
  if (n <= 32768) return 'Heavy context';
  if (n <= 49152) return 'Very heavy';
  if (n <= 65536) return 'Monster context';
  if (n <= 98304) return 'Extreme';
  return 'Maximum tier';
}

function getContextOptions(vramGB) {
  const maxCtx = maxSuggestedCtxFromVram(vramGB);
  const opts = [];
  for (const t of CONTEXT_TIERS) {
    if (t > maxCtx) break;
    opts.push({ name: `${t}  – ${contextTierShortLabel(t)}`, value: t });
  }
  if (opts.length === 0) {
    opts.push({
      name: '4096  – Default (VRAM estimate low; use Custom if you need more)',
      value: 4096,
    });
  }
  opts.push({ name: 'Custom (any number you want)', value: 'custom' });
  return opts;
}

function unwrapChoice(choice) {
  if (choice === 'custom') return 'custom';
  if (choice && typeof choice === 'object' && Object.prototype.hasOwnProperty.call(choice, 'value')) return choice.value;
  const s = String(choice || '');
  const m = s.match(/\d+/);
  if (m) return parseInt(m[0], 10);
  return choice;
}

async function checkGPUFit(newName) {
  console.log('\n🔍 Testing GPU fit... 🐟');

  // Unload any previously loaded version so ollama ps reflects the NEW model config
  try {
    spawnSync('ollama', ['stop', newName], { timeout: 5000 });
  } catch (e) {
    /* may not be running */
  }
  await new Promise((r) => setTimeout(r, 1500));

  const loadAc = new AbortController();
  activeAbortControllers.add(loadAc);
  const loadBody = JSON.stringify({ model: newName, prompt: 'hi', stream: false, options: { num_predict: 1 } });
  const loadPromise = fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: loadBody,
    signal: loadAc.signal,
  }).finally(() => activeAbortControllers.delete(loadAc));

  // Poll ollama ps until the model appears (up to 60s)
  let psOutput = '';
  let found = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      psOutput = execSync('ollama ps', { encoding: 'utf8' });
    } catch (e) {
      continue;
    }
    // Match the NAME column exactly (first whitespace-delimited token on data rows)
    const psLines = psOutput.trim().split('\n');
    const matchedRow = psLines.slice(1).find((l) => l.trim().split(/\s+/)[0] === newName || l.trim().split(/\s+/)[0] === newName + ':latest');
    if (matchedRow) {
      found = true;
      break;
    }
    process.stdout.write(`   Waiting for model to load (${(attempt + 1) * 2}s)...\r`);
  }

  loadAc.abort();
  try {
    await loadPromise;
  } catch (_) {
    /* aborted or completed */
  }

  if (!found) {
    console.log('\n⚠️  Model did not appear in ollama ps after 60s.');
    return false;
  }

  if (FLAGS.verbose) {
    console.log('\n📊 ollama ps output:');
    console.log(psOutput);
  }

  const lines = psOutput.trim().split('\n');
  let isFullGPU = false;
  let processorInfo = 'unknown';

  for (let i = 1; i < lines.length; i++) {
    const rowName = lines[i].trim().split(/\s+/)[0];
    if (rowName === newName || rowName === newName + ':latest') {
      const match = lines[i].match(/(\d+%\/\d+% CPU\/GPU|100% GPU)/);
      processorInfo = match ? match[0] : 'unknown';
      isFullGPU = processorInfo.includes('100% GPU');
      break;
    }
  }

  if (isFullGPU) {
    console.log("✅ Perfect! Model is fully on GPU (100% GPU) — it's hooked! 🐟");
  } else {
    console.log(`⚠️  Not fully on GPU → ${processorInfo}`);
  }
  return isFullGPU;
}

async function runTestPromptWithSpeed(newName) {
  // Wrapper that prints the metrics for a single sample prompt.
  const metrics = await getSpeedMetrics(newName);
  if (!metrics.success) {
    console.log('⚠️  Could not measure speed (timeout or error). Falling back to simple run...');
    if (metrics.errMsg) console.log('   Error:', metrics.errMsg);
    return;
  }

  console.log('\n✅ Response:');
  if (metrics.output) console.log(metrics.output.trim());

  console.log('\n📊 Performance:');
  console.log(`   Tokens generated : ${metrics.tokensGenerated}`);
  console.log(`   Eval-only TPS    : ${metrics.tpsEval}`);
  console.log(`   Wall-clock TPS   : ${metrics.tpsWall}`);
  console.log(`   Total time       : ${metrics.totalTimeSec.toFixed(2)} seconds`);
}

// Longer prompt used for TTFT / prompt-eval benchmarking (num_batch matters here)
// ~600 tokens to give num_batch a real workout
const LONG_PROMPT = `You are Captain Finnegan "Fins" McTunasworth, the world's most dramatic fish chef, stand-up comedian, and self-proclaimed Tuna Whisperer. You have been summoned to the Grand Coliseum of Culinary Chaos to present your legendary recipe: "The Tuna Singularity Sandwich."

Begin with a theatrical entrance monologue where you address the audience (a mix of skeptical food critics, excited dolphins, and one very confused penguin). Explain why tuna is not merely a fish, but a lifestyle, a philosophy, and possibly a religion.

Then present the recipe in exhaustive detail:
- Start with the bread: it must be baked in a volcano, cooled by Arctic winds, and blessed by a retired sushi chef.
- The tuna itself must be line-caught during a full moon by someone humming the national anthem of Atlantis.
- Include at least five absurd ingredients: truffle dust harvested from a dragon's sneeze, mayo made from cloud extract, lettuce grown in zero gravity, pickles that have been personally insulted by Gordon Ramsay, and cheese aged in a submarine for exactly 1,000 leagues.
- Describe each cooking technique with made-up culinary terminology: "reverse sashimi flambé," "quantum poaching," "sous-vide in the fourth dimension," "cryo-grilling with emotional heat," and "the forbidden fold."
- The sandwich assembly must involve a 12-step process, each step more dramatic than the last, culminating in what you call "The Convergence" where all flavors achieve sentience.

After the recipe, deliver a passionate closing speech about how this sandwich will unite humanity, end all food debates forever, and possibly achieve faster-than-light travel. Sign off with your catchphrase.

Finally, provide detailed tasting notes as if reviewing a fine wine, but it is a sandwich. Discuss the mouthfeel, the "umami crescendo," the "textural symphony," and whether the sandwich made you cry (it did). Rate it on a scale of one to infinity. Include a fake quote from a celebrity endorsing the sandwich.

Remember: every sentence should be more absurd than the last. The goal is maximum theatrical energy. You are performing for the ages. This sandwich is your magnum opus. Do not hold back.`;

async function getSpeedMetrics(newName, timeoutMs = FLAGS.genTimeoutMs) {
  const body = { model: newName, prompt: 'Tell me a short, fun fact about AI.', stream: false, options: { num_predict: 50 } };
  function ollamaRunFallback(start) {
    const run = spawnSync('ollama', ['run', newName, 'Tell me a short, fun fact about AI. Answer in 20 words or less.'], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    const out = (run.stdout || '').trim();
    if (out) {
      return { success: true, output: out, tokensGenerated: 0, tpsEval: 'N/A', tpsWall: 'N/A', totalTimeSec: (Date.now() - start) / 1000 };
    }
    return { success: false, errMsg: 'No response from Ollama API' };
  }
  try {
    const start = Date.now();
    let res;
    try {
      res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: createTimeoutSignal(timeoutMs),
      });
    } catch {
      return ollamaRunFallback(start);
    }
    const end = Date.now();
    if (!res.ok) {
      return ollamaRunFallback(start);
    }
    const text = await res.text();
    if (!text) {
      return ollamaRunFallback(start);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, errMsg: 'Invalid JSON from Ollama API' };
    }
    const outputText = data.response || '';
    const tokensGenerated = data.eval_count || 0;
    const evalDurationMs = (data.eval_duration || 0) / 1_000_000;
    const totalTimeSec = (end - start) / 1000;
    const tpsEval = tokensGenerated && evalDurationMs ? (tokensGenerated / (evalDurationMs / 1000)).toFixed(1) : 'N/A';
    const tpsWall = tokensGenerated && totalTimeSec ? (tokensGenerated / totalTimeSec).toFixed(1) : 'N/A';

    return { success: true, output: outputText, tokensGenerated, tpsEval, tpsWall, totalTimeSec };
  } catch (err) {
    return { success: false, errMsg: err.message || String(err) };
  }
}

// Measures prompt-eval speed (TTFT) using a long prompt — this is what num_batch actually affects
async function getPromptEvalMetrics(newName, timeoutMs = FLAGS.timeoutMs) {
  const body = { model: newName, prompt: LONG_PROMPT, stream: false, options: { num_predict: 1 } };
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: createTimeoutSignal(timeoutMs),
    });
    if (!res.ok) {
      return { success: false, errMsg: `HTTP ${res.status}` };
    }
    const text = await res.text();
    if (!text) {
      return { success: false, errMsg: 'Empty response from Ollama API' };
    }
    const data = JSON.parse(text);
    const promptTokens = data.prompt_eval_count || 0;
    const promptDurationNs = data.prompt_eval_duration || 0;
    const promptDurationMs = promptDurationNs / 1_000_000;
    const promptTps = promptTokens && promptDurationMs ? (promptTokens / (promptDurationMs / 1000)).toFixed(1) : 'N/A';
    const ttftMs = promptDurationMs;

    return { success: true, promptTokens, promptDurationMs, promptTps, ttftMs };
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timed out' : err.message || String(err);
    return { success: false, errMsg: msg };
  }
}

// Benchmark prompt-eval / TTFT over N repeats
async function benchmarkPromptEval(newName, repeats = FLAGS.benchRepeats, label = '') {
  const results = [];
  for (let i = 0; i < repeats; i++) {
    process.stdout.write(`   ${label}Run ${i + 1}/${repeats}… `);
    const m = await getPromptEvalMetrics(newName);
    if (m.success && m.promptTps !== 'N/A') {
      const tps = parseFloat(m.promptTps);
      results.push(tps);
      console.log(`${tps.toFixed(1)} tok/s ingestion · ${m.ttftMs.toFixed(0)}ms to first token · ${m.promptTokens} prompt tokens`);
    } else {
      results.push(0);
      console.log('failed');
    }
    if (i < repeats - 1) await new Promise((r) => setTimeout(r, 500));
  }
  const valid = results.filter((r) => r > 0);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avg = valid.length ? sum / valid.length : 0;
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 0;
  console.log(`   ── min ${min.toFixed(1)} / avg ${avg.toFixed(1)} / max ${max.toFixed(1)} tok/s (prompt ingestion speed)`);
  return avg;
}

async function benchmarkModel(newName, repeats = FLAGS.benchRepeats, label = '') {
  const results = [];
  for (let i = 0; i < repeats; i++) {
    process.stdout.write(`   ${label}Run ${i + 1}/${repeats}… `);
    const m = await getSpeedMetrics(newName);
    if (m.success && m.tpsWall !== 'N/A') {
      const tps = parseFloat(m.tpsWall);
      results.push(tps);
      console.log(`${tps.toFixed(1)} t/s`);
    } else {
      results.push(0);
      console.log('failed');
    }
    if (i < repeats - 1) await new Promise((r) => setTimeout(r, 1000));
  }
  const valid = results.filter((r) => r > 0);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avg = valid.length ? sum / valid.length : 0;
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 0;
  console.log(`   ── min ${min.toFixed(1)} / avg ${avg.toFixed(1)} / max ${max.toFixed(1)} t/s`);
  return avg;
}

async function main() {
  console.log('\n🐟 Finetuna — The Ollama Model Tuner');
  console.log('=====================================\n');
  console.log("You can tune a guitar... but you can't tunafish! Let's fine-tune some models! 🐟\n");

  const vramGB = detectVRAM();
  if (vramGB) console.log(`🧠 Detected: ${vramGB} GB VRAM — nice rig!`);
  else
    console.log(
      '🧠 Could not auto-detect VRAM (tries NVIDIA nvidia-smi, AMD rocm-smi, then Windows WMI — Apple / some GPUs may need manual picks)',
    );
  if (FLAGS.verbose) console.log(`🔗 Ollama API base: ${OLLAMA_BASE}`);
  console.log('');

  // Fetch models
  let models = [];
  try {
    const output = execSync('ollama list', { encoding: 'utf8' });
    console.log('🐟 Diving into the school of models...\n');
    if (FLAGS.verbose) {
      console.log('--- Raw ollama list output ---');
      console.log(output);
      console.log('--- End raw output ---\n');
    }

    const lines = output.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const match = line.match(/^([^\s]+)/);
      if (match && match[1].includes(':')) models.push(match[1]);
    }
  } catch (err) {
    console.error('❌ Could not run "ollama list". Is Ollama running?');
    process.exit(1);
  }

  if (models.length === 0) {
    console.log('⚠️  No models found in the tank.');
    process.exit(1);
  }

  console.log(`Found ${models.length} model(s) swimming around!\n`);

  const { sourceModel } = await prompt([
    { type: 'select', name: 'sourceModel', message: 'Which model shall we season and release into the shoal? 🐟', choices: models },
  ]);
  const { newName: rawNewName } = await prompt([
    {
      type: 'input',
      name: 'newName',
      message: 'New model name (e.g. gemma4-fast):',
      initial: sourceModel.split(':')[0] + '-finetuna',
      validate: (i) => {
        if (!i || !i.trim()) return 'Name cannot be empty';
        if (!/^[a-zA-Z0-9_:.-]+$/.test(i.trim())) return 'Only letters, numbers, -, _, ., : are allowed';
        return true;
      },
    },
  ]);
  const newName = sanitizeName(rawNewName.trim());

  const ctxOptions = getContextOptions(vramGB);
  const { ctxChoice } = await prompt([
    { type: 'select', name: 'ctxChoice', message: 'Choose a context window size (num_ctx) — pick wisely, little tuna:', choices: ctxOptions },
  ]);

  const rawCtx = unwrapChoice(ctxChoice);
  let numCtx =
    rawCtx === 'custom'
      ? parseInt((await prompt([{ type: 'input', name: 'customCtx', message: 'Custom context size (any number):', initial: '8192' }])).customCtx, 10)
      : rawCtx;

  const { numBatch } = await prompt([{ type: 'input', name: 'numBatch', message: 'Batch size (num_batch) – higher = faster generation:', initial: '512' }]);
  const { numGpu } = await prompt([{ type: 'input', name: 'numGpu', message: 'GPU layers (num_gpu) – 999 = max possible:', initial: '999' }]);

  const vramComment = vramGB ? `Optimized for ${vramGB}GB VRAM (auto-detected)` : 'Optimized for your GPU';
  const modelfileContent = `FROM ${sourceModel}\n\n# ${vramComment}\nPARAMETER num_ctx ${numCtx}\nPARAMETER num_gpu ${numGpu}\nPARAMETER num_batch ${numBatch}\n`;

  const modelfilePath = path.join(process.cwd(), 'Modelfile-finetuna');
  fs.writeFileSync(modelfilePath, modelfileContent);
  console.log(`\n✅ Modelfile created at ${modelfilePath} — seasoned and ready!`);

  console.log(`\n🎣 Creating new model: ${newName} ...`);
  spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
  console.log(`\n🎉 Model "${newName}" created successfully! It’s a keeper! 🐟`);

  let fullGPU = false;
  let currentCtx = numCtx;
  let bestBatch = null;

  // After initial creation, offer optional auto-tune
  let autoTune = FLAGS.autoTune;
  if (!autoTune) {
    const r = await prompt([
      {
        type: 'confirm',
        name: 'autoTune',
        message: 'Would you like to auto-tune for maximum speed while staying 100% on GPU? 🐟',
        initial: false,
      },
    ]);
    autoTune = r.autoTune;
  }

  if (autoTune) {
    const defaultRepeats = FLAGS.benchRepeats;
    const { repeats } = await prompt([{ type: 'input', name: 'repeats', message: 'Benchmark repeats per candidate:', initial: String(defaultRepeats) }]);
    const repeatCount = parseInt(repeats, 10) || defaultRepeats;
    const currentBatch = parseInt(numBatch, 10) || 512;
    bestBatch = currentBatch;
    let bestCtx = currentCtx;
    const batchResults = [];
    const ctxResults = [];

    // ── Phase 1: num_batch sweep (measures prompt-eval / TTFT) ──
    if (!FLAGS.skipBatch) {
      console.log('  Phase 1: num_batch sweep (prompt-eval speed / TTFT)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  num_batch affects prompt ingestion, not token generation.');
      console.log('  Testing 50%–200% of your chosen batch in ~25% steps.\n');

      // 50%, 75%, 100%, 125%, 150%, 175%, 200%
      const batchCandidates = Array.from(
        new Set([
          Math.max(1, Math.round(currentBatch * 0.5)),
          Math.max(1, Math.round(currentBatch * 0.75)),
          currentBatch,
          Math.round(currentBatch * 1.25),
          Math.round(currentBatch * 1.5),
          Math.round(currentBatch * 1.75),
          currentBatch * 2,
        ]),
      ).sort((a, b) => a - b);

      console.log('   Candidates: ' + batchCandidates.join(', '));
      console.log('   Repeats: ' + repeatCount + '\n');

      for (let ci = 0; ci < batchCandidates.length; ci++) {
        const cand = batchCandidates[ci];
        console.log(`\n🐟 [${ci + 1}/${batchCandidates.length}] num_batch = ${cand}`);
        const content = `FROM ${sourceModel}\n\n# ${vramComment}\nPARAMETER num_ctx ${currentCtx}\nPARAMETER num_gpu ${numGpu}\nPARAMETER num_batch ${cand}\n`;
        fs.writeFileSync(modelfilePath, content);
        const createResult = spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
        if (createResult.status !== 0) {
          console.log('   ⚠️  Failed to create model — skipping');
          batchResults.push({ cand, avg: 0, gpu: false });
          continue;
        }

        const gpuOk = await checkGPUFit(newName);
        if (!gpuOk) {
          console.log(`   ⚠️  num_batch=${cand} doesn't fit 100% GPU — skipping`);
          batchResults.push({ cand, avg: 0, gpu: false });
          continue;
        }

        const avg = await benchmarkPromptEval(newName, repeatCount, `[batch=${cand}] `);
        batchResults.push({ cand, avg, gpu: true });
      }

      batchResults.sort((a, b) => b.avg - a.avg);
      console.log('\n┌──────────────────────────────────────────────────────────┐');
      console.log('│    🐟 Phase 1: num_batch Results (prompt eval t/s)       │');
      console.log('├──────────────┬────────────────┬──────────┬───────────────┤');
      console.log('│  num_batch   │  prompt eval   │  GPU fit │               │');
      console.log('│              │  avg t/s       │          │               │');
      console.log('├──────────────┼────────────────┼──────────┼───────────────┤');
      for (let i = 0; i < batchResults.length; i++) {
        const r = batchResults[i];
        const gpuStr = r.gpu ? '  100%  ' : '  ✗     ';
        const validResults = batchResults.filter((b) => b.gpu && b.avg > 0);
        validResults.sort((a, b) => b.avg - a.avg);
        const tag = validResults[0]?.cand === r.cand && r.gpu ? ' ◀ best' : r.cand === currentBatch ? ' (original)' : !r.gpu ? ' skipped' : '';
        console.log(`│  ${String(r.cand).padStart(10)} │ ${(r.avg > 0 ? r.avg.toFixed(1) : '—').padStart(14)} │ ${gpuStr} │ ${tag.padEnd(13)} │`);
      }
      console.log('└──────────────┴────────────────┴──────────┴───────────────┘');

      bestBatch = batchResults.filter((b) => b.gpu && b.avg > 0).sort((a, b) => b.avg - a.avg)[0]?.cand || currentBatch;
      if (bestBatch !== currentBatch) {
        console.log(`\n   ✅ Best batch size: ${bestBatch} (was ${currentBatch})`);
      } else {
        console.log(`\n   ✅ Original batch size ${currentBatch} confirmed as best.`);
      }
    } else {
      console.log('  Skipping Phase 1 (--skip-batch).');
    }

    if (!FLAGS.skipCtx) {
      // ── Phase 2: num_ctx sweep (measures generation TPS + GPU fit) ──
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  Phase 2: num_ctx sweep (generation TPS + GPU fit)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  num_ctx is the biggest lever for generation speed.');
      console.log("  Testing context sizes — skipping any that won't fit 100% GPU.\n");

      const { ctxGoal } = await prompt([
        {
          type: 'select',
          name: 'ctxGoal',
          message: 'What do you want to optimize for? 🐟',
          choices: [
            { name: 'max-context', message: 'Max context  — largest window that still fits 100% GPU' },
            { name: 'max-speed', message: 'Max speed    — fastest generation TPS at 100% GPU' },
          ],
        },
      ]);

      // Build context candidates: start from smallest, go up to double the chosen ctx
      const ctxCandidates = Array.from(new Set([4096, 8192, 12288, 16384, 24576, 32768, currentCtx].filter((c) => c <= currentCtx * 2 && c >= 2048))).sort(
        (a, b) => a - b,
      );

      console.log('   Strategy:   ' + (ctxGoal === 'max-context' ? 'Largest context that fits 100% GPU' : 'Fastest generation speed at 100% GPU'));
      console.log('   Candidates: ' + ctxCandidates.join(', '));
      console.log('   Repeats: ' + repeatCount);
      console.log('   Only candidates with 100% GPU offload will be kept.\n');

      for (let ci = 0; ci < ctxCandidates.length; ci++) {
        const cand = ctxCandidates[ci];
        console.log(`\n🐟 [${ci + 1}/${ctxCandidates.length}] num_ctx = ${cand}`);
        const content = `FROM ${sourceModel}\n\n# ${vramComment}\nPARAMETER num_ctx ${cand}\nPARAMETER num_gpu ${numGpu}\nPARAMETER num_batch ${bestBatch}\n`;
        fs.writeFileSync(modelfilePath, content);
        const createResult = spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
        if (createResult.status !== 0) {
          console.log('   ⚠️  Failed to create model — skipping');
          ctxResults.push({ cand, avg: 0, gpu: false });
          continue;
        }

        // Check GPU fit first
        const gpuOk = await checkGPUFit(newName);
        if (!gpuOk) {
          console.log(`   ⚠️  num_ctx=${cand} doesn't fit 100% GPU — bailing on remaining larger sizes`);
          ctxResults.push({ cand, avg: 0, gpu: false });
          // All larger ctx values will also fail, so skip them
          for (let ri = ci + 1; ri < ctxCandidates.length; ri++) {
            ctxResults.push({ cand: ctxCandidates[ri], avg: 0, gpu: false });
          }
          break;
        }

        const avg = await benchmarkModel(newName, repeatCount, `[ctx=${cand}] `);
        ctxResults.push({ cand, avg, gpu: true });
      }

      const ctxValid = ctxResults.filter((r) => r.gpu && r.avg > 0);

      // Sort table by TPS descending for display
      const ctxDisplay = [...ctxResults];
      const ctxValidSorted = [...ctxValid].sort((a, b) => b.avg - a.avg);

      // Pick winner based on strategy
      let bestCtxEntry;
      if (ctxGoal === 'max-context') {
        // Largest context that fits GPU (already sorted ascending, take last valid)
        bestCtxEntry = ctxValid.length > 0 ? ctxValid.reduce((a, b) => (b.cand > a.cand ? b : a)) : null;
      } else {
        // Fastest TPS
        bestCtxEntry = ctxValidSorted[0] || null;
      }

      console.log('\n┌──────────────────────────────────────────────────────────────┐');
      console.log('│    🐟 Phase 2: num_ctx Results (generation t/s)              │');
      console.log('│    Strategy: ' + (ctxGoal === 'max-context' ? 'maximize context window' : 'maximize generation speed').padEnd(46) + ' │');
      console.log('├──────────────┬────────────┬──────────┬───────────────────────┤');
      console.log('│   num_ctx    │  avg TPS   │  GPU fit │                       │');
      console.log('├──────────────┼────────────┼──────────┼───────────────────────┤');
      for (let i = 0; i < ctxDisplay.length; i++) {
        const r = ctxDisplay[i];
        const gpuStr = r.gpu ? '  100%  ' : '  ✗     ';
        let tag = '';
        if (bestCtxEntry && r.cand === bestCtxEntry.cand) tag = ' ◀ chosen';
        else if (r.cand === currentCtx) tag = ' (original)';
        else if (!r.gpu) tag = ' skipped';
        console.log(`│  ${String(r.cand).padStart(10)} │ ${(r.avg > 0 ? r.avg.toFixed(1) : '—').padStart(10)} │ ${gpuStr} │ ${tag.padEnd(21)} │`);
      }
      console.log('└──────────────┴────────────┴──────────┴───────────────────────┘');

      if (bestCtxEntry) {
        bestCtx = bestCtxEntry.cand;
        if (ctxGoal === 'max-context') {
          console.log(`\n   ✅ Largest 100% GPU context: ${bestCtx} (${bestCtxEntry.avg.toFixed(1)} t/s)`);
        } else {
          console.log(`\n   ✅ Fastest at 100% GPU: ${bestCtx} (${bestCtxEntry.avg.toFixed(1)} t/s)`);
        }
      } else {
        console.log('\n   ⚠️  No contexts fit 100% GPU — keeping original.');
        bestCtx = currentCtx;
      }
    } else {
      console.log('  Skipping Phase 2 (--skip-ctx).');
    }

    // ── Final: apply best settings ──
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🏁 Auto-tune complete — applying best settings');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   num_batch : ${currentBatch} → ${bestBatch}`);
    console.log(`   num_ctx   : ${currentCtx} → ${bestCtx}`);
    console.log(`   num_gpu   : ${numGpu}`);

    currentCtx = bestCtx;
    const finalContent = `FROM ${sourceModel}\n\n# ${vramComment} — auto-tuned by Finetuna 🐟\nPARAMETER num_ctx ${bestCtx}\nPARAMETER num_gpu ${numGpu}\nPARAMETER num_batch ${bestBatch}\n`;
    fs.writeFileSync(modelfilePath, finalContent);
    spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
    console.log('\n   ✅ Final model created with optimal settings!');

    // Write benchmark results to JSON log
    const resultsLog = {
      timestamp: new Date().toISOString(),
      model: newName,
      source: sourceModel,
      settings: { bestBatch, bestCtx, numGpu },
      batchResults,
      ctxResults,
    };
    const resultsPath = path.join(process.cwd(), 'finetuna-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(resultsLog, null, 2));
    console.log(`\n   💾 Results saved to finetuna-results.json`);
  }

  while (!fullGPU) {
    await runTestPromptWithSpeed(newName);
    fullGPU = await checkGPUFit(newName);

    if (!fullGPU) {
      const { reduce } = await prompt([
        { type: 'confirm', name: 'reduce', message: 'Would you like to drop the context window to get full GPU offload? 🐠', initial: true },
      ]);
      if (!reduce) break;

      const lowerOptions = getContextOptions(vramGB).filter((o) => o.value !== 'custom' && o.value < currentCtx);
      if (lowerOptions.length === 0) lowerOptions.push({ name: 'Custom (lower)', value: 'custom' });

      const { newCtxChoice } = await prompt([{ type: 'select', name: 'newCtxChoice', message: 'Pick a lower context size to try:', choices: lowerOptions }]);
      const rawNew = unwrapChoice(newCtxChoice);
      currentCtx =
        rawNew === 'custom'
          ? parseInt(
              (await prompt([{ type: 'input', name: 'custom', message: 'Custom context:', initial: String(Math.max(4096, currentCtx - 4096)) }])).custom,
              10,
            )
          : rawNew;

      console.log(`\n🔄 Recreating ${newName} with num_ctx = ${currentCtx} ...`);
      const fallbackBatch = bestBatch != null ? bestBatch : parseInt(numBatch, 10) || 512;
      const newContent = `FROM ${sourceModel}\n\n# ${vramComment}\nPARAMETER num_ctx ${currentCtx}\nPARAMETER num_gpu ${numGpu}\nPARAMETER num_batch ${fallbackBatch}\n`;
      fs.writeFileSync(modelfilePath, newContent);
      spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
      console.log('✅ Model recreated with lower context — back in the water!');
    } else {
      break;
    }
  }

  console.log(`\n🎉 Finetuna complete! Your model is perfectly seasoned and ready to swim. 🐟`);
  console.log(`   Run it anytime with: ollama run ${newName}`);
  console.log(`\nYour Modelfile is saved as "Modelfile-finetuna" — tweak it anytime!`);
}

main().catch((err) => {
  if (err.name === 'ExitPromptError') console.log('\n👋 Cancelled by user.');
  else console.error('\nError:', err.message);
});
