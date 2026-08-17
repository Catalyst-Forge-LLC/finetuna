---
title: Install
description: Install Finetuna from npm or GitHub.
order: 1
---

Needs **Node.js 18+** and a running [Ollama](https://ollama.com) with at least one model pulled.

### From npm

```bash
npm install -g finetuna
finetuna --help
```

Or:

```bash
pnpm add -g finetuna
```

### Look first, then create

```bash
finetuna --check
finetuna --check --model llama3.2 --json
finetuna --verify my-model-ctx32k
finetuna
finetuna --model llama3.2 --name llama3.2-ft --ctx 32768 --auto-tune
```

`--check` and `--dry-run` never run `ollama create`.

### From GitHub

```bash
npm install -g github:Catalyst-Forge-LLC/finetuna
```

### Where files go

| Mode | Modelfile | State / results |
|------|-----------|-----------------|
| Checkout (`pnpm start`) | `./Modelfile-finetuna` | current directory |
| Installed (`finetuna` on PATH) | `./Modelfile-finetuna` (cwd) | `~/.finetuna/` |

`FINETUNA_DIR` overrides the data directory. `OLLAMA_HOST` points at another Ollama.

### Auto-tune

Default is context fit-search. `--tune-batch` opts into a `num_batch` sweep. Selection is median + spread: a difference inside the noise keeps the incumbent.

Client presets: `--openclaw` / `--hermes` / `--continue`. Flash attention is an Ollama server setting (`OLLAMA_FLASH_ATTENTION=1`), not a Modelfile parameter.

Full flags, env vars, and Apple Silicon notes: [README on GitHub](https://github.com/Catalyst-Forge-LLC/finetuna#readme).
