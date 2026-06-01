# Ollama Host + HTTP API (no curl)

**Status:** completed  
**Shipped in:** `finetuna.js`

## Goal

Use Ollama's HTTP API portably (Node 18+ `fetch`), support non-default hosts, and remove the `curl` dependency.

## Implementation

- **`getOllamaBase()`** reads **`OLLAMA_HOST`** (default `http://127.0.0.1:11434`); strips trailing slash; adds `http://` if no scheme
- All **`/api/generate`** traffic uses **`OLLAMA_BASE`**: benchmarks, speed test, GPU-fit warm-up
- **`createTimeoutSignal()`** for request timeouts; in-flight requests aborted on SIGINT via **`activeAbortControllers`**
- Documented in **`--help`**, README env table; **`--verbose`** prints resolved API base at startup

## Related

- API resilience (retries, parsing) — [ollama-api-resilience.md](./ollama-api-resilience.md)
