import Enquirer from 'enquirer';
import { createRequire } from 'module';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const colors = require('ansi-colors');

// High-contrast Enquirer palette (default cyan.dim placeholders are nearly invisible on dark terminals)
const enquirer = new Enquirer({
  styles: {
    primary: colors.whiteBright.bold,
    answered: colors.cyanBright,
    placeholder: colors.whiteBright,
    muted: colors.white,
    info: colors.cyanBright,
    pending: colors.whiteBright.bold,
    dark: colors.gray,
    disabled: colors.gray,
  },
});
const prompt = (questions) => enquirer.prompt(questions);

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
    openClaw: ['1', 'true', 'yes'].includes(String(process.env.FINETUNA_OPENCLAW || '').toLowerCase()),
    openClawAgent: false,
    /** null = auto-detect / benchmark; true/false = force */
    flashAttn: (() => {
      const v = String(process.env.FINETUNA_FLASH_ATTN || '').toLowerCase();
      if (v === '1' || v === 'true' || v === 'yes') return true;
      if (v === '0' || v === 'false' || v === 'no') return false;
      return null;
    })(),
    benchmarkReport: false,
    unload: false,
    reload: false,
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
          '  --openclaw            OpenClaw Modelfile preset (64K ctx default, gemma4 template, num_keep 64)',
          '  --openclaw-agent      Same as --openclaw with temperature 0.1 / top_k 20 (deterministic agents)',
          '  --no-openclaw         Turn off OpenClaw block even if FINETUNA_OPENCLAW is set',
          '  --flash-attn          Tag -flash naming + print OLLAMA_FLASH_ATTENTION setup tips',
          '  --no-flash-attn       Do not treat flash attention as enabled for naming/docs',
          '  --benchmark-report    Print markdown benchmark table (+ finetuna-benchmark.md)',
          '  --unload, --panic     Evict all loaded models from VRAM (keep_alive: 0)',
          '  --reload              Reload last model from .finetuna-state.json',
          '  --verbose             Print raw ollama list / ollama ps output',
          '',
          'Environment variables (override defaults, flags take precedence):',
          '  OLLAMA_HOST           Ollama HTTP base URL (default http://127.0.0.1:11434)',
          '  FINETUNA_OPENCLAW     If 1/true/yes, same as --openclaw (use --no-openclaw to force off)',
          '  FINETUNA_FLASH_ATTN   1/true or 0/false for flash naming/docs (flash is a server env, not Modelfile)',
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
    if (a === '--openclaw') {
      flags.openClaw = true;
      continue;
    }
    if (a === '--openclaw-agent') {
      flags.openClaw = true;
      flags.openClawAgent = true;
      continue;
    }
    if (a === '--no-openclaw') {
      flags.openClaw = false;
      continue;
    }
    if (a === '--flash-attn') {
      flags.flashAttn = true;
      continue;
    }
    if (a === '--no-flash-attn') {
      flags.flashAttn = false;
      continue;
    }
    if (a === '--benchmark-report') {
      flags.benchmarkReport = true;
      continue;
    }
    if (a === '--unload' || a === '--panic') {
      flags.unload = true;
      continue;
    }
    if (a === '--reload') {
      flags.reload = true;
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

/** Parse /api/generate body: single JSON or newline-delimited stream chunks. */
function parseGenerateResponseBody(text) {
  const t = (text || '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    let last = null;
    for (const line of t.split(/\n/)) {
      const s = line.trim();
      if (!s) continue;
      try {
        last = JSON.parse(s);
      } catch {
        /* skip bad lines */
      }
    }
    return last;
  }
}

const STATE_FILE = path.join(process.cwd(), '.finetuna-state.json');
const OPENCLAW_CTX_TIERS = [65536, 49152, 32768, 24576, 16384, 8192, 4096];

/** Extract eval_rate / prompt_eval_rate from Ollama generate JSON (with duration fallback). */
function ratesFromGenerateData(data) {
  if (!data) return { evalRate: null, promptEvalRate: null };
  let evalRate = data.eval_rate != null ? Number(data.eval_rate) : null;
  if (evalRate == null && data.eval_count && data.eval_duration) {
    evalRate = data.eval_count / (data.eval_duration / 1e9);
  }
  let promptEvalRate = data.prompt_eval_rate != null ? Number(data.prompt_eval_rate) : null;
  if (promptEvalRate == null && data.prompt_eval_count && data.prompt_eval_duration) {
    promptEvalRate = data.prompt_eval_count / (data.prompt_eval_duration / 1e9);
  }
  const fmt = (n) => (n != null && Number.isFinite(n) ? Number(n.toFixed(1)) : null);
  return { evalRate: fmt(evalRate), promptEvalRate: fmt(promptEvalRate) };
}

function formatRate(n) {
  return n != null && Number.isFinite(n) ? `${n.toFixed(1)} t/s` : 'N/A';
}

function ctxKLabel(numCtx) {
  if (numCtx >= 1024 && numCtx % 1024 === 0) return `${numCtx / 1024}k`;
  return String(numCtx);
}

function suggestModelName(baseName, numCtx, flashAttn) {
  const base = baseName.replace(/-ctx[\d.]+k(-flash)?$/i, '').replace(/-finetuna$/i, '');
  let name = `${base}-ctx${ctxKLabel(numCtx)}`;
  if (flashAttn) name += '-flash';
  return name;
}

function detectFlashAttnSupport() {
  try {
    const names = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    return names.some(
      (n) =>
        /\bRTX\s+(20|30|40|50)\d/i.test(n) ||
        /\b(Quadro\s+)?RTX\s+(4000|5000|6000|8000)/i.test(n) ||
        /\b(Tesla\s+)?(T4|A100|A10|L4|H100|V100|L40)\b/i.test(n),
    );
  } catch {
    return false;
  }
}

/** Flash attention is an Ollama *server* setting (OLLAMA_FLASH_ATTENTION), not a Modelfile PARAMETER. */
function isFlashAttnEnvEnabled() {
  const v = String(process.env.OLLAMA_FLASH_ATTENTION || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function printFlashAttnGuidance() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const lines = [
    '',
    'Flash attention is enabled on the Ollama *server*, not via Modelfile parameters',
    '(PARAMETER flash_attn is not valid — ollama create will reject it).',
    '',
    'Set OLLAMA_FLASH_ATTENTION=1 on the machine that runs Ollama, then restart Ollama:',
    '',
  ];

  if (isWin) {
    lines.push(
      '  Windows (quit Ollama from the tray, then relaunch):',
      '    setx OLLAMA_FLASH_ATTENTION 1',
      '',
      '  Or for this session only before starting ollama serve:',
      '    set OLLAMA_FLASH_ATTENTION=1',
      '',
    );
  } else if (isMac) {
    lines.push(
      '  macOS (then quit & relaunch the Ollama app):',
      '    launchctl setenv OLLAMA_FLASH_ATTENTION 1',
      '',
      '  Or for a terminal `ollama serve`:',
      '    export OLLAMA_FLASH_ATTENTION=1',
      '    ollama serve',
      '',
    );
  } else {
    lines.push(
      '  Linux — systemd (typical install; then restart the service):',
      '    sudo mkdir -p /etc/systemd/system/ollama.service.d',
      "    echo -e '[Service]\\nEnvironment=\"OLLAMA_FLASH_ATTENTION=1\"' | sudo tee /etc/systemd/system/ollama.service.d/flash.conf",
      '    sudo systemctl daemon-reload',
      '    sudo systemctl restart ollama',
      '',
      '  Linux — terminal `ollama serve` only:',
      '    export OLLAMA_FLASH_ATTENTION=1',
      '    ollama serve',
      '',
    );
  }

  lines.push('  FAQ: https://docs.ollama.com/faq', '');
  console.log(lines.join('\n'));
}

function queryGpuMemUsedMiB() {
  try {
    const raw = execSync('nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits', { encoding: 'utf8' }).trim();
    return parseInt(raw.split('\n')[0], 10);
  } catch {
    return null;
  }
}

function readFinetunaState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeFinetunaState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

async function listLoadedModelsHttp() {
  const res = await fetch(`${OLLAMA_BASE}/api/ps`);
  if (!res.ok) throw new Error(`GET /api/ps failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name || m.model).filter(Boolean);
}

async function evictModelFromVram(modelName) {
  await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName, prompt: '', keep_alive: 0 }),
    signal: createTimeoutSignal(15000),
  });
}

async function unloadLoadedModels() {
  console.log('\n🐟 Finetuna VRAM panic — evicting loaded models...\n');
  let models = [];
  try {
    models = await listLoadedModelsHttp();
  } catch (e) {
    try {
      const ps = execSync('ollama ps', { encoding: 'utf8' });
      models = ps
        .trim()
        .split('\n')
        .slice(1)
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean);
    } catch {
      console.error('Could not list loaded models:', e.message);
      process.exit(1);
    }
  }
  if (models.length === 0) {
    console.log('No models loaded in VRAM.');
    return;
  }
  console.log('Loaded:', models.join(', '));
  for (const m of models) {
    process.stdout.write(`   Evicting ${m}… `);
    try {
      await evictModelFromVram(m);
      console.log('done');
    } catch (err) {
      console.log(`failed (${err.message})`);
    }
  }
  console.log('\n✅ VRAM cleared. Use --reload to warm the last Finetuna model.');
}

async function reloadLastModel() {
  const state = readFinetunaState();
  if (!state?.model) {
    console.error('No .finetuna-state.json found (or missing model). Run Finetuna on a model first.');
    process.exit(1);
  }
  console.log(`\n🐟 Reloading ${state.model} into VRAM...\n`);
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: state.model, prompt: 'hi', stream: false, options: { num_predict: 1 } }),
    signal: createTimeoutSignal(Math.max(FLAGS.genTimeoutMs, 180000)),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Reload failed: HTTP ${res.status}`, text.slice(0, 200));
    process.exit(1);
  }
  writeFinetunaState(state);
  console.log(`✅ ${state.model} is loaded (num_ctx=${state.numCtx ?? '?'}, flash=${state.flashAttn ? 'on' : 'off'}).`);
}

function printSpeedSummary(metrics, { title = 'Performance' } = {}) {
  console.log(`\n📊 ${title}:`);
  if (metrics.evalRate != null) console.log(`   eval_rate (gen)     : ${formatRate(metrics.evalRate)}`);
  if (metrics.promptEvalRate != null) console.log(`   prompt_eval_rate    : ${formatRate(metrics.promptEvalRate)}`);
  console.log(`   Tokens generated    : ${metrics.tokensGenerated}`);
  console.log(`   Eval-only TPS       : ${metrics.tpsEval}`);
  console.log(`   Wall-clock TPS      : ${metrics.tpsWall}`);
  console.log(`   Total time          : ${metrics.totalTimeSec.toFixed(2)} seconds`);
}

function printAutoTuneComparison(before, after) {
  if (!before?.success || !after?.success) return;
  const bEval = before.evalRate ?? (before.tpsEval !== 'N/A' ? parseFloat(before.tpsEval) : null);
  const aEval = after.evalRate ?? (after.tpsEval !== 'N/A' ? parseFloat(after.tpsEval) : null);
  const bPrompt = before.promptEvalRate ?? null;
  const aPrompt = after.promptEvalRate ?? null;
  console.log('\n┌──────────────────────────┬─────────────┬─────────────┬──────────────┐');
  console.log('│ Metric                   │   Before    │    After    │   Change     │');
  console.log('├──────────────────────────┼─────────────┼─────────────┼──────────────┤');
  const pct = (b, a) => (b && a && b > 0 ? `${(((a - b) / b) * 100).toFixed(1)}%` : '—');
  console.log(
    `│ eval_rate (gen)          │ ${formatRate(bEval).padStart(11)} │ ${formatRate(aEval).padStart(11)} │ ${pct(bEval, aEval).padStart(12)} │`,
  );
  console.log(
    `│ prompt_eval (long prompt)│ ${formatRate(bPrompt).padStart(11)} │ ${formatRate(aPrompt).padStart(11)} │ ${pct(bPrompt, aPrompt).padStart(12)} │`,
  );
  console.log('└──────────────────────────┴─────────────┴─────────────┴──────────────┘');
}

function renderBenchmarkMarkdown(rows, modelName) {
  const header = '| num_ctx | num_batch | flash_attn | eval_rate (t/s) | prompt_eval_rate (t/s) | VRAM peak (MiB) | num_gpu |';
  const sep = '| --- | --- | --- | --- | --- | --- | --- |';
  const lines = rows.map(
    (r) =>
      `| ${r.numCtx} | ${r.numBatch} | ${r.flashAttn ? '1' : '0'} | ${r.evalRate ?? '—'} | ${r.promptEvalRate ?? '—'} | ${r.vramPeakMiB ?? '—'} | ${r.numGpu} |`,
  );
  return [`# Finetuna benchmark — ${modelName}`, '', `Generated: ${new Date().toISOString()}`, '', header, sep, ...lines, ''].join('\n');
}

function writeBenchmarkReportFile(rows, modelName) {
  const md = renderBenchmarkMarkdown(rows, modelName);
  console.log('\n' + md);
  const outPath = path.join(process.cwd(), 'finetuna-benchmark.md');
  fs.writeFileSync(outPath, md);
  console.log(`\n💾 Benchmark report saved to ${outPath}`);
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

const STRETCH_CTX = 32768;

/**
 * Build num_ctx sweep plan pivoted on the user's chosen size:
 * test current first → step down only if it fails GPU fit → then probe upward.
 */
function buildCtxSweepPlan(currentCtx, { openClaw = false } = {}) {
  const pool = openClaw ? [...OPENCLAW_CTX_TIERS] : [...CONTEXT_TIERS];
  if (!pool.includes(currentCtx)) pool.push(currentCtx);
  const tiers = [...new Set(pool.filter((c) => c >= 2048))].sort((a, b) => a - b);
  const lowerDesc = tiers.filter((c) => c < currentCtx).sort((a, b) => b - a);
  const higherAsc = tiers.filter((c) => c > currentCtx);
  return { current: currentCtx, lowerDesc, higherAsc };
}

function getContextOptions(vramGB, { openClaw = false } = {}) {
  const maxCtx = maxSuggestedCtxFromVram(vramGB);
  const opts = [];
  const seen = new Set();

  if (openClaw) {
    for (const t of OPENCLAW_CTX_TIERS) {
      seen.add(t);
      let label = t === 65536 ? 'OpenClaw target (64K)' : contextTierShortLabel(t);
      if (t > maxCtx) label += ' — may exceed VRAM hint';
      opts.push({ name: `${t}  – ${label}`, value: t });
    }
    opts.push({ name: 'custom', message: 'Custom (any number you want)' });
    return opts;
  }

  for (const t of CONTEXT_TIERS) {
    if (t > maxCtx) break;
    seen.add(t);
    opts.push({ name: `${t}  – ${contextTierShortLabel(t)}`, value: t });
  }
  if (opts.length === 0) {
    seen.add(4096);
    opts.push({
      name: '4096  – Default (VRAM estimate low; use Custom if you need more)',
      value: 4096,
    });
  }
  if (!seen.has(STRETCH_CTX) && maxCtx < STRETCH_CTX) {
    seen.add(STRETCH_CTX);
    opts.push({
      name: `${STRETCH_CTX}  – Stretch (32k; above VRAM hint — may need auto-tune / lower ctx)`,
      value: STRETCH_CTX,
    });
  }
  // Enquirer Select returns choice.name, not choice.value — use name: 'custom' so the follow-up prompt runs.
  opts.push({ name: 'custom', message: 'Custom (any number you want)' });
  return opts;
}

function unwrapChoice(choice) {
  if (choice === 'custom') return 'custom';
  if (choice && typeof choice === 'object' && Object.prototype.hasOwnProperty.call(choice, 'value')) return choice.value;
  const s = String(choice || '');
  if (/^custom$/i.test(s.trim()) || /^custom\b/i.test(s)) return 'custom';
  const m = s.match(/\d+/);
  if (m) return parseInt(m[0], 10);
  return choice;
}

/**
 * Build Modelfile text. With OpenClaw mode, embeds explicit Gemma4 TEMPLATE / RENDERER / PARSER,
 * num_keep 64, and sampling PARAMETERs.
 * Note: flash attention is NOT a Modelfile param — use OLLAMA_FLASH_ATTENTION on the Ollama server.
 */
function buildModelfileContent({ sourceModel, vramComment, numCtx, numGpu, numBatch, finetunaNote = '', flashAttn = false }) {
  const flashNote = flashAttn ? ' — flash attn via OLLAMA_FLASH_ATTENTION=1 on server' : '';
  const commentLine = finetunaNote ? `# ${vramComment} — ${finetunaNote}${flashNote}` : `# ${vramComment}${flashNote}`;
  const openClawBlock = FLAGS.openClaw
    ? `# OpenClaw compatibility (see --openclaw / FINETUNA_OPENCLAW)
TEMPLATE {{ .Prompt }}
RENDERER gemma4
PARSER gemma4
${FLAGS.openClawAgent ? 'PARAMETER temperature 0.1\nPARAMETER top_k 20\n' : 'PARAMETER temperature 1\nPARAMETER top_k 64\n'}PARAMETER top_p 0.95
PARAMETER num_keep 64

`
    : '';
  return `FROM ${sourceModel}

${openClawBlock}${commentLine}
PARAMETER num_ctx ${numCtx}
PARAMETER num_gpu ${numGpu}
PARAMETER num_batch ${numBatch}
`;
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

  // Poll ollama ps until the model appears (large models / first load can exceed 60s)
  let psOutput = '';
  let found = false;
  for (let attempt = 0; attempt < 90; attempt++) {
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
    console.log('\nModel did not appear in ollama ps after ~3 minutes (first load can be slow for large models).');
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
  const metrics = await getSpeedMetrics(newName);
  if (!metrics.success) {
    console.log('⚠️  Could not measure speed (timeout or error). Falling back to simple run...');
    if (metrics.errMsg) console.log('   Error:', metrics.errMsg);
    return metrics;
  }

  console.log('\n✅ Response:');
  if (metrics.output) console.log(metrics.output.trim());
  printSpeedSummary(metrics);
  return metrics;
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
  const runUrl = `${OLLAMA_BASE}/api/generate`;

  function ollamaRunFallback(start, cliTimeoutMs) {
    const run = spawnSync('ollama', ['run', newName, 'Tell me a short, fun fact about AI. Answer in 20 words or less.'], {
      encoding: 'utf8',
      timeout: cliTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    const out = (run.stdout || '').trim();
    const errOut = (run.stderr || '').trim();
    if (out) {
      return { success: true, output: out, tokensGenerated: 0, tpsEval: 'N/A', tpsWall: 'N/A', totalTimeSec: (Date.now() - start) / 1000 };
    }
    const bits = [errOut, run.error && run.error.message, run.status !== 0 ? `ollama run exit ${run.status}` : ''].filter(Boolean);
    return { success: false, errMsg: bits.join(' — ') || 'No output from ollama run (model may still be loading — try FINETUNA_GEN_TIMEOUT)' };
  }

  async function tryHttp(deadlineMs) {
    const start = Date.now();
    let res;
    try {
      res = await fetch(runUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: createTimeoutSignal(deadlineMs),
      });
    } catch (e) {
      const msg = e.name === 'AbortError' ? `HTTP request timed out (${deadlineMs}ms)` : e.message || String(e);
      if (FLAGS.verbose) console.log(`   [verbose] ${runUrl} → ${msg}`);
      return { ok: false, errMsg: msg, start };
    }
    const end = Date.now();
    const text = await res.text();
    if (!res.ok) {
      const snippet = (text || '').slice(0, 300);
      if (FLAGS.verbose) console.log(`   [verbose] HTTP ${res.status} ${snippet}`);
      return { ok: false, errMsg: `HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`, start };
    }
    if (!text || !text.trim()) {
      return { ok: false, errMsg: 'Empty body from Ollama /api/generate', start };
    }
    const data = parseGenerateResponseBody(text);
    if (!data) {
      return { ok: false, errMsg: 'Could not parse JSON from /api/generate', start };
    }
    if (data.error) {
      return { ok: false, errMsg: String(data.error), start };
    }
    const outputText = data.response || '';
    const tokensGenerated = data.eval_count || 0;
    const evalDurationMs = (data.eval_duration || 0) / 1_000_000;
    const totalTimeSec = (end - start) / 1000;
    const { evalRate, promptEvalRate } = ratesFromGenerateData(data);
    const tpsEval =
      evalRate != null ? evalRate.toFixed(1) : tokensGenerated && evalDurationMs ? (tokensGenerated / (evalDurationMs / 1000)).toFixed(1) : 'N/A';
    const tpsWall = tokensGenerated && totalTimeSec ? (tokensGenerated / totalTimeSec).toFixed(1) : 'N/A';
    return {
      ok: true,
      result: {
        success: true,
        output: outputText,
        tokensGenerated,
        tpsEval,
        tpsWall,
        totalTimeSec,
        evalRate,
        promptEvalRate,
      },
      start,
    };
  }

  try {
    const cliTimeout = Math.max(timeoutMs, 180000);
    let attempt = await tryHttp(timeoutMs);
    if (!attempt.ok) {
      const retryMs = Math.min(Math.max(timeoutMs * 2, 120000), 600000);
      const retryable =
        /timed out|AbortError|ECONNREFUSED|fetch failed|Empty body|HTTP \d/i.test(attempt.errMsg || '') || attempt.errMsg === 'Could not parse JSON from /api/generate';
      if (retryable) {
        if (FLAGS.verbose) console.log(`   [verbose] Retrying /api/generate with ${retryMs}ms timeout...`);
        attempt = await tryHttp(retryMs);
      }
    }
    if (!attempt.ok) {
      if (FLAGS.verbose) console.log(`   [verbose] API failed (${attempt.errMsg}); trying ollama run (timeout ${cliTimeout}ms)...`);
      return ollamaRunFallback(attempt.start, cliTimeout);
    }
    return attempt.result;
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
    const data = parseGenerateResponseBody(text);
    if (!data) {
      return { success: false, errMsg: 'Could not parse /api/generate response' };
    }
    if (data.error) {
      return { success: false, errMsg: String(data.error) };
    }
    const promptTokens = data.prompt_eval_count || 0;
    const promptDurationNs = data.prompt_eval_duration || 0;
    const promptDurationMs = promptDurationNs / 1_000_000;
    const { promptEvalRate } = ratesFromGenerateData(data);
    const promptTps =
      promptEvalRate != null
        ? promptEvalRate.toFixed(1)
        : promptTokens && promptDurationMs
          ? (promptTokens / (promptDurationMs / 1000)).toFixed(1)
          : 'N/A';
    const ttftMs = promptDurationMs;

    return { success: true, promptTokens, promptDurationMs, promptTps, promptEvalRate, ttftMs };
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
    const tps = m.success ? (m.promptEvalRate ?? (m.promptTps !== 'N/A' ? parseFloat(m.promptTps) : 0)) : 0;
    if (m.success && tps > 0) {
      results.push(tps);
      const rateStr = m.promptEvalRate != null ? `${m.promptEvalRate.toFixed(1)} prompt_eval_rate` : `${tps.toFixed(1)} tok/s ingestion`;
      console.log(`${rateStr} · ${m.ttftMs.toFixed(0)}ms to first token · ${m.promptTokens} prompt tokens`);
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
    const tps = m.success ? (m.evalRate ?? (m.tpsEval !== 'N/A' ? parseFloat(m.tpsEval) : m.tpsWall !== 'N/A' ? parseFloat(m.tpsWall) : 0)) : 0;
    if (m.success && tps > 0) {
      results.push(tps);
      const rateStr = m.evalRate != null ? `${m.evalRate.toFixed(1)} eval_rate` : `${tps.toFixed(1)} t/s`;
      console.log(rateStr);
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

async function sampleBenchmarkRates(newName) {
  // Sequential: parallel generates can contend on one loaded model
  const gen = await getSpeedMetrics(newName);
  const prompt = await getPromptEvalMetrics(newName);
  const vramPeakMiB = queryGpuMemUsedMiB();
  return {
    evalRate: gen.success ? gen.evalRate : null,
    promptEvalRate: prompt.success ? prompt.promptEvalRate : null,
    vramPeakMiB,
  };
}

/** Generation + long-prompt ingestion rates for before/after comparison. */
async function collectComparisonMetrics(newName) {
  const gen = await getSpeedMetrics(newName);
  if (!gen.success) return gen;
  const prompt = await getPromptEvalMetrics(newName);
  return {
    ...gen,
    promptEvalRate: prompt.success ? (prompt.promptEvalRate ?? (prompt.promptTps !== 'N/A' ? parseFloat(prompt.promptTps) : null)) : null,
  };
}

async function maybeRenameWithSuggested(currentName, sourceModel, numCtx, flashAttn) {
  const suggested = suggestModelName(sourceModel.split(':')[0], numCtx, flashAttn);
  if (suggested === currentName) return currentName;
  const r = await prompt([
    {
      type: 'confirm',
      name: 'useSuggested',
      message: `Save as "${suggested}"? (self-documenting name for ollama list)`,
      initial: true,
    },
  ]);
  if (!r.useSuggested) return currentName;
  const cp = spawnSync('ollama', ['cp', currentName, suggested], { encoding: 'utf8' });
  if (cp.status !== 0) {
    console.log(`   ⚠️  Could not copy to ${suggested} — keeping ${currentName}`);
    return currentName;
  }
  console.log(`   ✅ Model also available as "${suggested}"`);
  return suggested;
}

async function main() {
  if (FLAGS.unload) {
    await unloadLoadedModels();
    return;
  }
  if (FLAGS.reload) {
    await reloadLastModel();
    return;
  }

  console.log('\n🐟 Finetuna — The Ollama Model Tuner');
  console.log('=====================================\n');
  console.log("You can tune a guitar... but you can't tunafish! Let's fine-tune some models! 🐟\n");

  const flashSupported = detectFlashAttnSupport();
  /** User/docs intent for -flash naming; flash itself is OLLAMA_FLASH_ATTENTION on the server. */
  let sessionFlashAttn = false;
  const benchmarkRows = [];
  let pendingResultsLog = null;

  if (FLAGS.openClaw) {
    const agentNote = FLAGS.openClawAgent ? ' (agent sampling: temperature 0.1, top_k 20)' : '';
    console.log(
      `OpenClaw mode: 64K context default, num_keep 64, gemma4 TEMPLATE/RENDERER/PARSER${agentNote}.\n`,
    );
  }
  if (flashSupported) {
    console.log('GPU looks flash-attention capable (RTX 20xx+ class).');
    console.log('Note: enable via OLLAMA_FLASH_ATTENTION=1 on the Ollama *server* (not Modelfile).\n');
  } else if (FLAGS.flashAttn === true) {
    console.log('⚠️  --flash-attn set but no supported NVIDIA GPU detected — setup tips still apply.\n');
  }

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
    console.error('Could not run "ollama list". Is Ollama running?');
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

  if (FLAGS.openClaw) {
    const maxCtx = maxSuggestedCtxFromVram(vramGB);
    if (vramGB == null) {
      console.log(
        '⚠️  OpenClaw recommends 65536 context, but VRAM could not be detected.\n' +
          '   64K may not fit — start high and let auto-tune / GPU-fit step down, or pick a smaller model / Q4_K_M.\n',
      );
    } else if (maxCtx < 65536) {
      console.log(
        '⚠️  OpenClaw recommends 65536 context. Your VRAM hint suggests a lower ceiling — 64K may not fit.\n' +
          '   Try a smaller model or Q4_K_M quantization if auto-tune cannot reach 100% GPU at 64K.\n',
      );
    }
  }

  const ctxOptions = getContextOptions(vramGB, { openClaw: FLAGS.openClaw });
  let ctxInitial = 0;
  if (FLAGS.openClaw) {
    const idx64 = ctxOptions.findIndex((o) => o.value === 65536);
    if (idx64 >= 0) ctxInitial = idx64;
  }
  const { ctxChoice } = await prompt([
    {
      type: 'select',
      name: 'ctxChoice',
      message: FLAGS.openClaw
        ? 'OpenClaw context (num_ctx) — 64K target, step down if VRAM is tight:'
        : 'Choose a context window size (num_ctx) — pick wisely, little tuna:',
      choices: ctxOptions,
      initial: ctxInitial,
    },
  ]);

  const rawCtx = unwrapChoice(ctxChoice);
  let numCtx =
    rawCtx === 'custom'
      ? parseInt(
          (await prompt([
            {
              type: 'input',
              name: 'customCtx',
              message: 'Custom context size (any number):',
              initial: FLAGS.openClaw ? '65536' : '32768',
            },
          ])).customCtx,
          10,
        )
      : rawCtx;
  if (!Number.isFinite(numCtx) || numCtx < 256) {
    console.error('Invalid context size; using 8192.');
    numCtx = 8192;
  }

  const { numBatch } = await prompt([{ type: 'input', name: 'numBatch', message: 'Batch size (num_batch) – higher = faster generation:', initial: '512' }]);
  const { numGpu } = await prompt([{ type: 'input', name: 'numGpu', message: 'GPU layers (num_gpu) – 999 = max possible:', initial: '999' }]);

  if (FLAGS.flashAttn === true) {
    sessionFlashAttn = true;
    printFlashAttnGuidance();
  } else if (FLAGS.flashAttn === false) {
    sessionFlashAttn = false;
  } else if (isFlashAttnEnvEnabled()) {
    sessionFlashAttn = true;
    console.log('OLLAMA_FLASH_ATTENTION is set in this process environment — tagging model as flash-capable.\n');
  } else if (flashSupported) {
    const r = await prompt([
      {
        type: 'confirm',
        name: 'useFlash',
        message: 'Use flash attention on the Ollama server? (prints setup tips; tags -flash name — not a Modelfile param)',
        initial: true,
      },
    ]);
    sessionFlashAttn = r.useFlash;
    if (sessionFlashAttn) printFlashAttnGuidance();
  }

  const vramComment = vramGB ? `Optimized for ${vramGB}GB VRAM (auto-detected)` : 'Optimized for your GPU';
  const modelfileContent = buildModelfileContent({ sourceModel, vramComment, numCtx, numGpu, numBatch, flashAttn: sessionFlashAttn });

  const modelfilePath = path.join(process.cwd(), 'Modelfile-finetuna');
  fs.writeFileSync(modelfilePath, modelfileContent);
  console.log(`\n✅ Modelfile created at ${modelfilePath} — seasoned and ready!`);

  console.log(`\n🎣 Creating new model: ${newName} ...`);
  spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
  console.log(`\n🎉 Model "${newName}" created successfully! It’s a keeper! 🐟`);

  let fullGPU = false;
  let currentCtx = numCtx;
  let bestBatch = null;
  let beforeMetrics = null;
  let afterMetrics = null;

  console.log('\n📏 Baseline speed (before auto-tune)...');
  beforeMetrics = await collectComparisonMetrics(newName);
  if (beforeMetrics.success) {
    console.log('\n✅ Response:');
    if (beforeMetrics.output) console.log(beforeMetrics.output.trim());
    printSpeedSummary(beforeMetrics, { title: 'Baseline performance' });
  } else {
    console.log('⚠️  Could not measure baseline speed.');
    if (beforeMetrics.errMsg) console.log('   Error:', beforeMetrics.errMsg);
  }
  let measuredSinceCreate = Boolean(beforeMetrics?.success);
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
        const content = buildModelfileContent({ sourceModel, vramComment, numCtx: currentCtx, numGpu, numBatch: cand, flashAttn: sessionFlashAttn });
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

      // Pivot on the chosen size: current first → down if needed → up if it fits
      const plan = buildCtxSweepPlan(currentCtx, { openClaw: FLAGS.openClaw });
      const preview = [plan.current, ...plan.lowerDesc, ...plan.higherAsc];

      console.log('   Strategy:   ' + (ctxGoal === 'max-context' ? 'Largest context that fits 100% GPU' : 'Fastest generation speed at 100% GPU'));
      console.log(`   Pivot:      ${plan.current} (test current first; step down only if it fails; then probe up)`);
      console.log('   Candidates: ' + preview.join(', '));
      console.log('   Repeats: ' + repeatCount);
      console.log('   Only candidates with 100% GPU offload will be kept.\n');

      async function tryCtxCandidate(cand) {
        console.log(`\n🐟 num_ctx = ${cand}${cand === currentCtx ? ' (current)' : ''}`);
        const content = buildModelfileContent({
          sourceModel,
          vramComment,
          numCtx: cand,
          numGpu,
          numBatch: bestBatch,
          flashAttn: sessionFlashAttn,
        });
        fs.writeFileSync(modelfilePath, content);
        const createResult = spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
        if (createResult.status !== 0) {
          console.log('   ⚠️  Failed to create model — skipping');
          ctxResults.push({ cand, avg: 0, gpu: false });
          return { ok: false, createFailed: true };
        }
        const gpuOk = await checkGPUFit(newName);
        if (!gpuOk) {
          console.log(`   ⚠️  num_ctx=${cand} doesn't fit 100% GPU`);
          ctxResults.push({ cand, avg: 0, gpu: false });
          return { ok: false, gpuMiss: true };
        }
        const avg = await benchmarkModel(newName, repeatCount, `[ctx=${cand}] `);
        ctxResults.push({ cand, avg, gpu: true });
        // ok only when benches produced a usable rate (GPU-fit alone is not enough to early-stop)
        return { ok: avg > 0, avg, gpuOk: true };
      }

      // 1) Test the user's chosen context first
      const currentResult = await tryCtxCandidate(plan.current);
      let currentFits = currentResult.ok || currentResult.gpuOk;

      if (!currentFits) {
        // 2a) Step down until something fits (first usable fit is the largest below current)
        console.log('\n   Current size does not fit — stepping down…');
        for (const cand of plan.lowerDesc) {
          const r = await tryCtxCandidate(cand);
          if (r.createFailed) continue;
          if (r.ok) {
            currentFits = true;
            // For max-context, largest that fits is this first success (descending)
            if (ctxGoal === 'max-context') {
              console.log('   Found a fitting size — skipping remaining smaller candidates (max-context).');
              for (const skip of plan.lowerDesc.filter((c) => c < cand)) {
                ctxResults.push({ cand: skip, avg: 0, gpu: false });
              }
              break;
            }
            // max-speed: keep going down to compare TPS at smaller windows
          } else if (r.gpuOk && ctxGoal === 'max-context') {
            // GPU fit but benches failed — keep looking for a measurable size
            currentFits = true;
          }
        }
        // Current already failed GPU — larger sizes will not fit either
        for (const skip of plan.higherAsc) {
          ctxResults.push({ cand: skip, avg: 0, gpu: false });
        }
      } else {
        // 2b) Current fits — probe upward until a true VRAM miss, then stop
        if (plan.higherAsc.length) console.log('\n   Current size fits — probing larger contexts…');
        for (const cand of plan.higherAsc) {
          const r = await tryCtxCandidate(cand);
          if (r.createFailed) {
            console.log('   Create failed — trying next larger candidate…');
            continue;
          }
          if (r.gpuMiss) {
            console.log('   Larger size failed GPU fit — skipping remaining bigger candidates.');
            for (const skip of plan.higherAsc.filter((c) => c > cand)) {
              ctxResults.push({ cand: skip, avg: 0, gpu: false });
            }
            break;
          }
          // gpuOk with avg 0: continue probing (timeout fluke should not kill the sweep)
        }
        // max-speed: also measure smaller sizes that should still fit (for TPS comparison)
        if (ctxGoal === 'max-speed' && plan.lowerDesc.length) {
          console.log('\n   Measuring smaller contexts for speed comparison…');
          for (const cand of plan.lowerDesc) {
            await tryCtxCandidate(cand);
          }
        }
      }

      const ctxValid = ctxResults.filter((r) => r.gpu && r.avg > 0);

      // Display by context size ascending
      const ctxDisplay = [...ctxResults].sort((a, b) => a.cand - b.cand);
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
        const gpuOnly = [...ctxResults].filter((r) => r.gpu).sort((a, b) => b.cand - a.cand)[0];
        if (gpuOnly) {
          bestCtx = gpuOnly.cand;
          console.log(`\n   ⚠️  Benchmarks failed; using largest GPU-fitting context (${bestCtx}) without TPS data.`);
        } else {
          console.log('\n   ⚠️  No contexts fit 100% GPU — keeping original.');
          bestCtx = currentCtx;
        }
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
    const finalContent = buildModelfileContent({
      sourceModel,
      vramComment,
      numCtx: bestCtx,
      numGpu,
      numBatch: bestBatch,
      flashAttn: sessionFlashAttn,
      finetunaNote: 'auto-tuned by Finetuna 🐟',
    });
    fs.writeFileSync(modelfilePath, finalContent);
    spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
    console.log('\n   ✅ Final model created with optimal settings!');

    console.log('\n📏 Speed after auto-tune...');
    afterMetrics = await collectComparisonMetrics(newName);
    if (afterMetrics.success) {
      console.log('\n✅ Response:');
      if (afterMetrics.output) console.log(afterMetrics.output.trim());
      printSpeedSummary(afterMetrics, { title: 'After auto-tune' });
    }
    printAutoTuneComparison(beforeMetrics, afterMetrics);
    measuredSinceCreate = Boolean(afterMetrics?.success);

    if (FLAGS.benchmarkReport || benchmarkRows.length > 0) {
      const sample = await sampleBenchmarkRates(newName);
      benchmarkRows.push({
        numCtx: bestCtx,
        numBatch: bestBatch,
        numGpu,
        flashAttn: sessionFlashAttn,
        evalRate: sample.evalRate,
        promptEvalRate: sample.promptEvalRate,
        vramPeakMiB: sample.vramPeakMiB,
      });
    }

    // Defer writing until after optional rename so model name matches --reload state
    pendingResultsLog = {
      timestamp: new Date().toISOString(),
      model: newName,
      source: sourceModel,
      settings: { bestBatch, bestCtx, numGpu, openClaw: FLAGS.openClaw, openClawAgent: FLAGS.openClawAgent, flashAttn: sessionFlashAttn },
      before: beforeMetrics?.success
        ? { evalRate: beforeMetrics.evalRate, promptEvalRate: beforeMetrics.promptEvalRate, tpsEval: beforeMetrics.tpsEval }
        : null,
      after: afterMetrics?.success
        ? { evalRate: afterMetrics.evalRate, promptEvalRate: afterMetrics.promptEvalRate, tpsEval: afterMetrics.tpsEval }
        : null,
      batchResults,
      ctxResults,
      benchmarkRows,
    };

    // Final settings came from GPU-fitting candidates when Phase 2 found any
    fullGPU = ctxResults.some((r) => r.gpu) || (FLAGS.skipCtx && batchResults.some((r) => r.gpu));
  }

  while (!fullGPU) {
    if (!autoTune && !measuredSinceCreate) {
      await runTestPromptWithSpeed(newName);
      measuredSinceCreate = true;
    }
    fullGPU = await checkGPUFit(newName);

    if (!fullGPU) {
      const { reduce } = await prompt([
        { type: 'confirm', name: 'reduce', message: 'Would you like to drop the context window to get full GPU offload? 🐠', initial: true },
      ]);
      if (!reduce) break;

      const lowerOptions = getContextOptions(vramGB, { openClaw: FLAGS.openClaw }).filter(
        (o) => o.value != null && o.value !== 'custom' && o.value < currentCtx,
      );
      lowerOptions.push({ name: 'custom', message: 'Custom (lower)' });

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
      const newContent = buildModelfileContent({
        sourceModel,
        vramComment,
        numCtx: currentCtx,
        numGpu,
        numBatch: fallbackBatch,
        flashAttn: sessionFlashAttn,
      });
      fs.writeFileSync(modelfilePath, newContent);
      spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
      console.log('✅ Model recreated with lower context — back in the water!');
      measuredSinceCreate = false;
    } else {
      break;
    }
  }

  let finalName = await maybeRenameWithSuggested(newName, sourceModel, currentCtx, sessionFlashAttn);

  if (pendingResultsLog) {
    pendingResultsLog.model = finalName;
    pendingResultsLog.alsoAs = finalName !== newName ? newName : undefined;
    const resultsPath = path.join(process.cwd(), 'finetuna-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(pendingResultsLog, null, 2));
    console.log(`\n   💾 Results saved to finetuna-results.json`);
  }

  writeFinetunaState({
    model: finalName,
    source: sourceModel,
    numCtx: currentCtx,
    numBatch: bestBatch != null ? bestBatch : parseInt(numBatch, 10) || 512,
    numGpu,
    flashAttn: sessionFlashAttn,
    openClaw: FLAGS.openClaw,
  });

  if (FLAGS.benchmarkReport) {
    if (benchmarkRows.length === 0) {
      const sample = await sampleBenchmarkRates(finalName);
      benchmarkRows.push({
        numCtx: currentCtx,
        numBatch: bestBatch != null ? bestBatch : parseInt(numBatch, 10) || 512,
        numGpu,
        flashAttn: sessionFlashAttn,
        evalRate: sample.evalRate,
        promptEvalRate: sample.promptEvalRate,
        vramPeakMiB: sample.vramPeakMiB,
      });
    }
    writeBenchmarkReportFile(benchmarkRows, finalName);
  }

  console.log(`\n🎉 Finetuna complete! Your model is perfectly seasoned and ready to swim. 🐟`);
  console.log(`   Run it anytime with: ollama run ${finalName}`);
  console.log(`   Free VRAM quickly: node finetuna.js --unload`);
  console.log(`\nYour Modelfile is saved as "Modelfile-finetuna" — tweak it anytime!`);
}

main().catch((err) => {
  if (err.name === 'ExitPromptError') console.log('\n👋 Cancelled by user.');
  else console.error('\nError:', err.message);
});
