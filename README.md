# Finetuna

> Finetuna — an interactive Node.js helper to tune Ollama models.

**Overview**

- Finetuna is a small CLI utility that helps create a `Modelfile` and run `ollama create` with sensible defaults, measure GPU fit, and iteratively reduce context size until the model offloads to GPU.

**Prerequisites**

- Node.js (v16+; v18+ recommended)
- Ollama installed and running (https://ollama.ai)
- A shell with `ollama`, `curl`, and (optionally) `nvidia-smi` or PowerShell (Windows)

**Install**

1. Clone the repo:

```
git clone <your-repo-url>
cd <repo>
```

2. Install dependencies:

```
npm install
```

**Usage**

- Run the interactive tuner:

```
node finetuna.js
```

- What it does:
  - Detects GPU VRAM (when possible).
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
- If `nvidia-smi` is not available on Windows, the script attempts a PowerShell query.
- Tweak `Modelfile-finetuna` as needed; the script will re-write it during retries.

- Auto-tune warning: the optional auto-tune flow (batch-size benchmarking) will recreate the model multiple times and run benchmarks for each candidate — this can be time-consuming and will use GPU resources while running. Consider running auto-tune when you have time and GPU availability. You can control repeats with the `BENCH_REPEATS` environment variable.

**Environment variables**

- `FINETUNA_TIMEOUT` — timeout for sample prompt and fallback runs, in milliseconds. Default: `20000` (20s).
- `BENCH_REPEATS` — number of repeats per candidate during auto-tune benchmarking. Default: `3`.

Examples — set before running `npm start`:

Unix / macOS (bash/zsh):

```bash
export FINETUNA_TIMEOUT=30000
export BENCH_REPEATS=5
npm start
```

PowerShell (Windows):

```powershell
$env:FINETUNA_TIMEOUT = '30000'
$env:BENCH_REPEATS = '5'
npm start
```

CMD (Windows):

```cmd
set FINETUNA_TIMEOUT=30000
set BENCH_REPEATS=5
npm start
```

**License**

- Add a `LICENSE` file if you plan to publish this repository publicly.

Enjoy tuning! 🐟
