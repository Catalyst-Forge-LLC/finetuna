---
title: Install
description: Install Finetuna from npm or GitHub.
order: 1
---

Requires **Node.js 18+** and a running [Ollama](https://ollama.com) with at least one model pulled.

### From npm

```bash
npm install -g finetuna
finetuna --help
```

Or with pnpm:

```bash
pnpm add -g finetuna
```

### Look first, then create

```bash
finetuna --check              # will it fit? how much context?
finetuna --check --model llama3.2 --json
finetuna --verify my-model-ctx32k
finetuna                      # interactive create
finetuna --model llama3.2 --name llama3.2-ft --ctx 32768 --auto-tune
```

`--check` / `--dry-run` never run `ollama create`.

### From GitHub

```bash
npm install -g github:Catalyst-Forge-LLC/finetuna
```

### Where files go

| Mode | Modelfile | State / results |
|------|-----------|-----------------|
| Checkout (`pnpm start`) | `./Modelfile-finetuna` | current directory |
| Installed (`finetuna` on PATH) | `./Modelfile-finetuna` (cwd) | `~/.finetuna/` |

Override the data directory with `FINETUNA_DIR`. Point Ollama at another host with `OLLAMA_HOST`.

### Auto-tune

Default auto-tune is **context fit-search**. Phase 1 (`num_batch`) is opt-in via `--tune-batch`. Selection uses median + spread — differences inside the noise keep the incumbent.

Client presets: `--openclaw` / `--hermes` / `--continue`. Flash attention is an Ollama *server* setting (`OLLAMA_FLASH_ATTENTION=1`), not a Modelfile parameter.

Full flag table, env vars, and Apple Silicon notes: [README on GitHub](https://github.com/Catalyst-Forge-LLC/finetuna#readme).
