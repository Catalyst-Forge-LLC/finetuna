# OpenClaw Modelfile Preset (baseline)

**Status:** completed  
**Shipped in:** `finetuna.js` (OpenClaw flag + `buildModelfileContent`)

## Goal

Some clients (e.g. OpenClaw) require explicit `TEMPLATE`, `RENDERER`, and `PARSER` lines in the Modelfile — inheriting only from `FROM` is not enough.

## Implementation

- **`--openclaw`** CLI flag and **`FINETUNA_OPENCLAW=1`** env var (truthy: `1`, `true`, `yes`)
- **`--no-openclaw`** overrides the env var
- When enabled, every generated Modelfile includes (before Finetuna `num_*` parameters):

  ```
  TEMPLATE {{ .Prompt }}
  RENDERER gemma4
  PARSER gemma4
  PARAMETER temperature 1
  PARAMETER top_k 64
  PARAMETER top_p 0.95
  ```

- Centralized in **`buildModelfileContent()`** so initial create, auto-tune sweeps, final apply, and context-reduce paths stay consistent
- Startup banner when OpenClaw mode is active; `openClaw` recorded in `finetuna-results.json` settings

## Extended (64K preset)

64K default context, step-down, `num_keep`, and `--openclaw-agent` — see [openclaw-preset-64k.md](./openclaw-preset-64k.md).
