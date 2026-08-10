# Finetuna — TODO / follow-ups

## Done (recent)

- **`--skip-ctx` honored** — Phase 2 is gated; Phase 1 can run alone; `--skip-batch` + Phase 2 works.
- **`OLLAMA_HOST`** — HTTP API uses the same base URL as Ollama (default `http://127.0.0.1:11434`); `--help` and README updated.
- **No `curl` for API calls** — benchmarks and GPU-fit loading use `fetch` (Node 18+).
- **VRAM** — AMD path via `rocm-smi --showmeminfo vram`; clearer message when detection fails.

## Active spec

- **[Auto-tune reliability, remote host, packaging](./specs/auto-tune-reliability-remote-packaging.md)** — address review findings: median+spread winner selection (align with ollanet bench), pin speed samples (`seed` / long prompt / `done_reason`), skip local GPU probes for remote `OLLAMA_HOST`, GPU-fit via `/api/ps` JSON, installable `bin` + `~/.finetuna/` paths, and mock-server tests. **Start with M1 (selection).**

## Lower priority / ideas

- **OpenClaw mode** is hardcoded to `gemma4` renderer/parser; support other families or `ollama show --modelfile` merge when needed.

- **Tests / bin / remote GPU** — superseded by the active spec above (M2–M4).
