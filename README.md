# Finetuna

**Turn an Ollama model into a GPU-tuned, reusable variant** — with a Modelfile you can keep, a name you can remember, and optional auto-tune so context and batch fit *your* VRAM.

```bash
pnpm start
# → pick a model → create my-model-ctx32k → ollama run my-model-ctx32k
```

## Why it exists

Ollama’s defaults are safe but often leave performance (and context) on the table. Hand-editing Modelfiles and guessing `num_ctx` / `num_batch` is slow. Tools that only *benchmark* max context are useful — Finetuna goes one step further: it **creates the tuned model**, checks **GPU / Metal fit**, and can **auto-tune** until you have a stable recipe for apps and agents.

| You want… | Finetuna |
|-----------|----------|
| A named model you can `ollama run` forever | Yes — writes Modelfile + `ollama create` |
| Proof it stays on the GPU | Yes — checks `ollama ps` (`100% GPU` or Metal on Apple Silicon) |
| Best context *and* batch for speed | Optional auto-tune (pivot from your pick, not always 4K→up) |
| OpenClaw / agent-friendly presets | `--openclaw` / `--openclaw-agent` |
| Free memory for another app that needs the GPU | `--unload` / `--reload` |

Not a full Ollama *server* optimizer (flash attention, KV cache env vars live on the Ollama service). Finetuna is the **interactive Modelfile tuner**.

## What a run looks like

1. Choose a source model and a new name (list grouped vs **free** memory when detectable; flags tight / too large / cloud)  
2. Pick context / batch / GPU layers (presets through **128K**; sizes above a soft memory guide are labeled ambitious — not a hard limit)  
3. Finetuna writes **`Modelfile-finetuna`** and runs **`ollama create`**  
4. Measures baseline speed (`eval_rate` / `prompt_eval_rate`; thinking models use `think: false` for clean benches)  
5. Optionally auto-tunes `num_batch` then `num_ctx` (probes via API options; one final create), with before/after rates  
6. Suggests a self-documenting name like `gemma4-ctx32k-flash`  
7. Saves state for `--reload` later  

Goal: an **optimum that still fits in memory** — not “always shrink context.” If your size already fits, auto-tune probes *up*; if it doesn’t, it steps *down*.

### Apple Silicon (Mac)

On M-series Macs there is no separate VRAM — CPU and GPU share **unified memory**. Finetuna detects that via `sysctl` / `vm_stat` and:

- Reports total / available unified memory (not `nvidia-smi`)
- Groups models against **available** memory, leaving headroom for macOS
- Treats **Metal** / mostly-GPU `ollama ps` rows as a successful fit (not only `100% GPU`)
- Skips CUDA flash-attention prompts (Ollama uses Metal; MLX preview on newer Ollama prefers ≥32GB)

Use normal Ollama Metal/MLX models from the library — no special Finetuna flag required. Keep Ollama updated for the best Apple Silicon runners.

## Prerequisites

- Node.js **18+**
- [pnpm](https://pnpm.io/installation)
- [Ollama](https://ollama.com) installed and running, with at least one model pulled
- Optional: memory hints via `nvidia-smi` (VRAM), Apple `sysctl`/`vm_stat` (unified memory), AMD `rocm-smi`, or Windows WMI

## Install

```bash
git clone git@github.com:Catalyst-Forge-LLC/finetuna.git
cd finetuna
pnpm install
```

HTTPS: `https://github.com/Catalyst-Forge-LLC/finetuna.git`

## Quick start

```bash
pnpm start
# or: node finetuna.js
```

Then:

```bash
ollama run your-tuned-model-name
```

Common invocations:

```bash
node finetuna.js --auto-tune
node finetuna.js --openclaw --auto-tune   # 64K-oriented OpenClaw preset
node finetuna.js --benchmark-report
node finetuna.js --unload                 # free VRAM (alias: --panic)
node finetuna.js --reload                 # warm last model from .finetuna-state.json
node finetuna.js --help
```

## Flags

| Flag | Purpose |
|------|---------|
| `--auto-tune` | Run batch/context benchmarks without the confirm prompt |
| `--skip-batch` / `--skip-ctx` | Skip Phase 1 or Phase 2 of auto-tune |
| `--openclaw` | OpenClaw preset: 64K context default, `num_keep 64`, Gemma4 template block |
| `--openclaw-agent` | Same as `--openclaw` plus `temperature 0.1` / `top_k 20` |
| `--no-openclaw` | Disable OpenClaw block even if `FINETUNA_OPENCLAW` is set |
| `--flash-attn` / `--no-flash-attn` | Tag `-flash` naming + print `OLLAMA_FLASH_ATTENTION` setup tips |
| `--benchmark-report` | Markdown table + `finetuna-benchmark.md` |
| `--unload` / `--panic` | Evict loaded models from VRAM (`keep_alive: 0`) |
| `--reload` | Load the last Finetuna model from `.finetuna-state.json` |
| `--verbose` | Extra API / `ollama` diagnostics |
| `--timeout` / `--gen-timeout` / `--bench-repeats` | Timing and repeat controls |

**Flash attention** is an Ollama *server* setting (`OLLAMA_FLASH_ATTENTION=1`), not a Modelfile parameter. Finetuna will not inject `flash_attn` (Ollama rejects it). Restart Ollama after changing the env var.

## Outputs

| File | When |
|------|------|
| `Modelfile-finetuna` | Every create / recreate (editable; overwritten on the next recreate) |
| `finetuna-results.json` | After auto-tune (rates, before/after, settings) |
| `finetuna-benchmark.md` | With `--benchmark-report` |
| `.finetuna-state.json` | End of a normal run — used by `--reload` (gitignored) |

## Environment variables

| Variable | Role | Default |
|----------|------|---------|
| `OLLAMA_HOST` | Ollama HTTP API base | `http://127.0.0.1:11434` |
| `FINETUNA_TIMEOUT` | Prompt-eval / short API timeout (ms) | `20000` |
| `FINETUNA_GEN_TIMEOUT` | Generation benchmark timeout (ms). Cold loads may need `120000+` | `60000` |
| `BENCH_REPEATS` | Auto-tune repeats per candidate | `3` |
| `FINETUNA_OPENCLAW` | `1` / `true` / `yes` → same as `--openclaw` | off |
| `FINETUNA_FLASH_ATTN` | Flash naming/tips; unset = prompt on capable GPUs | auto |

```bash
export FINETUNA_GEN_TIMEOUT=120000
export BENCH_REPEATS=5
pnpm start
```

```powershell
$env:FINETUNA_GEN_TIMEOUT = '120000'
$env:BENCH_REPEATS = '5'
pnpm start
```

## Tips

- **Memory hints** are a soft, model-agnostic guide (not a limit). GPU-fit (`100% GPU` / Metal on Mac) is the real check. Presets go through **128K**.
- **Apple Silicon:** unified memory is shared with macOS — quit heavy apps if loads OOM; prefer Metal/MLX-ready models from Ollama.
- **Thinking models** (e.g. qwen3.5): benchmarks send `think: false` so rates aren’t eaten by chain-of-thought.
- **Auto-tune** probes `num_batch` / `num_ctx` via `/api/generate` **options** (no recreate per candidate), then runs one final `ollama create` for the winner. Use a lower `BENCH_REPEATS` for an even quicker pass.
- **Remote Ollama:** `OLLAMA_HOST=http://192.168.1.10:11434`
- **`--verbose`** when HTTP calls fail or the host URL looks wrong.

## License

[MIT](LICENSE)
