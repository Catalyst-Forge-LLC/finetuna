# Finetuna

**Fit more context on your GPU — and keep it.**

VRAM-aware context tuner for Ollama. Not weight fine-tuning: no LoRA, no
training. Finetuna sets `num_ctx`, `num_batch`, and `num_gpu`, then saves
a named model you can `ollama run`.

```bash
finetuna --check              # fit and context headroom; no create
finetuna                      # named variant
finetuna --auto-tune          # context fit-search (median + spread)
```

## When layers leave the GPU

If part of the model spills to CPU, generation can drop by 5–10×. Ollama's
defaults are conservative. A 24GB card can sit at 4K context and never get
checked.

Finetuna answers:

- Does it fit? `/api/ps` compares `size_vram` to `size`.
- How much context still fits? The largest window that stays on the GPU.
- Can I keep the settings? A named Modelfile variant.

Leaving the incumbent is valid. Auto-tune only switches when the win beats
measured noise (median + spread, same rule as
[ollanet](https://github.com/Catalyst-Forge-LLC/ollanet)).

It writes a Modelfile and runs `ollama create`. It does not set Ollama
server env vars (flash attention, KV cache). Also: `--check` / `--dry-run`,
`--verify`, client presets (`--openclaw`, `--hermes`, `--continue`),
`--unload` / `--reload`.

## ollanet

Finetuna runs on the machine that hosts Ollama. To find and chat with those
models from another box, use [ollanet](https://github.com/Catalyst-Forge-LLC/ollanet).

1. Here: `finetuna` → `gemma4-ctx32k`
2. There: `ollanet scan` → `ollanet prompt this-host gemma4-ctx32k "…"`

## What a run does

1. Pick a source model and a new name (grouped against free memory when
   detectable)
2. Pick context / batch / GPU layers (presets through 128K)
3. Write `Modelfile-finetuna` and run `ollama create`
4. Measure baseline speed; optionally search context that still fits
5. Suggest a name like `gemma4-ctx32k-flash` and save state for `--reload`

### Apple Silicon

M-series Macs share unified memory. Finetuna uses `sysctl` / `vm_stat`:

- Reports total / available unified memory (not `nvidia-smi`)
- Groups models against available memory, with headroom for macOS
- Treats `/api/ps` residency (`size_vram ≈ size`) as GPU-fit, with a
  softer unified-memory ratio
- Skips CUDA flash-attention prompts (Ollama uses Metal; MLX preview on
  newer Ollama prefers ≥32GB)

Use ordinary Metal/MLX models from the library. No extra Finetuna flag.

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.com) running, with at least one model pulled
- Optional: [pnpm](https://pnpm.io/installation) for checkout work
- Optional: memory hints via `nvidia-smi`, Apple `sysctl`/`vm_stat`, AMD
  `rocm-smi`, or Windows WMI

## Install

```bash
npm install -g finetuna
# or: pnpm add -g finetuna
finetuna --help
```

From GitHub:

```bash
npm install -g github:Catalyst-Forge-LLC/finetuna
```

Checkout:

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

Override the data directory with `FINETUNA_DIR`. `--reload` reads that
dir, so a global install works from any cwd.

## Quick start

```bash
finetuna --check
finetuna --check --model llama3.2 --json
finetuna --verify my-model-ctx32k
finetuna --model llama3.2 --name llama3.2-ft --ctx 32768 --auto-tune
finetuna
```

```bash
finetuna --hermes --auto-tune
finetuna --continue --auto-tune
finetuna --openclaw --auto-tune
finetuna --max-vram --auto-tune
finetuna --benchmark-report
finetuna --unload
finetuna --reload
finetuna --help
```

## Flags

| Flag | Purpose |
|------|---------|
| `--check` / `--dry-run` | Memory, soft context guide, fit hints. No `ollama create`. |
| `--verify <name>` | Re-check GPU-fit after driver / Ollama / app drift |
| `--model <name>` | Source model (`--check` focus, or non-interactive create) |
| `--name <name>` | New model name (non-interactive create; requires `--model`) |
| `--ctx` / `--batch` / `--gpu` | Non-interactive `num_ctx` / `num_batch` / `num_gpu` |
| `--json` | JSON report on stdout |
| `--auto-tune` | Context fit-search (and optional batch) without the confirm prompt |
| `--tune-batch` | Opt-in Phase 1 `num_batch` sweep (off by default) |
| `--skip-batch` | No-op alias (Phase 1 is already off unless `--tune-batch`) |
| `--skip-ctx` | Skip Phase 2 (`num_ctx` fit search) |
| `--openclaw` | 64K, `num_keep 64`, Gemma4 template block |
| `--openclaw-agent` | Same, plus `temperature 0.1` / `top_k 20` |
| `--no-openclaw` | Clear the OpenClaw preset even if `FINETUNA_OPENCLAW` is set |
| `--hermes` | 64K Hermes Agent preset + config snippet |
| `--continue` | Continue.dev 16K coding preset + config snippet |
| `--max-vram` | High `num_ctx` on dedicated NVIDIA VRAM; auto-tune max-context |
| `--flash-attn` / `--no-flash-attn` | `-flash` naming + `OLLAMA_FLASH_ATTENTION` tips |
| `--benchmark-report` | Markdown table + `finetuna-benchmark.md` |
| `--unload` / `--panic` | Evict loaded models (`keep_alive: 0`) |
| `--reload` | Load the last Finetuna model from the state file |
| `--verbose` | Extra API / diagnostics |
| `--timeout` / `--gen-timeout` / `--bench-repeats` | Timing and repeats |

Client presets are mutually exclusive (last flag wins): `--openclaw` |
`--hermes` | `--continue`.

Flash attention is an Ollama server setting (`OLLAMA_FLASH_ATTENTION=1`),
not a Modelfile parameter.

## Outputs

| File | When | Location |
|------|------|----------|
| `Modelfile-finetuna` | Every create / recreate | always cwd (absolute path printed) |
| `finetuna-results.json` | After auto-tune | cwd (checkout) or `~/.finetuna/` (installed) |
| `finetuna-benchmark.md` | With `--benchmark-report` | same data dir as results |
| `.finetuna-state.json` | End of a normal run; used by `--reload` | same data dir |

## Environment variables

| Variable | Role | Default |
|----------|------|---------|
| `OLLAMA_HOST` | Ollama HTTP API base | `http://127.0.0.1:11434` |
| `FINETUNA_DIR` | Data dir for state / results / benchmark | cwd, or `~/.finetuna` when installed |
| `FINETUNA_TIMEOUT` | Prompt-eval / short API timeout (ms) | `20000` |
| `FINETUNA_GEN_TIMEOUT` | Generation benchmark timeout (ms) | `120000` |
| `FINETUNA_NUM_PREDICT` | Generation bench token cap | `256` |
| `FINETUNA_BENCH_SEED` | Fixed seed for comparable bench repeats | `42` |
| `BENCH_REPEATS` | Auto-tune repeats per candidate | `3` |
| `FINETUNA_OPENCLAW` | `1` / `true` / `yes` → `--openclaw` | off |
| `FINETUNA_HERMES` | `1` / `true` / `yes` → `--hermes` | off |
| `FINETUNA_CONTINUE` | `1` / `true` / `yes` → `--continue` | off |
| `FINETUNA_MAX_VRAM` | `1` / `true` / `yes` → `--max-vram` | off |
| `FINETUNA_FLASH_ATTN` | Flash naming / tips; unset = prompt on capable GPUs | auto |

## Tips

- `--check` first on a shared or unfamiliar machine.
- Match client `contextLength` / `ollama_num_ctx` to the tuned `num_ctx`.
- `--max-vram` uses free dedicated NVIDIA VRAM, not Iris Xe shared RAM.
  Close GPU-heavy apps first. Finetuna flags browsers and IDEs by name
  when it can see them.
- Memory hints are soft. `/api/ps` is the fit check. Presets go through
  128K.
- On Apple Silicon, quit heavy apps if loads OOM. Prefer Metal/MLX-ready
  models.
- Thinking-model benches send `think: false`.
- Default auto-tune is context fit-search. `--tune-batch` opts into
  `num_batch`. Selection is median + spread (`lib/bench-stats.js`).
- Remote host: `OLLAMA_HOST=http://192.168.1.10:11434` skips local GPU
  probes and trusts `/api/ps` on the server.
- `--verbose` when HTTP calls fail or the host URL looks wrong.

## Site

[finetuna.net](https://finetuna.net) (`site/`). `pnpm site:dev` /
`pnpm site:build` / `pnpm ship`.

<!-- xfacts-nutrition-label -->

## Nutrition label

- **AppFacts:** [viewer](https://appfacts.dev/v#af1.eNpFkUFrGzEQhf-KeGc5plddDYEEt5fmVkqZ7E7WE0sjVRq5LMb_PSgb3NugeY_vzdMVF4RvHkqJEfAmytaV4GFrGS-H45OznCM8mpH1hgCaTC4MjygTaxuy708vm2I6I1wRSZdOy9g804V-TlWKefeyFt5meNSuJp_UH3nmh_cGj1NuJroMbsx9fotUGTePmUtD-HWFIoD1b5fKFR4FAaLGdYvkppwS6byLouxKzalYw81vPtImuynHXNuXtdkaRRdnXJMoRZe7lW53x79KusQ76X8mN3OJeU2s9tnOWQy33x6vXeI8Cig0nWnhP4mUFq4IKFrSqJWbIeCdm7lcXZMkkQZgEgQsYqf-6sY1WUdyVC65ieW6IuBkVlrY7zfZw5TT_kBGcW22e8x14d3xeNjfP_H2AeS2o5g) · [raw](https://github.com/Catalyst-Forge-LLC/finetuna/blob/main/APP_FACTS.md)

## License

[MIT](LICENSE)
