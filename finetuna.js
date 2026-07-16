import Enquirer from 'enquirer';
import { createRequire } from 'module';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const colors = require('ansi-colors');

// High-contrast Enquirer palette for dark terminals.
// NOTE: `primary` must be a base ansi-colors name (cyan/white/…), not *Bright —
// Enquirer's cursor uses inverse(primary) → bgX.black, and *Bright names yield
// noop + black text (invisible on dark backgrounds).
const enquirer = new Enquirer({
  styles: {
    primary: colors.cyan.bold,
    answered: colors.cyan.bold,
    placeholder: colors.white,
    muted: colors.white,
    info: colors.cyan.bold,
    pending: colors.cyan.bold,
    dark: colors.gray,
    disabled: colors.gray,
  },
});

/** Enquirer confirm renders the cast boolean as "true"/"false" — show Yes/No instead. */
function withConfirmFormat(question) {
  if (!question || question.type !== 'confirm' || question.format) return question;
  return {
    ...question,
    format(value) {
      const yes = value === true || /^[ty1]/i.test(String(value));
      if (!this.state.submitted) return this.styles.primary(yes ? 'Yes' : 'No');
      return this.styles.success(yes ? 'Yes' : 'No');
    },
  };
}

const prompt = (questions) => {
  const list = (Array.isArray(questions) ? questions : [questions]).map(withConfirmFormat);
  return enquirer.prompt(list);
};

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

function suggestModelName(userModelName, numCtx, flashAttn) {
  // Prefer the name the user chose earlier; only strip prior ctx/flash suffixes so we don't stack them.
  let base = String(userModelName || '')
    .replace(/:.*$/, '')
    .replace(/-ctx[\d.]+k$/i, '')
    .replace(/-flash$/i, '');
  if (!base) base = 'model';
  let name = `${base}-ctx${ctxKLabel(numCtx)}`;
  if (flashAttn) name += '-flash';
  return name;
}

