# Finetuna

> Finetuna — an interactive Node.js helper to tune Ollama models.

**Overview**

- Finetuna is a small CLI utility that helps create a `Modelfile` and run `ollama create` with sensible defaults, measure GPU fit, and iteratively reduce context size until the model offloads to GPU.

**Prerequisites**

- Node.js **v18+** (uses built-in `fetch` for the Ollama HTTP API)
- [pnpm](https://pnpm.io/installation) (this repo uses a `pnpm-lock.yaml`; `npm` is not required)
- Ollama installed and running (https://ollama.ai)
- A shell with `ollama` and (optionally) `nvidia-smi`, AMD `rocm-smi`, or PowerShell on Windows for VRAM hints

**Install**

1. Clone the repo:

```
git clone <your-repo-url>
cd <repo>
```

2. Install dependencies:

```
pnpm install
```

**Usage**

- Run the interactive tuner (either works; `pnpm start` runs the same script as in `package.json`):

```
node finetuna.js
```

```
pnpm start
```

- What it does:
  - Detects GPU VRAM when possible (NVIDIA `nvidia-smi`, AMD `rocm-smi`, then a Windows WMI fallback; some systems still need manual context choices).
  - Lists available Ollama models and prompts for a source model and new name.
  - Writes `Modelfile-finetuna` with chosen parameters (`num_ctx`, `num_gpu`, `num_batch`).
  - Runs `ollama create <newName> -f Modelfile-finetuna` and performs quick tests to check GPU offload.
  - Optionally reduces context window and recreates the model if it won’t fully fit on GPU.

After a successful run, start the model with:

```
ollama run <your-model-name>
```

**Outputs**

- `Modelfile-finetuna` — generated model configuration created by the script.

**Git / Publishing notes**

- Ignore large local blobs and manifests before pushing to GitHub. A sample `.gitignore` is included.

Quick publish steps:

```
git init
git add .
git commit -m "Initial commit: add finetuna"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Replace `YOUR_USERNAME`/`YOUR_REPO` with your GitHub repo. You can also create the repo first on github.com and follow the instructions there.

**Notes & tips**

- The script relies on the `ollama` CLI being available and running locally (`ollama list`, `ollama create`, `ollama run`).
- VRAM hints: NVIDIA `nvidia-smi`, then AMD `rocm-smi --showmeminfo vram`, then a Windows PowerShell WMI query. Apple Silicon and unusual setups may not report VRAM here.
- Point Finetuna at a remote or custom Ollama port with the `OLLAMA_HOST` environment variable (same as Ollama’s CLI), e.g. `http://192.168.1.10:11434`.
- Tweak `Modelfile-finetuna` as needed; the script will re-write it during retries.

- Auto-tune warning: the optional auto-tune flow (batch-size benchmarking) will recreate the model multiple times and run benchmarks for each candidate — this can be time-consuming and will use GPU resources while running. Consider running auto-tune when you have time and GPU availability. You can control repeats with the `BENCH_REPEATS` environment variable.

**Environment variables**

- `OLLAMA_HOST` — base URL for the Ollama HTTP API. Default: `http://127.0.0.1:11434`.
- `FINETUNA_TIMEOUT` — timeout for prompt-eval / API calls, in milliseconds. Default: `20000` (20s).
- `FINETUNA_GEN_TIMEOUT` — timeout for generation benchmarks, in milliseconds. Default: `60000` (60s).
- `BENCH_REPEATS` — number of repeats per candidate during auto-tune benchmarking. Default: `3`.

Examples — set before running `pnpm start`:

Unix / macOS (bash/zsh):

```bash
export OLLAMA_HOST=http://127.0.0.1:11434
export FINETUNA_TIMEOUT=30000
export BENCH_REPEATS=5
pnpm start
```

PowerShell (Windows):

```powershell
$env:FINETUNA_TIMEOUT = '30000'
$env:BENCH_REPEATS = '5'
pnpm start
```

CMD (Windows):

```cmd
set FINETUNA_TIMEOUT=30000
set BENCH_REPEATS=5
pnpm start
```

**License**

- [MIT](LICENSE)

Enjoy tuning! 🐟
