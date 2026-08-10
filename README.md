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
| OpenClaw / Hermes / Continue presets | `--openclaw` / `--hermes` / `--continue` |
| Free memory for another app that needs the GPU | `--unload` / `--reload` |

Not a full Ollama *server* optimizer (flash attention, KV cache env vars live on the Ollama service). Finetuna is the **interactive Modelfile tuner**.

## Related: ollanet

**Finetuna** runs on the machine that hosts Ollama. To *discover and chat* with those models from another box on your LAN, Tailscale, or VPN, use **[ollanet](https://github.com/Catalyst-Forge-LLC/ollanet)**.

Typical loop:

1. Here: `pnpm start` / Finetuna → create a tuned model (e.g. `gemma4-ctx32k`)
2. Elsewhere: `ollanet scan` → `ollanet prompt this-host gemma4-ctx32k "…"`

Same Ollama API — Finetuna shapes the models; ollanet finds and uses them over the network.

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
node finetuna.js --hermes --auto-tune     # 64K + Hermes config snippet
node finetuna.js --continue --auto-tune   # 16K coding preset + Continue snippet
node finetuna.js --openclaw --auto-tune   # 64K OpenClaw + gemma4 template
node finetuna.js --max-vram --auto-tune   # fill dedicated NVIDIA VRAM (high ctx)
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
| `--openclaw` | OpenClaw preset: 64K context, `num_keep 64`, Gemma4 template block |
| `--openclaw-agent` | Same as `--openclaw` plus `temperature 0.1` / `top_k 20` |
| `--no-openclaw` | Clear OpenClaw preset even if `FINETUNA_OPENCLAW` is set |
| `--hermes` | Hermes Agent preset: 64K context, `num_keep`, agent sampling + `~/.hermes/config.yaml` snippet |
| `--continue` | Continue.dev preset: 16K context default, coding temperature + Continue `config.yaml` snippet |
| `--max-vram` | Target max **dedicated NVIDIA** VRAM: high `num_ctx` default + auto-tune max-context (ignores Intel iGPU shared RAM) |
| `--flash-attn` / `--no-flash-attn` | Tag `-flash` naming + print `OLLAMA_FLASH_ATTENTION` setup tips |
| `--benchmark-report` | Markdown table + `finetuna-benchmark.md` |
| `--unload` / `--panic` | Evict loaded models from VRAM (`keep_alive: 0`) |
| `--reload` | Load the last Finetuna model from `.finetuna-state.json` |
| `--verbose` | Extra API / `ollama` diagnostics |
| `--timeout` / `--gen-timeout` / `--bench-repeats` | Timing and repeat controls |

Client presets are mutually exclusive (last flag wins): `--openclaw` | `--hermes` | `--continue`.

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
| `FINETUNA_HERMES` | `1` / `true` / `yes` → same as `--hermes` | off |
| `FINETUNA_CONTINUE` | `1` / `true` / `yes` → same as `--continue` | off |
| `FINETUNA_MAX_VRAM` | `1` / `true` / `yes` → same as `--max-vram` | off |
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

- **Client presets:** `--hermes` (64K agent + Hermes yaml), `--continue` (16K coding + Continue yaml), `--openclaw` (64K + gemma4 template). Last flag wins. Match client `contextLength` / `ollama_num_ctx` to the tuned `num_ctx`. Use `--unload` when switching apps that share the GPU.
- **`--max-vram`:** uses free **dedicated NVIDIA** VRAM (not Iris Xe shared RAM). Starts the context picker high and auto-tunes for largest fitting `num_ctx`. Close Cursor/other GPU apps first so more dedicated memory is free.
- **GPU-heavy apps:** browsers (Brave/Chrome), IDEs, and other compute apps can quietly park several GB of VRAM. Finetuna flags them by name in the `GPU processes` line and low-free warnings (e.g. `brave.exe (browser — can hold GBs)`) and, with `--max-vram`, nudges you to close the specific offenders. On Windows, per-process VRAM shows as N/A (WDDM), so use `nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader` to see exact amounts.
- **Memory hints** are a soft, model-agnostic guide (not a limit). GPU-fit (`100% GPU` / Metal on Mac) is the real check. Presets go through **128K**.
- **Apple Silicon:** unified memory is shared with macOS — quit heavy apps if loads OOM; prefer Metal/MLX-ready models from Ollama.
- **Thinking models** (e.g. qwen3.5): benchmarks send `think: false` so rates aren’t eaten by chain-of-thought.
- **Auto-tune** probes `num_batch` / `num_ctx` via `/api/generate` **options** (no recreate per candidate), then runs one final `ollama create` for the winner. Use a lower `BENCH_REPEATS` for an even quicker pass.
- **Remote Ollama:** `OLLAMA_HOST=http://192.168.1.10:11434` — or discover/chat from another machine with [ollanet](https://github.com/Catalyst-Forge-LLC/ollanet)
- **`--verbose`** when HTTP calls fail or the host URL looks wrong.

## License

[MIT](LICENSE)