function metricEvalRate(m) {
  if (!m) return null;
  if (m.evalRate != null && Number.isFinite(m.evalRate)) return m.evalRate;
  if (m.tpsEval != null && m.tpsEval !== 'N/A') {
    const n = parseFloat(m.tpsEval);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** True when after generation rate is meaningfully slower than before (~>5%). */
function isAutoTuneNetNegative(before, after) {
  const b = metricEvalRate(before);
  const a = metricEvalRate(after);
  if (b == null || a == null || b <= 0) return false;
  return a < b * 0.95;
}

function isOomError(msg) {
  return /out of memory|out-of-memory|cudaMalloc|failed to allocate|alloc_tensor|kv cache|insufficient memory|compute (?:pp )?buffers|ggml_gallocr|graph_reserve|\bOOM\b/i.test(
    String(msg || ''),
  );
}

function extractCudaAllocBytes(msg) {
  const m = String(msg || '').match(/(?:allocate CUDA\d+ buffer of size|buffer of size) (\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** @returns {'wont_fit'|'kv'|'compute'|'oom'} */
function classifyLoadOom(errMsg, { numCtx, sameAllocAsBefore } = {}) {
  const msg = String(errMsg || '');
  const projector = /projector/i.test(msg);
  const kv = /kv cache/i.test(msg);
  const compute = /compute (?:pp )?buffers|ggml_gallocr|graph_reserve/i.test(msg);
  const lowCtx = numCtx != null && numCtx <= 8192;
  // Failed at small ctx, or alloc didn't shrink when ctx dropped → weights/overhead, not KV.
  if (sameAllocAsBefore || (lowCtx && (compute || projector || isOomError(msg)))) return 'wont_fit';
  if (kv) return 'kv';
  if (compute) return 'compute';
  return 'oom';
}

function printOomBrief(errMsg) {
  const alloc = extractCudaAllocBytes(errMsg);
  const bits = [];
  if (/projector/i.test(String(errMsg || ''))) bits.push('multimodal projector');
  if (/kv cache/i.test(String(errMsg || ''))) bits.push('KV cache');
  if (/compute (?:pp )?buffers|ggml_gallocr|graph_reserve/i.test(String(errMsg || ''))) bits.push('compute buffers');
  if (alloc) bits.push(`~${(alloc / (1024 * 1024)).toFixed(0)} MiB`);
  return bits.length ? bits.join(', ') : 'CUDA OOM';
}

/**
 * Short diagnosis only — no bullet lists.
 * @returns {'wont_fit'|'kv'|'compute'|'oom'}
 */
function printOomGuidance({ sourceModel, vramGB, numCtx, errMsg, sameAllocAsBefore, unified = false }) {
  const kind = classifyLoadOom(errMsg, { numCtx, sameAllocAsBefore });
  const vram = vramGB
    ? unified
      ? `~${vramGB}GB unified memory`
      : `~${vramGB}GB VRAM`
    : unified
      ? 'this Mac'
      : 'this GPU';
  const detail = printOomBrief(errMsg);

  if (kind === 'wont_fit') {
    console.log(`\n💥 ${sourceModel} won't fit ${vram} (OOM at num_ctx=${numCtx}: ${detail}).`);
    console.log(
      unified
        ? '   Lowering context may not help. Use a smaller model/quant, or free RAM (quit heavy apps) and retry.'
        : '   Lowering context will not help. Use a smaller model/quant, free other GPU apps (Hermes), or restart Ollama.',
    );
    return kind;
  }
  if (kind === 'kv') {
    console.log(`\n💥 OOM at num_ctx=${numCtx} — KV cache too large for ${vram} (${detail}).`);
    console.log('   Create ≠ load; drop context and retry.');
    return kind;
  }
  if (kind === 'compute') {
    console.log(`\n💥 OOM at num_ctx=${numCtx} — ${detail}; model barely fits ${vram}.`);
    console.log('   Try a lower context once; if it still fails, switch model/quant.');
    return kind;
  }
  console.log(`\n💥 GPU OOM loading ${sourceModel} at num_ctx=${numCtx} (${detail}, ${vram}).`);
  console.log('   Drop context, or use a smaller model if it keeps failing.');
  return kind;
}

/** Evict loaded models so a recreate/load has a clean shot at VRAM. */
async function freeGpuVram() {
  console.log('\n🧹 Freeing VRAM (evicting loaded models)…');
  try {
    const models = await listLoadedModelsHttp();
    if (models.length === 0) {
      console.log('   No models reported in /api/ps.');
      return;
    }
    for (const m of models) {
      process.stdout.write(`   Evicting ${m}… `);
      try {
        await evictModelFromVram(m);
        console.log('done');
      } catch (err) {
        console.log(`failed (${err.message})`);
      }
    }
  } catch {
    try {
      spawnSync('ollama', ['stop'], { timeout: 5000 });
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
}

function detectFlashAttnSupport() {
  // CUDA flash-attn tips are NVIDIA-oriented; Apple Silicon uses Metal/MLX instead.
  if (process.platform === 'darwin') return false;
  try {
    const names = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    return names.some(
      (n) =>
        /\bRTX\b/i.test(n) ||
        /\b(GTX\s+16\d{2}|Tesla|Quadro|A\d{2,4}|L\d{1,2}|H\d{2,3}|B\d{3}|V100|T4|P40|P100)\b/i.test(n) ||
        /\b(GeForce|NVIDIA)\b/i.test(n),
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
  const mem = detectGpuMemory();
  return mem?.usedMiB ?? null;
}

/**
 * Total / used / free GPU memory.
 * NVIDIA discrete VRAM, AMD, Windows WMI, or Apple Silicon unified memory.
 * @returns {{ vendor: string, totalMiB: number, usedMiB: number|null, freeMiB: number|null, totalGB: number, usedGB: number|null, freeGB: number|null, processes: {pid:string,name:string,usedMiB:number|null}[], unified?: boolean, chip?: string } | null}
 */
function detectGpuMemory() {
  if (process.platform === 'darwin') {
    const apple = detectAppleSiliconMemory();
    if (apple) return apple;
  }

  try {
    const raw = execSync(
      'nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits',
      { encoding: 'utf8', timeout: 8000 },
    )
      .trim()
      .split('\n')[0];
    const parts = raw.split(',').map((s) => parseInt(s.trim(), 10));
    const totalMiB = parts[0];
    const usedMiB = Number.isFinite(parts[1]) ? parts[1] : null;
    const freeMiB = Number.isFinite(parts[2]) ? parts[2] : null;
    if (!Number.isFinite(totalMiB) || totalMiB < 1) throw new Error('bad nvidia-smi');
    return {
      vendor: 'nvidia',
      totalMiB,
      usedMiB,
      freeMiB,
      totalGB: Math.max(1, Math.round(totalMiB / 1024)),
      usedGB: usedMiB != null ? Math.round((usedMiB / 1024) * 10) / 10 : null,
      freeGB: freeMiB != null ? Math.round((freeMiB / 1024) * 10) / 10 : null,
      processes: listGpuComputeApps(),
      unified: false,
    };
  } catch {
    try {
      const rocm = execSync('rocm-smi --showmeminfo vram', { encoding: 'utf8', timeout: 8000 });
      const totalB = rocm.match(/VRAM Total Memory \(B\):\s*(\d+)/i);
      const usedB = rocm.match(/VRAM Total Used Memory \(B\):\s*(\d+)/i);
      if (!totalB) throw new Error('no rocm total');
      const totalMiB = Math.round(parseInt(totalB[1], 10) / (1024 * 1024));
      const usedMiB = usedB ? Math.round(parseInt(usedB[1], 10) / (1024 * 1024)) : null;
      const freeMiB = usedMiB != null ? Math.max(0, totalMiB - usedMiB) : null;
      return {
        vendor: 'amd',
        totalMiB,
        usedMiB,
        freeMiB,
        totalGB: Math.max(1, Math.round(totalMiB / 1024)),
        usedGB: usedMiB != null ? Math.round((usedMiB / 1024) * 10) / 10 : null,
        freeGB: freeMiB != null ? Math.round((freeMiB / 1024) * 10) / 10 : null,
        processes: [],
        unified: false,
      };
    } catch {
      try {
        const ps = execSync(
          'powershell -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1).AdapterRAM / 1GB"',
          { encoding: 'utf8' },
        ).trim();
        const totalGB = Math.round(parseFloat(ps));
        if (!(totalGB > 0)) return null;
        return {
          vendor: 'wmi',
          totalMiB: totalGB * 1024,
          usedMiB: null,
          freeMiB: null,
          totalGB,
          usedGB: null,
          freeGB: null,
          processes: [],
          unified: false,
        };
      } catch {
        return null;
      }
    }
  }
}

/** Apple Silicon: one unified memory pool for CPU + GPU (Metal / MLX). */
function detectAppleSiliconMemory() {
  if (process.platform !== 'darwin') return null;
  try {
    const brand = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8', timeout: 5000 }).trim();
    const memBytes = parseInt(execSync('sysctl -n hw.memsize', { encoding: 'utf8', timeout: 5000 }).trim(), 10);
    const appleChip = /Apple|M\d/i.test(brand) || process.arch === 'arm64';
    if (!appleChip || !Number.isFinite(memBytes) || memBytes < 1) return null;

    let freeGB = null;
    let usedGB = null;
    try {
      const pageSize = parseInt(execSync('pagesize', { encoding: 'utf8', timeout: 3000 }).trim(), 10) || 16384;
      const vm = execSync('vm_stat', { encoding: 'utf8', timeout: 5000 });
      const n = (re) => {
        const m = vm.match(re);
        return m ? parseInt(m[1].replace(/\./g, ''), 10) : 0;
      };
      // Rough "available" — free + speculative + inactive + purgeable (not wired).
      const availPages =
        n(/Pages free:\s+([\d.]+)/i) +
        n(/Pages speculative:\s+([\d.]+)/i) +
        n(/Pages inactive:\s+([\d.]+)/i) +
        n(/Pages purgeable:\s+([\d.]+)/i);
      freeGB = Math.round(((availPages * pageSize) / (1024 ** 3)) * 10) / 10;
      usedGB = Math.round((memBytes / (1024 ** 3) - freeGB) * 10) / 10;
      if (usedGB < 0) usedGB = 0;
    } catch {
      /* total only */
    }

    const totalGB = Math.max(1, Math.round(memBytes / (1024 ** 3)));
    return {
      vendor: 'apple',
      chip: brand,
      totalMiB: Math.round(memBytes / (1024 * 1024)),
      usedMiB: usedGB != null ? Math.round(usedGB * 1024) : null,
      freeMiB: freeGB != null ? Math.round(freeGB * 1024) : null,
      totalGB,
      usedGB,
      freeGB,
      processes: [],
      unified: true,
    };
  } catch {
    return null;
  }
}

function listGpuComputeApps() {
  try {
    const raw = execSync(
      'nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits',
      { encoding: 'utf8', timeout: 8000 },
    ).trim();
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => {
        const cols = line.split(',').map((s) => s.trim());
        if (cols.length < 2) return null;
        const pid = cols[0];
        const memRaw = cols[cols.length - 1];
        const usedMiB = /^\d+$/.test(memRaw) ? parseInt(memRaw, 10) : null;
        const pathName = cols.length > 2 ? cols.slice(1, -1).join(',') : cols[1];
        const name = String(pathName || 'unknown').replace(/^.*[\\/]/, '');
        if (!pid || /insufficient permissions/i.test(name)) {
          return { pid, name: name || 'other', usedMiB };
        }
        return { pid, name, usedMiB };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Total memory in GB (VRAM or unified). Prefer detectGpuMemory() when free/used matter. */
function detectVRAM() {
  return detectGpuMemory()?.totalGB ?? null;
}

function memoryPoolLabel(gpu) {
  return gpu?.unified ? 'unified memory' : 'VRAM';
}

function gpuFitLabel(gpu) {
  return gpu?.unified ? 'Metal / GPU' : '100% GPU';
}

function formatGpuProcessSummary(processes, { limit = 5 } = {}) {
  if (!processes?.length) return '';
  const names = [];
  const seen = new Set();
  for (const p of processes) {
    let n = p.name || 'other';
    if (/insufficient permissions/i.test(n) || n === 'other') {
      n = p.pid ? `pid:${p.pid}` : 'unknown';
    }
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
    if (names.length >= limit) break;
  }
  return names.join(', ');
}

/** Print free vs total; warn when something else is sitting on the GPU. */
function printGpuMemoryReport(gpu, { prefix = '🧠' } = {}) {
  if (!gpu) {
    console.log(
      `${prefix} Could not auto-detect memory (NVIDIA nvidia-smi, AMD rocm-smi, Apple sysctl, or Windows WMI)`,
    );
    return;
  }
  if (gpu.unified) {
    const chip = gpu.chip ? ` · ${gpu.chip}` : '';
    if (gpu.freeGB != null && gpu.usedGB != null) {
      console.log(
        `${prefix} Apple Silicon${chip}: ${gpu.totalGB}GB unified memory · ~${gpu.freeGB}GB available · ~${gpu.usedGB}GB in use`,
      );
    } else {
      console.log(`${prefix} Apple Silicon${chip}: ${gpu.totalGB}GB unified memory (CPU+GPU share one pool)`);
    }
    console.log('   Metal/MLX uses the same RAM as apps — leave headroom for macOS (fit estimates use available memory).');
    if (gpu.totalGB >= 32) {
      console.log('   Tip: Ollama’s MLX backend (Apple Silicon preview) prefers ≥32GB; keep Ollama updated for Metal/MLX models.');
    } else {
      console.log('   Tip: smaller quants + modest num_ctx work best under 32GB unified; Ollama still uses Metal.');
    }
    return;
  }
  if (gpu.freeGB != null && gpu.usedGB != null) {
    console.log(`${prefix} GPU: ${gpu.totalGB}GB total · ~${gpu.freeGB}GB free · ~${gpu.usedGB}GB used`);
  } else {
    console.log(`${prefix} Detected: ${gpu.totalGB} GB VRAM — nice rig!`);
  }
  const procs = formatGpuProcessSummary(gpu.processes);
  if (procs) console.log(`   GPU processes: ${procs}`);
}

/**
 * True when free memory is low enough that other apps may cause false OOMs.
 * @returns {boolean} whether the user wants to continue
 */
async function warnIfLowFreeVram(gpu) {
  if (!gpu || gpu.freeGB == null || gpu.totalGB == null) return true;
  const freeRatio = gpu.freeGB / gpu.totalGB;
  // Unified memory always shares with the OS — warn a bit earlier.
  const threshold = gpu.unified ? 0.4 : 0.55;
  const minFree = gpu.unified ? 6 : 4;
  const busy = gpu.usedGB != null && gpu.usedGB >= 1.5 && (freeRatio < threshold || gpu.freeGB < minFree);
  if (!busy) return true;

  const pool = memoryPoolLabel(gpu);
  const procs = formatGpuProcessSummary(gpu.processes);
  console.log(
    `\n⚠️  Only ~${gpu.freeGB}GB available of ${gpu.totalGB}GB ${pool}${procs ? ` (${procs})` : ''}.`,
  );
  console.log(
    gpu.unified
      ? '   Quit heavy apps (browsers, IDEs, other local models) so Metal has headroom, or continue with current availability.\n'
      : '   Close other GPU apps (or Hermes), or continue knowing fit estimates use free VRAM.\n',
  );
  const { cont } = await prompt([
    {
      type: 'confirm',
      name: 'cont',
      message: `Continue with current free ${pool}?`,
      initial: true,
    },
  ]);
  return cont !== false;
}

/** Re-read free memory; log a one-liner if it changed a lot. */
function refreshGpuMemory(prev) {
  const next = detectGpuMemory();
  if (!next || next.freeGB == null) return next || prev;
  if (prev?.freeGB != null && Math.abs(next.freeGB - prev.freeGB) >= 0.5) {
    const pool = memoryPoolLabel(next);
    console.log(`🧠 Now: ~${next.freeGB}GB available / ${next.totalGB}GB ${pool} (~${next.usedGB}GB in use)`);
    const procs = formatGpuProcessSummary(next.processes);
    if (procs) console.log(`   GPU processes: ${procs}`);
  }
  return next;
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
  if (metrics.fromCliFallback || metrics.noRateMetrics) {
    console.log('   ⚠️  No reliable token rates (CLI fallback and/or thinking-model noise).');
    console.log('   Generation TPS needs a successful /api/generate with think:false.');
  }
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

const GiB = 1024 ** 3;

/** Local model metadata from GET /api/tags (size, params, quant, capabilities). */
async function fetchOllamaTagsByName() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: createTimeoutSignal(15000) });
  if (!res.ok) throw new Error(`GET /api/tags failed: HTTP ${res.status}`);
  const data = await res.json();
  const byName = new Map();
  for (const m of data.models || []) {
    const name = m.name || m.model;
    if (!name) continue;
    byName.set(name, m);
    // Also index bare name without :latest
    if (name.endsWith(':latest')) byName.set(name.slice(0, -7), m);
  }
  return byName;
}

function parseParamBillions(meta, name) {
  const ps = meta?.details?.parameter_size;
  if (ps) {
    const b = String(ps).match(/([\d.]+)\s*B\b/i);
    if (b) return parseFloat(b[1]);
    const mil = String(ps).match(/([\d.]+)\s*M\b/i);
    if (mil) return parseFloat(mil[1]) / 1000;
  }
  const fromName = String(name).match(/(?:^|[:\-/_.])(\d+(?:\.\d+)?)[bB](?:$|[^a-zA-Z])/);
  return fromName ? parseFloat(fromName[1]) : null;
}

function isCloudModel(name, meta) {
  if (/:cloud\b/i.test(name) || /\bcloud\b/i.test(String(meta?.remote || ''))) return true;
  const caps = meta?.capabilities || [];
  return caps.includes('cloud');
}

/**
 * Soft fit hint vs available VRAM (prefer free; fall back to total) using on-disk size ≈ weights.
 * Not a guarantee — GPU-fit after load is authoritative.
 * @returns {{ tier: 'ok'|'tight'|'wont_fit'|'cloud'|'unknown', sizeGB: number|null, paramsB: number|null, vision: boolean, hint: string }}
 */
function classifyModelFit(name, meta, vramGB, { freeGB = null, unified = false } = {}) {
  const sizeGB = meta?.size != null ? meta.size / GiB : null;
  const paramsB = parseParamBillions(meta, name);
  const caps = meta?.capabilities || [];
  const family = meta?.details?.family || meta?.details?.families?.[0] || '';
  const vision = caps.includes('vision') || /^gemma4$/i.test(family) || /gemma4/i.test(name);
  const quant = meta?.details?.quantization_level || '';
  // Unified memory is shared with macOS — if free is unknown, budget ~75% of total.
  const availGB =
    freeGB != null && freeGB > 0
      ? freeGB
      : unified && vramGB != null
        ? Math.max(4, Math.round(vramGB * 0.75 * 10) / 10)
        : vramGB;
  const pool = unified ? 'unified' : null;
  const availLabel =
    freeGB != null && vramGB != null && Math.abs(freeGB - vramGB) >= 0.5
      ? `${freeGB}GB available`
      : pool && availGB != null && vramGB != null && availGB < vramGB
        ? `~${availGB}GB usable of ${vramGB}GB unified`
        : vramGB != null
          ? `${vramGB}GB`
          : null;

  if (isCloudModel(name, meta)) {
    return { tier: 'cloud', sizeGB, paramsB, vision, hint: 'cloud — not local GPU' };
  }
  if (availGB == null || availGB < 1) {
    const bits = [];
    if (sizeGB != null) bits.push(`~${sizeGB.toFixed(1)}GB`);
    if (paramsB != null) bits.push(`${paramsB}B`);
    if (vision) bits.push('vision');
    return { tier: 'unknown', sizeGB, paramsB, vision, hint: bits.join(' · ') };
  }

  const ratio = sizeGB != null ? sizeGB / availGB : null;
  // Multimodal / projector models need more free VRAM than disk size alone suggests.
  const wontFit =
    (ratio != null && ratio > 1.05) ||
    (paramsB != null && paramsB >= 14 && availGB <= 12) ||
    (paramsB != null && paramsB >= 12 && availGB <= 8 && (vision || ratio == null || ratio > 0.75)) ||
    (vision && ratio != null && ratio > 0.9);

  const tight =
    !wontFit &&
    ((ratio != null && ratio > 0.68) ||
      (vision && ratio != null && ratio > 0.5) ||
      (paramsB != null && paramsB >= 12 && availGB <= 10) ||
      (paramsB != null && paramsB >= 9 && vision && availGB <= 8 && ratio != null && ratio > 0.55));

  const bits = [];
  if (sizeGB != null) bits.push(`~${sizeGB.toFixed(1)}GB`);
  else if (paramsB != null) bits.push(`~${paramsB}B`);
  if (quant) bits.push(quant);
  if (vision) bits.push('vision');

  if (wontFit) {
    bits.push(`likely OOM on ${availLabel || availGB + 'GB'}`);
    return { tier: 'wont_fit', sizeGB, paramsB, vision, hint: bits.join(' · ') };
  }
  if (tight) {
    bits.push(`tight on ${availLabel || availGB + 'GB'}`);
    return { tier: 'tight', sizeGB, paramsB, vision, hint: bits.join(' · ') };
  }
  return { tier: 'ok', sizeGB, paramsB, vision, hint: bits.join(' · ') };
}

const FIT_TIER_ORDER = { ok: 0, unknown: 1, tight: 2, wont_fit: 3, cloud: 4 };

function buildModelSelectChoices(modelNames, tagsByName, vramGB, { freeGB = null, unified = false } = {}) {
  const annotated = modelNames.map((name) => {
    const meta = tagsByName.get(name) || tagsByName.get(name.replace(/:latest$/, '')) || null;
    const fit = classifyModelFit(name, meta, vramGB, { freeGB, unified });
    return { name, fit };
  });

  annotated.sort((a, b) => {
    const td = FIT_TIER_ORDER[a.fit.tier] - FIT_TIER_ORDER[b.fit.tier];
    if (td !== 0) return td;
    const sa = a.fit.sizeGB ?? 999;
    const sb = b.fit.sizeGB ?? 999;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });

  const choices = [];
  let lastTier = null;
  const sepFor = (tier) => {
    // role:heading skips gray disabled styling; pre-color so sections stay readable.
    if (tier === 'tight') {
      return colors.yellow.bold('── tight (little room for context) ──');
    }
    if (tier === 'wont_fit') {
      return colors.red.bold('── likely too large for this GPU ──');
    }
    if (tier === 'cloud') {
      return colors.cyan.bold('── cloud / remote ──');
    }
    return null;
  };

  for (const { name, fit } of annotated) {
    if (fit.tier !== lastTier) {
      const sep = sepFor(fit.tier);
      if (sep && (fit.tier === 'tight' || fit.tier === 'wont_fit' || fit.tier === 'cloud')) {
        choices.push({ role: 'heading', message: sep });
      }
      lastTier = fit.tier;
    }
    const prefix = fit.tier === 'wont_fit' ? '⚠ ' : fit.tier === 'tight' ? '· ' : fit.tier === 'cloud' ? '☁ ' : '  ';
    choices.push({
      name,
      message: `${prefix}${name}`,
      hint: fit.hint || undefined,
    });
  }
  return { choices, annotated };
}

/** Ascending context sizes offered in prompts (common Ollama / llama.cpp steps). */
const CONTEXT_TIERS = [4096, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304, 131072];

/**
 * Soft labeling guide for the context picker (NOT a hard limit, NOT model-aware).
 * Old vram*2048 was far too low (8GB → 16K) while small/quantized models often hold
 * 64K+ at 100% GPU. Used only to annotate "ambitious" presets.
 */
function maxSuggestedCtxFromVram(vramGB) {
  if (vramGB == null || vramGB < 1) return 65536;
  // Tiered soft guide — prefers under-warning over false "won't fit" labels
  if (vramGB <= 4) return 32768;
  if (vramGB <= 6) return 49152;
  if (vramGB <= 8) return 65536;
  if (vramGB <= 12) return 98304;
  if (vramGB <= 24) return 131072;
  // Large unified-memory Macs (32GB+) — 128K is a reasonable soft ceiling in the picker
  return 131072;
}

function contextTierShortLabel(n) {
  if (n <= 4096) return 'Small / low memory';
  if (n <= 8192) return 'Common default range';
  if (n <= 12288) return 'Medium';
  if (n <= 16384) return 'Large';
  if (n <= 24576) return 'Very large';
  if (n <= 32768) return '32K-class';
  if (n <= 49152) return '48K-class';
  if (n <= 65536) return '64K-class';
  if (n <= 98304) return '96K-class';
  return '128K-class';
}

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

  if (openClaw) {
    for (const t of OPENCLAW_CTX_TIERS) {
      let label = t === 65536 ? 'OpenClaw target (64K)' : contextTierShortLabel(t);
      if (t > maxCtx) label += ' — ambitious for this VRAM (often still OK)';
      opts.push({ name: `${t}  – ${label}`, value: t });
    }
    opts.push({ name: 'custom', message: 'Custom (any number you want)' });
    return opts;
  }

  // Always offer the full tier list (through 128K). Soft VRAM guide only annotates ambitious sizes.
  for (const t of CONTEXT_TIERS) {
    let label = contextTierShortLabel(t);
    if (t > maxCtx) label += ' — ambitious for this VRAM (often still OK)';
    opts.push({ name: `${t}  – ${label}`, value: t });
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

async function checkGPUFit(newName, { unified = false } = {}) {
  console.log(`\n🔍 Testing ${unified ? 'Metal / GPU' : 'GPU'} fit... 🐟`);

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
  let processorInfo = 'unknown';
  let gpuPct = null;
  let cpuPct = null;

  for (let i = 1; i < lines.length; i++) {
    const rowName = lines[i].trim().split(/\s+/)[0];
    if (rowName === newName || rowName === newName + ':latest') {
      const split = lines[i].match(/(\d+)%\/(\d+)%\s*CPU\/GPU/i);
      const full = lines[i].match(/100%\s*GPU/i);
      const metal = lines[i].match(/\bMetal\b/i);
      if (full) {
        processorInfo = '100% GPU';
        gpuPct = 100;
        cpuPct = 0;
      } else if (split) {
        cpuPct = parseInt(split[1], 10);
        gpuPct = parseInt(split[2], 10);
        processorInfo = `${cpuPct}%/${gpuPct}% CPU/GPU`;
      } else if (metal) {
        processorInfo = 'Metal';
        gpuPct = 100;
      } else {
        const anyGpu = lines[i].match(/(\d+)%\s*GPU/i);
        if (anyGpu) {
          gpuPct = parseInt(anyGpu[1], 10);
          processorInfo = `${gpuPct}% GPU`;
        }
      }
      break;
    }
  }

  // Discrete NVIDIA: require 100% GPU. Apple unified memory: Metal / mostly-GPU / unclear ps is OK.
  let ok = processorInfo === '100% GPU' || processorInfo === 'Metal' || (gpuPct != null && gpuPct >= 100);
  if (!ok && unified) {
    if (gpuPct != null && gpuPct >= 50) ok = true;
    else if (processorInfo === 'unknown') ok = true;
  }

  if (processorInfo === '100% GPU' || processorInfo === 'Metal') {
    console.log(`✅ Perfect! Model is on ${processorInfo === 'Metal' ? 'Metal' : 'GPU'} — it's hooked! 🐟`);
  } else if (ok && unified) {
    console.log(
      `✅ Loaded on Apple Silicon (${processorInfo}) — unified memory, treating as GPU-fit OK.`,
    );
  } else if (processorInfo === 'unknown') {
    console.log('⚠️  Could not confirm GPU offload from ollama ps (processor column unknown) — not treating as a hard fail.');
  } else {
    console.log(`⚠️  Not fully on GPU → ${processorInfo}`);
  }
  return ok;
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

async function getSpeedMetrics(newName, timeoutMs = FLAGS.genTimeoutMs, opts = {}) {
  // think:false must be top-level (not inside options) or thinking models (e.g. qwen3.5)
  // burn num_predict on CoT and return empty/useless generation metrics.
  const body = {
    model: newName,
    prompt: 'Tell me a short, fun fact about AI. Reply in one or two sentences.',
    stream: false,
    think: false,
    options: { num_predict: 80 },
  };
  const runUrl = `${OLLAMA_BASE}/api/generate`;
  const skipCliFallback = Boolean(opts.skipCliFallback);

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
      return {
        success: true,
        output: out,
        tokensGenerated: 0,
        tpsEval: 'N/A',
        tpsWall: 'N/A',
        totalTimeSec: (Date.now() - start) / 1000,
        fromCliFallback: true,
        noRateMetrics: true,
      };
    }
    const bits = [errOut, run.error && run.error.message, run.status !== 0 ? `ollama run exit ${run.status}` : ''].filter(Boolean);
    const errMsg = bits.join(' — ') || 'No output from ollama run (model may still be loading — try FINETUNA_GEN_TIMEOUT)';
    return { success: false, errMsg, oom: isOomError(errMsg) };
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
      return { ok: false, errMsg: msg, start, oom: false };
    }
    const end = Date.now();
    const text = await res.text();
    if (!res.ok) {
      const snippet = (text || '').slice(0, 400);
      if (FLAGS.verbose) console.log(`   [verbose] HTTP ${res.status} ${snippet}`);
      const errMsg = `HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`;
      return { ok: false, errMsg, start, oom: isOomError(errMsg) };
    }
    if (!text || !text.trim()) {
      return { ok: false, errMsg: 'Empty body from Ollama /api/generate', start };
    }
    const data = parseGenerateResponseBody(text);
    if (!data) {
      return { ok: false, errMsg: 'Could not parse JSON from /api/generate', start };
    }
    if (data.error) {
      const errMsg = String(data.error);
      return { ok: false, errMsg, start, oom: isOomError(errMsg) };
    }
    const outputText = (data.response || '').trim();
    const tokensGenerated = data.eval_count || 0;
    // Thinking models with think ignored: often empty response + lots of thinking tokens / long duration
    if (!outputText && (data.thinking || tokensGenerated === 0)) {
      return {
        ok: false,
        errMsg: 'Empty response (thinking model may have ignored think:false or burned the token budget)',
        start,
      };
    }
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
        noRateMetrics: tokensGenerated === 0 || tpsEval === 'N/A',
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
        !attempt.oom &&
        (/timed out|AbortError|ECONNREFUSED|fetch failed|Empty body|Empty response|HTTP \d|think:false/i.test(attempt.errMsg || '') ||
          attempt.errMsg === 'Could not parse JSON from /api/generate');
      if (retryable) {
        if (FLAGS.verbose) console.log(`   [verbose] Retrying /api/generate with ${retryMs}ms timeout...`);
        attempt = await tryHttp(retryMs);
      }
    }
    if (!attempt.ok) {
      if (attempt.oom || isOomError(attempt.errMsg)) {
        return { success: false, errMsg: attempt.errMsg, oom: true };
      }
      // Timeouts during load often mean the server is wedged on OOM — CLI fallback just repeats it.
      if (skipCliFallback || /timed out|AbortError/i.test(attempt.errMsg || '')) {
        return {
          success: false,
          errMsg: attempt.errMsg,
          oom: false,
          timedOut: /timed out|AbortError/i.test(attempt.errMsg || ''),
          loadFailed: true,
        };
      }
      console.log(`   ⚠️  /api/generate failed (${attempt.errMsg}); falling back to ollama run (no rate metrics)…`);
      return ollamaRunFallback(attempt.start, cliTimeout);
    }
    return attempt.result;
  } catch (err) {
    return { success: false, errMsg: err.message || String(err) };
  }
}

// Measures prompt-eval speed (TTFT) using a long prompt — this is what num_batch actually affects
async function getPromptEvalMetrics(newName, timeoutMs = FLAGS.timeoutMs) {
  const body = {
    model: newName,
    prompt: LONG_PROMPT,
    stream: false,
    think: false,
    options: { num_predict: 1 },
  };
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
async function collectComparisonMetrics(newName, opts = {}) {
  const gen = await getSpeedMetrics(newName, FLAGS.genTimeoutMs, opts);
  if (!gen.success) return gen;
  const prompt = await getPromptEvalMetrics(newName);
  return {
    ...gen,
    promptEvalRate: prompt.success ? (prompt.promptEvalRate ?? (prompt.promptTps !== 'N/A' ? parseFloat(prompt.promptTps) : null)) : null,
  };
}

async function maybeRenameWithSuggested(currentName, numCtx, flashAttn) {
  const suggested = suggestModelName(currentName, numCtx, flashAttn);
  if (suggested === currentName) return currentName;
  const r = await prompt([
    {
      type: 'confirm',
      name: 'useSuggested',
      message: `Also save as "${suggested}"? (keeps "${currentName}"; self-documenting name for ollama list)`,
      initial: true,
    },
  ]);
  if (!r.useSuggested) return currentName;
  const cp = spawnSync('ollama', ['cp', currentName, suggested], { encoding: 'utf8' });
  if (cp.status !== 0) {
    console.log(`   ⚠️  Could not copy to ${suggested} — keeping ${currentName}`);
    return currentName;
  }
  console.log(`   ✅ Model also available as "${suggested}" (original: ${currentName})`);
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
      `OpenClaw mode: 64K context default, num_keep 64, gemma4 TEMPLATE/RENDERER/PARSER${agentNote}.`,
    );
    console.log('Note: the gemma4 template block is meant for Gemma-class models — other families may need different templates.\n');
  }
  if (flashSupported) {
    console.log('NVIDIA GPU detected — flash attention is a server setting (OLLAMA_FLASH_ATTENTION), not Modelfile.\n');
  } else if (FLAGS.flashAttn === true) {
    console.log('⚠️  --flash-attn set but no NVIDIA GPU name detected locally — setup tips still apply (remote Ollama may differ).\n');
  } else if (process.platform === 'darwin') {
    console.log('🍎 macOS: skipping CUDA flash-attn prompts — Ollama uses Metal (and MLX on supported setups).\n');
  }

  let gpu = detectGpuMemory();
  let vramGB = gpu?.totalGB ?? null;
  let vramFreeGB = gpu?.freeGB ?? null;
  let isUnified = Boolean(gpu?.unified);
  printGpuMemoryReport(gpu);
  if (FLAGS.verbose) console.log(`🔗 Ollama API base: ${OLLAMA_BASE}`);
  console.log('');

  if (!(await warnIfLowFreeVram(gpu))) {
    console.log(
      isUnified
        ? 'Aborting — free unified memory first (quit heavy apps), then re-run.'
        : 'Aborting — free VRAM first (close Hermes / other GPU apps), then re-run.',
    );
    process.exit(0);
  }
  // Re-read after the confirm pause in case the user freed memory.
  gpu = refreshGpuMemory(gpu);
  vramGB = gpu?.totalGB ?? vramGB;
  vramFreeGB = gpu?.freeGB ?? vramFreeGB;
  isUnified = Boolean(gpu?.unified);
  const fitLabel = gpuFitLabel(gpu);

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

  let modelChoices = models;
  let tagsByName = new Map();
  try {
    tagsByName = await fetchOllamaTagsByName();
    const built = buildModelSelectChoices(models, tagsByName, vramGB, { freeGB: vramFreeGB, unified: isUnified });
    modelChoices = built.choices;
    const flagged = built.annotated.filter((a) => a.fit.tier === 'tight' || a.fit.tier === 'wont_fit' || a.fit.tier === 'cloud');
    console.log(`Found ${models.length} model(s).`);
    if (vramGB != null && flagged.length) {
      const vs =
        vramFreeGB != null && Math.abs(vramFreeGB - vramGB) >= 0.5
          ? `~${vramFreeGB}GB available (of ${vramGB}GB ${isUnified ? 'unified' : 'VRAM'})`
          : `~${vramGB}GB ${isUnified ? 'unified memory' : 'VRAM'}`;
      console.log(
        `Grouped by fit vs ${vs} (on-disk size ≈ weights; vision needs more). Still selectable — GPU-fit is authoritative.\n`,
      );
    } else {
      console.log('');
    }
  } catch (err) {
    console.log(`Found ${models.length} model(s) swimming around!`);
    if (FLAGS.verbose) console.log(`   [verbose] /api/tags unavailable (${err.message}); plain list.\n`);
    else console.log('');
  }

  const { sourceModel } = await prompt([
    {
      type: 'select',
      name: 'sourceModel',
      message: 'Which model shall we season and release into the shoal? 🐟',
      choices: modelChoices,
    },
  ]);

  const sourceFit = classifyModelFit(
    sourceModel,
    tagsByName.get(sourceModel) || tagsByName.get(sourceModel.replace(/:latest$/, '')) || null,
    vramGB,
    { freeGB: vramFreeGB, unified: isUnified },
  );
  if (sourceFit.tier === 'wont_fit') {
    console.log(`\n⚠️  ${sourceModel} looks too large for ~${vramFreeGB ?? vramGB}GB available (${sourceFit.hint}).`);
    console.log(
      isUnified
        ? '   You can continue, but expect pressure/OOM — free RAM or pick a smaller sibling.\n'
        : '   You can continue, but expect load OOM — free VRAM or pick a smaller sibling.\n',
    );
  } else if (sourceFit.tier === 'cloud') {
    console.log(`\n⚠️  ${sourceModel} looks like a cloud/remote model — local GPU tuning may not apply.\n`);
  } else if (sourceFit.tier === 'tight') {
    console.log(
      `\n· ${sourceModel} is tight on ~${vramFreeGB ?? vramGB}GB available (${sourceFit.hint}) — start with modest num_ctx.\n`,
    );
  }

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
        'OpenClaw targets 65536 context; VRAM could not be detected — start at 64K and trust GPU-fit / auto-tune.\n',
      );
    } else if (maxCtx < 65536) {
      console.log(
        `OpenClaw targets 65536; soft guide for ~${vramGB}GB is ${maxCtx}. Smaller/quantized models often still fit — GPU-fit is authoritative.\n`,
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

  const { numBatch } = await prompt([
    {
      type: 'input',
      name: 'numBatch',
      message: 'Batch size (num_batch) – higher often helps prompt eval / TTFT (not generation TPS):',
      initial: '512',
    },
  ]);
  const { numGpu } = await prompt([{ type: 'input', name: 'numGpu', message: 'GPU layers (num_gpu) – 999 = max possible:', initial: '999' }]);

  if (FLAGS.flashAttn === true) {
    sessionFlashAttn = true;
    printFlashAttnGuidance();
  } else if (FLAGS.flashAttn === false) {
    sessionFlashAttn = false;
  } else if (isFlashAttnEnvEnabled()) {
    sessionFlashAttn = true;
    console.log(
      'OLLAMA_FLASH_ATTENTION is set in *this* process environment (may not match a remote/systemd Ollama server).\n',
    );
  } else if (flashSupported) {
    const r = await prompt([
      {
        type: 'confirm',
        name: 'useFlash',
        message: 'Tag model as flash-capable and show OLLAMA_FLASH_ATTENTION setup tips? (server must actually have it enabled)',
        initial: false,
      },
    ]);
    sessionFlashAttn = r.useFlash;
    if (sessionFlashAttn) printFlashAttnGuidance();
  }

  const vramComment = vramGB
    ? isUnified
      ? vramFreeGB != null
        ? `Tuned on Apple Silicon ~${vramGB}GB unified (~${vramFreeGB}GB available; Metal/MLX)`
        : `Tuned on Apple Silicon ~${vramGB}GB unified memory (Metal/MLX)`
      : vramFreeGB != null
        ? `Tuned with ~${vramGB}GB VRAM (~${vramFreeGB}GB free at create; validate with GPU-fit)`
        : `Tuned with ~${vramGB}GB VRAM detected (validate with GPU-fit)`
    : 'Tuned for your GPU (memory not auto-detected)';
  const modelfileContent = buildModelfileContent({ sourceModel, vramComment, numCtx, numGpu, numBatch, flashAttn: sessionFlashAttn });

  const modelfilePath = path.join(process.cwd(), 'Modelfile-finetuna');
  fs.writeFileSync(modelfilePath, modelfileContent);
  console.log(`\n✅ Modelfile created at ${modelfilePath} — seasoned and ready!`);

  console.log(`\n🎣 Creating new model: ${newName} ...`);
  spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
  console.log(`\n🎉 Model "${newName}" created successfully! It’s a keeper! 🐟`);
  console.log('   (Note: ollama create only registers the Modelfile — load/VRAM is checked next.)');

  let fullGPU = false;
  let currentCtx = numCtx;
  let bestBatch = null;
  let beforeMetrics = null;
  let afterMetrics = null;

  gpu = refreshGpuMemory(gpu);
  vramGB = gpu?.totalGB ?? vramGB;
  vramFreeGB = gpu?.freeGB ?? vramFreeGB;
  if (gpu?.freeGB != null) {
    const pool = memoryPoolLabel(gpu);
    console.log(`\n🧠 Before load: ~${gpu.freeGB}GB available / ${gpu.totalGB}GB ${pool}`);
    const procs = formatGpuProcessSummary(gpu.processes);
    if (procs) console.log(`   GPU processes: ${procs}`);
    if (gpu.usedGB != null && gpu.usedGB >= 1.5 && gpu.freeGB < (isUnified ? 6 : 4)) {
      console.log(
        isUnified
          ? '   ⚠️  Available unified memory is low — quit heavy apps before load.'
          : '   ⚠️  Free VRAM is low — Hermes or other apps may cause OOM on load.',
      );
    }
  }

  console.log('\n📏 Baseline speed (before auto-tune)...');
  beforeMetrics = await collectComparisonMetrics(newName);
  if (beforeMetrics.success) {
    console.log('\n✅ Response:');
    if (beforeMetrics.output) console.log(beforeMetrics.output.trim());
    printSpeedSummary(beforeMetrics, { title: 'Baseline performance' });
  } else {
    console.log('⚠️  Could not measure baseline speed.');
    // Full Ollama error blobs are noisy; printOomGuidance summarizes when it's OOM.

    if (beforeMetrics.oom || isOomError(beforeMetrics.errMsg) || beforeMetrics.timedOut || beforeMetrics.loadFailed) {
      let oomKind = printOomGuidance({
        sourceModel,
        vramGB,
        numCtx: currentCtx,
        errMsg: beforeMetrics.errMsg,
        sameAllocAsBefore: false,
        unified: isUnified,
      });
      await freeGpuVram();
      let lastAlloc = extractCudaAllocBytes(beforeMetrics.errMsg);

      while (oomKind !== 'wont_fit') {
        const lowerOptions = getContextOptions(vramGB, { openClaw: FLAGS.openClaw }).filter(
          (o) => o.value != null && o.value !== 'custom' && o.value < currentCtx,
        );
        if (lowerOptions.length === 0) {
          printOomGuidance({
            sourceModel,
            vramGB,
            numCtx: currentCtx,
            errMsg: beforeMetrics.errMsg,
            sameAllocAsBefore: true,
            unified: isUnified,
          });
          break;
        }
        lowerOptions.push({ name: 'custom', message: 'Custom (lower)' });

        const { reduce } = await prompt([
          {
            type: 'confirm',
            name: 'reduce',
            message: `Drop num_ctx below ${currentCtx} and recreate so it can load?`,
            initial: true,
          },
        ]);
        if (!reduce) break;

        const { newCtxChoice } = await prompt([
          { type: 'select', name: 'newCtxChoice', message: 'Pick a lower context size:', choices: lowerOptions },
        ]);
        const rawNew = unwrapChoice(newCtxChoice);
        currentCtx =
          rawNew === 'custom'
            ? parseInt(
                (
                  await prompt([
                    {
                      type: 'input',
                      name: 'custom',
                      message: 'Custom context:',
                      initial: String(Math.max(2048, Math.floor(currentCtx / 2))),
                    },
                  ])
                ).custom,
                10,
              )
            : rawNew;
        numCtx = currentCtx;

        const fallbackBatch = parseInt(numBatch, 10) || 512;
        const newContent = buildModelfileContent({
          sourceModel,
          vramComment,
          numCtx: currentCtx,
          numGpu,
          numBatch: fallbackBatch,
          flashAttn: sessionFlashAttn,
        });
        fs.writeFileSync(modelfilePath, newContent);
        console.log(`\n🔄 Recreating ${newName} with num_ctx = ${currentCtx} ...`);
        spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
        await freeGpuVram();

        console.log('\n📏 Retrying baseline speed...');
        beforeMetrics = await collectComparisonMetrics(newName, { skipCliFallback: true });
        if (beforeMetrics.success) {
          console.log('\n✅ Response:');
          if (beforeMetrics.output) console.log(beforeMetrics.output.trim());
          printSpeedSummary(beforeMetrics, { title: 'Baseline performance' });
          break;
        }
        const alloc = extractCudaAllocBytes(beforeMetrics.errMsg);
        const sameAlloc = alloc != null && lastAlloc != null && alloc === lastAlloc;
        if (beforeMetrics.oom || isOomError(beforeMetrics.errMsg) || beforeMetrics.timedOut) {
          console.log(`⚠️  Still OOM (${printOomBrief(beforeMetrics.errMsg)}).`);
          oomKind = printOomGuidance({
            sourceModel,
            vramGB,
            numCtx: currentCtx,
            errMsg: beforeMetrics.errMsg,
            sameAllocAsBefore: sameAlloc,
            unified: isUnified,
          });
          if (alloc != null) lastAlloc = alloc;
          continue;
        }
        console.log('⚠️  Still failing to load.');
        if (beforeMetrics.errMsg) console.log(`   ${printOomBrief(beforeMetrics.errMsg)}`);
        break;
      }
    }
  }
  let measuredSinceCreate = Boolean(beforeMetrics?.success);
  let autoTune = FLAGS.autoTune;
  if (!measuredSinceCreate) {
    console.log('\n⚠️  Skipping auto-tune until the model loads.');
    autoTune = false;
  } else if (!autoTune) {
    const r = await prompt([
      {
        type: 'confirm',
        name: 'autoTune',
        message: `Would you like to auto-tune for maximum speed while staying on ${fitLabel}? 🐟`,
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
    const baselineBatch = currentBatch;
    const baselineCtx = currentCtx;
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

        const gpuOk = await checkGPUFit(newName, { unified: isUnified });
        if (!gpuOk) {
          console.log(`   ⚠️  num_batch=${cand} not confirmed ${fitLabel} — skipping`);
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
      console.log(`  Testing context sizes — skipping any that won't fit ${fitLabel}.\n`);

      const { ctxGoal } = await prompt([
        {
          type: 'select',
          name: 'ctxGoal',
          message: 'What do you want to optimize for? 🐟',
          choices: [
            { name: 'max-context', message: `Max context  — largest window that still fits ${fitLabel}` },
            { name: 'max-speed', message: `Max speed    — fastest generation TPS at ${fitLabel}` },
          ],
        },
      ]);

      // Pivot on the chosen size: current first → down if needed → up if it fits
      const plan = buildCtxSweepPlan(currentCtx, { openClaw: FLAGS.openClaw });
      const preview = [plan.current, ...plan.lowerDesc, ...plan.higherAsc];

      console.log(
        '   Strategy:   ' +
          (ctxGoal === 'max-context' ? `Largest context that fits ${fitLabel}` : `Fastest generation speed at ${fitLabel}`),
      );
      console.log(`   Pivot:      ${plan.current} (test current first; step down only if it fails; then probe up)`);
      console.log('   Candidates: ' + preview.join(', '));
      console.log('   Repeats: ' + repeatCount);
      console.log(`   Only candidates with ${fitLabel} offload will be kept.\n`);

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
        const gpuOk = await checkGPUFit(newName, { unified: isUnified });
        if (!gpuOk) {
          console.log(`   ⚠️  num_ctx=${cand} not confirmed ${fitLabel}`);
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
          console.log(`\n   ✅ Largest ${fitLabel} context: ${bestCtx} (${bestCtxEntry.avg.toFixed(1)} t/s)`);
        } else {
          console.log(`\n   ✅ Fastest at ${fitLabel}: ${bestCtx} (${bestCtxEntry.avg.toFixed(1)} t/s)`);
        }
      } else {
        const gpuOnly = [...ctxResults].filter((r) => r.gpu).sort((a, b) => b.cand - a.cand)[0];
        if (gpuOnly) {
          bestCtx = gpuOnly.cand;
          console.log(`\n   ⚠️  Benchmarks failed; using largest GPU-fitting context (${bestCtx}) without TPS data.`);
        } else {
          console.log(`\n   ⚠️  No contexts fit ${fitLabel} — keeping original.`);
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
    console.log('\n   ✅ Final model created with best settings among candidates tested.');

    console.log('\n📏 Speed after auto-tune...');
    afterMetrics = await collectComparisonMetrics(newName);
    if (afterMetrics.success) {
      console.log('\n✅ Response:');
      if (afterMetrics.output) console.log(afterMetrics.output.trim());
      printSpeedSummary(afterMetrics, { title: 'After auto-tune' });
    }
    printAutoTuneComparison(beforeMetrics, afterMetrics);
    measuredSinceCreate = Boolean(afterMetrics?.success);

    if (isAutoTuneNetNegative(beforeMetrics, afterMetrics)) {
      const b = metricEvalRate(beforeMetrics);
      const a = metricEvalRate(afterMetrics);
      const grewCtx = bestCtx > baselineCtx;
      console.log(
        `\n⚠️  Auto-tune is slower on eval_rate (${formatRate(b)} → ${formatRate(a)}; >5% drop).`,
      );
      console.log(
        grewCtx
          ? '   Context grew — a modest speed drop can still be a good trade.'
          : '   You can keep these settings or revert to your pre-tune baseline.',
      );
      const { keepTuned } = await prompt([
        {
          type: 'confirm',
          name: 'keepTuned',
          message: `Keep tuned settings (batch ${bestBatch}, ctx ${bestCtx})? (No = revert to batch ${baselineBatch}, ctx ${baselineCtx})`,
          initial: grewCtx,
        },
      ]);
      if (!keepTuned) {
        bestBatch = baselineBatch;
        bestCtx = baselineCtx;
        currentCtx = baselineCtx;
        const revertContent = buildModelfileContent({
          sourceModel,
          vramComment,
          numCtx: baselineCtx,
          numGpu,
          numBatch: baselineBatch,
          flashAttn: sessionFlashAttn,
          finetunaNote: 'baseline restored after slower auto-tune',
        });
        fs.writeFileSync(modelfilePath, revertContent);
        spawnSync('ollama', ['create', newName, '-f', modelfilePath], { stdio: 'inherit' });
        console.log(`\n   ✅ Reverted to baseline (num_batch=${baselineBatch}, num_ctx=${baselineCtx}).`);
        afterMetrics = await collectComparisonMetrics(newName);
        if (afterMetrics.success) printSpeedSummary(afterMetrics, { title: 'After revert' });
      }
    }

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
    fullGPU = await checkGPUFit(newName, { unified: isUnified });

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

  let finalName = await maybeRenameWithSuggested(newName, currentCtx, sessionFlashAttn);

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
