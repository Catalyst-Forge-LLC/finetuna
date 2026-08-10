# Finetuna — TODO / follow-ups

## Done (recent)

- **`--skip-ctx` honored** — Phase 2 is gated; Phase 1 can run alone; `--skip-batch` + Phase 2 works.
- **`OLLAMA_HOST`** — HTTP API uses the same base URL as Ollama (default `http://127.0.0.1:11434`); `--help` and README updated.
- **No `curl` for API calls** — benchmarks and GPU-fit loading use `fetch` (Node 18+).
- **VRAM** — AMD path via `rocm-smi --showmeminfo vram`; clearer message when detection fails.

## Active spec

- **[Auto-tune reliability, remote host, packaging](./specs/auto-tune-reliability-remote-packaging.md)** — M1 selection first (median+spread, **D8** max-context not-significantly-slower, **`num_predict: 256`**). Then M2 remote/`/api/ps`, M3 bin + `~/.finetuna/` + publish tee-up (**you** publish `finetuna` — name is free), M4 tests, M5 shared `ollama-bench-stats` with ollanet.
- **Still decide before M3:** installed Modelfile path — cwd vs `~/.finetuna/` vs home+`--modelfile` (tradeoffs in spec §5.5).

## Lower priority / ideas

- **OpenClaw mode** is hardcoded to `gemma4` renderer/parser; support other families or `ollama show --modelfile` merge when needed.

- **Tests / bin / remote GPU** — superseded by the active spec above (M2–M4).
