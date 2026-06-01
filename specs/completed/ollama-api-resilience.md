# Ollama API Resilience (cold start + errors)

**Status:** completed (partial vs roadmap §1)  
**Shipped in:** `finetuna.js`

## Goal

Reduce false failures when benchmarking or checking GPU fit on first load of large models.

## Implementation

- **`parseGenerateResponseBody()`** — single JSON or newline-delimited (streaming-style) bodies
- **`getSpeedMetrics()`** — surfaces **`data.error`**, HTTP status snippets, empty body; **`--verbose`** logs URL and failures
- **One retry** at `min(max(timeout×2, 120s), 600s)` for timeouts / transport / empty responses
- **`ollama run` fallback** with ≥180s CLI timeout, **`windowsHide: true`**, stderr in error message
- **`getPromptEvalMetrics()`** — same parser + `data.error` handling
- **`checkGPUFit()`** — poll **`ollama ps`** up to **~3 minutes** (was 60s)

## Partial / follow-up (roadmap §1)

- Display **`eval_rate` / `prompt_eval_rate`** fields explicitly from Ollama JSON when present
- Before/after auto-tune comparison table in stdout
- **`finetuna-results.json`** exists but does not yet store full rate fields from Ollama response metadata
