# Finetuna — TODO / follow-ups

## Done (recent)

- **`--skip-ctx` honored** — Phase 2 is gated; Phase 1 can run alone; `--skip-batch` + Phase 2 works.
- **`OLLAMA_HOST`** — HTTP API uses the same base URL as Ollama (default `http://127.0.0.1:11434`); `--help` and README updated.
- **No `curl` for API calls** — benchmarks and GPU-fit loading use `fetch` (Node 18+).
- **VRAM** — AMD path via `rocm-smi --showmeminfo vram`; clearer message when detection fails.

## Lower priority / ideas

- **Tests.** No automated tests; fragile areas include parsing `ollama list` / `ollama ps`, and JSON shape from `/api/generate`. Smoke tests with mocked `execSync` would help.

- **Binary / `bin` entry.** Optional: add `"bin": { "finetuna": "finetuna.js" }` and a shebang for global `pnpm link` / `npm link` usage.
