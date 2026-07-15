# Finetuna

Interactive CLI that finds good Ollama settings for your GPU — context window, batch size, and optional flash attention — then writes a reusable Modelfile and creates the tuned model.

## What it does

You pick a source model and a starting context size. Finetuna:

1. Writes **`Modelfile-finetuna`** and runs **`ollama create`**
2. Checks whether the model is fully on the GPU (`100% GPU` in `ollama ps`)
3. Optionally **auto-tunes** `num_batch` and `num_ctx` with benchmarks, pivoting from your chosen context (test current first, step down only if needed, then probe larger sizes)
4. Reports **`eval_rate`** / **`prompt_eval_rate`** (with a before/after table when auto-tune runs)
5. Can suggest a self-documenting name like `gemma4-ctx32k-flash`

The goal is an **optimum that still fits in VRAM**, not “always shrink context.” If your pick already fits, auto-tune looks upward for more context (or for speed, compares nearby sizes).

## Prerequisites

- Node.js **18+**
- [pnpm](https://pnpm.io/installation)
- [Ollama](https://ollama.com) installed and running, with at least one model pulled
- Optional: `nvidia-smi` (or AMD `rocm-smi` / Windows WMI) for VRAM hints and flash-attention detection

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

Follow the prompts: choose a model, name the tuned variant, pick context / batch / GPU layers, then optionally run auto-tune.

```bash
ollama run your-model-name
```

Useful one-liners:

```bash
node finetuna.js --auto-tune
node finetuna.js --openclaw --auto-tune
node finetuna.js --benchmark-report
node finetuna.js --unload          # free VRAM (alias: --panic)
node finetuna.js --reload          # warm last model from .finetuna-state.json
node finetuna.js --help
```

## Flags (overview)

| Flag | Purpose |
|------|---------|
| `--auto-tune` | Run batch/context benchmarks without the confirm prompt |
| `--skip-batch` / `--skip-ctx` | Skip Phase 1 or Phase 2 of auto-tune |
| `--openclaw` | OpenClaw preset: 64K context default, `num_keep 64`, Gemma4 template block |
| `--openclaw-agent` | Same as `--openclaw` plus `temperature 0.1` / `top_k 20` |
| `--no-openclaw` | Disable OpenClaw block even if `FINETUNA_OPENCLAW` is set |
| `--flash-attn` / `--no-flash-attn` | Tag `-flash` naming + print `OLLAMA_FLASH_ATTENTION` setup tips (server-side; not a Modelfile param) |
| `--benchmark-report` | Print a markdown table and write `finetuna-benchmark.md` |
| `--unload` / `--panic` | Evict loaded models from VRAM (`keep_alive: 0`) |
| `--reload` | Load the last Finetuna model from `.finetuna-state.json` |
| `--verbose` | Extra API / `ollama` diagnostics |
| `--timeout` / `--gen-timeout` / `--bench-repeats` | Timing and repeat controls |

**Flash attention** is an Ollama *server* setting (`OLLAMA_FLASH_ATTENTION=1`), not a Modelfile `PARAMETER`. Finetuna will not inject `flash_attn` into the Modelfile (Ollama rejects it). Use `--flash-attn` (or the prompt on RTX GPUs) for setup tips and a `-flash` model name tag. Restart Ollama after setting the env var.

## Outputs

| File | When |
|------|------|
| `Modelfile-finetuna` | Every create / recreate (safe to edit; Finetuna overwrites on the next recreate) |
| `finetuna-results.json` | After auto-tune (rates, before/after, settings; model name matches rename if you accepted it) |
| `finetuna-benchmark.md` | With `--benchmark-report` |
| `.finetuna-state.json` | End of a normal run — used by `--reload` (gitignored) |

## Environment variables

| Variable | Role | Default |
|----------|------|---------|
| `OLLAMA_HOST` | Ollama HTTP API base | `http://127.0.0.1:11434` |
| `FINETUNA_TIMEOUT` | Prompt-eval / short API timeout (ms) | `20000` |
| `FINETUNA_GEN_TIMEOUT` | Generation benchmark timeout (ms). Large cold loads may need `120000+` | `60000` |
| `BENCH_REPEATS` | Auto-tune repeats per candidate | `3` |
| `FINETUNA_OPENCLAW` | `1` / `true` / `yes` → same as `--openclaw` | off |
| `FINETUNA_FLASH_ATTN` | `1`/`true` → flash naming/tips; `0`/`false` → off; unset = prompt on capable GPUs | auto |

```bash
# bash / zsh
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

- **VRAM detection** is best-effort. If it fails, pick context manually (or use OpenClaw’s 64K starting point and let GPU-fit / auto-tune step down).
- **Flash attention:** set `OLLAMA_FLASH_ATTENTION=1` on the Ollama **server** host and restart Ollama. On Linux (systemd): put `Environment="OLLAMA_FLASH_ATTENTION=1"` in `/etc/systemd/system/ollama.service.d/flash.conf`, then `daemon-reload` + `restart ollama`. Finetuna cannot toggle this per model.
- **Auto-tune** recreates the model many times — leave time, and lower `BENCH_REPEATS` for a quicker pass.
- **Remote Ollama:** `OLLAMA_HOST=http://192.168.1.10:11434`
- **`--verbose`** helps when HTTP calls fail or the host URL is wrong.

## License

[MIT](LICENSE)
