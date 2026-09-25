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

First inspect a model you already have. Create the named variant with the shown settings. Then verify that variant.

```bash
finetuna --check
finetuna --check --model llama3.2 --json
finetuna --model llama3.2 --name llama3.2-ft --ctx 32768 --auto-tune
finetuna --verify llama3.2-ft
```

`llama3.2` is an existing model you substitute. `llama3.2-ft` is the name from `--name` in the create step. `--check` and `--dry-run` never run `ollama create`. `--verify <name>` loads that existing name and reads `/api/ps`. It does not create a new model. Re-run it after you change the model, context, concurrency, or host load. A pass is a snapshot of that loaded run, not a perpetual residency guarantee.

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
