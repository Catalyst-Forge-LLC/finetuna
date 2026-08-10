# Finetuna

**Fit more context on your GPU — and keep it.** VRAM-aware context tuner for Ollama.

> **Not** weight fine-tuning (no LoRA/QLoRA/training). Finetuna tunes **runtime** settings — `num_ctx`, `num_batch`, `num_gpu` — and saves them as a reusable named model.

```bash
finetuna --check              # will it fit? how much context can I get?
finetuna                      # create a named variant you can keep
finetuna --auto-tune          # optional: search batch/context with trustworthy stats
```

## The problem you can't see

If even a few layers spill to CPU, generation can slow down **5–10×**. Most people never check whether their model is fully resident — and Ollama's conservative defaults leave plenty of 24GB cards quietly running 4K context.

Finetuna answers three questions:

| Question | What you get |
|----------|----------------|
| *Will it fit?* | Verified via `/api/ps` (`size_vram` / `size`) — not a guess |
| *How much context can I actually get?* | Largest window that stays on the GPU |
| *Can I keep it?* | A named Modelfile variant any client can use forever |

Honest **“no change needed”** is a feature. Auto-tune only switches settings when the win beats measured noise (median + spread, aligned with [ollanet](https://github.com/Catalyst-Forge-LLC/ollanet) bench).

| You want… | Finetuna |
|-----------|----------|
| A named model you can `ollama run` forever | Yes — writes Modelfile + `ollama create` |
| Proof it stays on the GPU | Yes — `/api/ps` residency check |
| Largest context that still fits | Yes — fit search (+ optional speed tune) |
| Safe “look but don't touch” | `--check` / `--dry-run` (no create) |
| OpenClaw / Hermes / Continue presets | `--openclaw` / `--hermes` / `--continue` |
| Free memory for another GPU app | `--unload` / `--reload` |

Not a full Ollama *server* optimizer (flash attention, KV cache env vars live on the Ollama service).

## Related: ollanet

**Finetuna** runs on the machine that hosts Ollama. To *discover and chat* with those models from another box on your LAN, Tailscale, or VPN, use **[ollanet](https://github.com/Catalyst-Forge-LLC/ollanet)**.

Typical loop:

1. Here: `finetuna` → create a tuned model (e.g. `gemma4-ctx32k`)
2. Elsewhere: `ollanet scan` → `ollanet prompt this-host gemma4-ctx32k "…"`

Same Ollama API — Finetuna shapes the models; ollanet finds and uses them over the network.

## What a run looks like

1. Choose a source model and a new name (list grouped vs **free** memory when detectable)  
2. Pick context / batch / GPU layers (presets through **128K**)  
3. Finetuna writes **`Modelfile-finetuna`** and runs **`ollama create`**  
4. Measures baseline speed (`eval_rate` / `prompt_eval_rate`; thinking models use `think: false`)  
5. Optionally auto-tunes `num_batch` then `num_ctx` (API options probe; one final create)  
6. Suggests a self-documenting name like `gemma4-ctx32k-flash`  
7. Saves state for `--reload` later  

Goal: an **optimum that still fits in memory** — not “always shrink context,” not “always claim a speedup.”

### Apple Silicon (Mac)

On M-series Macs there is no separate VRAM — CPU and GPU share **unified memory**. Finetuna detects that via `sysctl` / `vm_stat` and:

- Reports total / available unified memory (not `nvidia-smi`)
- Groups models against **available** memory, leaving headroom for macOS
- Treats full `/api/ps` residency (`size_vram ≈ size`) as GPU-fit; Apple Silicon uses a softer unified-memory ratio
- Skips CUDA flash-attention prompts (Ollama uses Metal; MLX preview on newer Ollama prefers ≥32GB)

Use normal Ollama Metal/MLX models from the library — no special Finetuna flag required.

## Prerequisites

- Node.js **18+**
- [Ollama](https://ollama.com) installed and running, with at least one model pulled
- Optional: [pnpm](https://pnpm.io/installation) for checkout development
- Optional: memory hints via `nvidia-smi`, Apple `sysctl`/`vm_stat`, AMD `rocm-smi`, or Windows WMI

## Install

**Global:**

```bash
npm install -g finetuna
# or: pnpm add -g finetuna
finetuna --help
```

From GitHub:

```bash
npm install -g github:Catalyst-Forge-LLC/finetuna
```

**From a checkout (dev):**

```bash
git clone git@github.com:Catalyst-Forge-LLC/finetuna.git
cd finetuna
pnpm install
pnpm start
```

### Where files go

| Mode | Modelfile | State / results / benchmark |
|------|-----------|-----------------------------|
| Checkout (`pnpm start`) | `./Modelfile-finetuna` | current directory |
| Installed (`finetuna` on PATH) | `./Modelfile-finetuna` (cwd) | `~/.finetuna/` |

Override the data directory with `FINETUNA_DIR`. `--reload` reads state from that data dir, so after a global install it works from any cwd.

## Quick start

```bash
finetuna --check              # report fit / context headroom (no create)
finetuna --check --model llama3.2 --json
finetuna --verify my-model-ctx32k
finetuna --model llama3.2 --name llama3.2-ft --ctx 32768 --auto-tune   # non-interactive
finetuna                      # interactive create
```

Common invocations:

```bash
finetuna --hermes --auto-tune     # 64K + Hermes config snippet
finetuna --continue --auto-tune   # 16K coding preset + Continue snippet
finetuna --openclaw --auto-tune   # 64K OpenClaw + gemma4 template
finetuna --max-vram --auto-tune   # fill dedicated NVIDIA VRAM (high ctx)
finetuna --benchmark-report
finetuna --unload                 # free VRAM (alias: --panic)
finetuna --reload                 # warm last model from state file
finetuna --help
```

## Flags

| Flag | Purpose |
|------|---------|
| `--check` / `--dry-run` | Report memory, soft context guide, and model fit hints — **no** `ollama create` |
| `--verify <name>` | Re-check GPU-fit for an existing model (after driver/Ollama/app drift) |
| `--model <name>` | Source model (`--check` focus, or non-interactive create) |
| `--name <name>` | New model name (non-interactive create; requires `--model`) |
| `--ctx` / `--batch` / `--gpu` | Non-interactive `num_ctx` / `num_batch` / `num_gpu` |
| `--json` | Emit a machine-readable JSON report (stdout) |
| `--auto-tune` | Run batch/context benchmarks without the confirm prompt |
| `--skip-batch` / `--skip-ctx` | Skip Phase 1 or Phase 2 of auto-tune |
| `--openclaw` | OpenClaw preset: 64K context, `num_keep 64`, Gemma4 template block |
| `--openclaw-agent` | Same as `--openclaw` plus `temperature 0.1` / `top_k 20` |
| `--no-openclaw` | Clear OpenClaw preset even if `FINETUNA_OPENCLAW` is set |
| `--hermes` | Hermes Agent preset: 64K context, `num_keep`, agent sampling + config snippet |
| `--continue` | Continue.dev preset: 16K context default, coding temperature + config snippet |
| `--max-vram` | Target max **dedicated NVIDIA** VRAM: high `num_ctx` default + auto-tune max-context |
| `--flash-attn` / `--no-flash-attn` | Tag `-flash` naming + print `OLLAMA_FLASH_ATTENTION` setup tips |
| `--benchmark-report` | Markdown table + `finetuna-benchmark.md` (data dir) |
| `--unload` / `--panic` | Evict loaded models from VRAM (`keep_alive: 0`) |
| `--reload` | Load the last Finetuna model from the state file |
| `--verbose` | Extra API / diagnostics |
| `--timeout` / `--gen-timeout` / `--bench-repeats` | Timing and repeat controls |

Client presets are mutually exclusive (last flag wins): `--openclaw` | `--hermes` | `--continue`.

**Flash attention** is an Ollama *server* setting (`OLLAMA_FLASH_ATTENTION=1`), not a Modelfile parameter.

## Outputs

| File | When | Location |
|------|------|----------|
| `Modelfile-finetuna` | Every create / recreate | **always cwd** (absolute path printed) |
| `finetuna-results.json` | After auto-tune | cwd (checkout) or `~/.finetuna/` (installed) |
| `finetuna-benchmark.md` | With `--benchmark-report` | same data dir as results |
| `.finetuna-state.json` | End of a normal run — used by `--reload` | same data dir |

## Environment variables

| Variable | Role | Default |
|----------|------|---------|
| `OLLAMA_HOST` | Ollama HTTP API base | `http://127.0.0.1:11434` |
| `FINETUNA_DIR` | Override data dir for state/results/benchmark | cwd, or `~/.finetuna` when installed |
| `FINETUNA_TIMEOUT` | Prompt-eval / short API timeout (ms) | `20000` |
| `FINETUNA_GEN_TIMEOUT` | Generation benchmark timeout (ms) | `120000` |
| `FINETUNA_NUM_PREDICT` | Generation bench token cap | `256` |
| `FINETUNA_BENCH_SEED` | Fixed seed for comparable bench repeats | `42` |
| `BENCH_REPEATS` | Auto-tune repeats per candidate | `3` |
| `FINETUNA_OPENCLAW` | `1` / `true` / `yes` → same as `--openclaw` | off |
| `FINETUNA_HERMES` | `1` / `true` / `yes` → same as `--hermes` | off |
| `FINETUNA_CONTINUE` | `1` / `true` / `yes` → same as `--continue` | off |
| `FINETUNA_MAX_VRAM` | `1` / `true` / `yes` → same as `--max-vram` | off |
| `FINETUNA_FLASH_ATTN` | Flash naming/tips; unset = prompt on capable GPUs | auto |

## Tips

- **`--check` first** on a shared or unfamiliar machine — zero side effects.
- **Client presets:** `--hermes` / `--continue` / `--openclaw`. Match client `contextLength` / `ollama_num_ctx` to the tuned `num_ctx`.
- **`--max-vram`:** uses free **dedicated NVIDIA** VRAM (not Iris Xe shared RAM). Close GPU-heavy apps first.
- **GPU-heavy apps:** browsers/IDEs can park several GB of VRAM; Finetuna flags them by name when detectable.
- **Memory hints** are soft. GPU-fit via `/api/ps` is authoritative. Presets go through **128K**.
- **Apple Silicon:** quit heavy apps if loads OOM; prefer Metal/MLX-ready models.
- **Thinking models:** benches send `think: false`.
- **Auto-tune** uses median + spread (not mean-of-3 argmax). Differences inside the noise keep the incumbent.
- **Remote Ollama:** `OLLAMA_HOST=http://192.168.1.10:11434` skips local GPU probes and trusts `/api/ps` on the server.
- **`--verbose`** when HTTP calls fail or the host URL looks wrong.

## License

[MIT](LICENSE)
