# Finetuna — TODO / follow-ups

## Done (recent)

- **`--skip-ctx` honored** — Phase 2 is gated; Phase 1 can run alone; `--skip-batch` + Phase 2 works.
- **`OLLAMA_HOST`** — HTTP API uses the same base URL as Ollama (default `http://127.0.0.1:11434`); `--help` and README updated.
- **No `curl` for API calls** — benchmarks and GPU-fit loading use `fetch` (Node 18+).
- **VRAM** — AMD path via `rocm-smi --showmeminfo vram`; clearer message when detection fails.

## Active spec — Finetuna 1.1

**[specs/strengthen-the-tuna.md](./specs/strengthen-the-tuna.md)** — single source of truth (merged reliability + framing specs).

**Done (steps 1–5):** Measurement credibility; `/api/ps` fit; remote host skip; packaging paths + `bin` (`1.1.0` tee-up). **You publish:** `pnpm test && npm pack --dry-run && pnpm publish --access public`.

**Next:** P2 framing (README tagline polish) → `--dry-run`/`--json` → Phase 1 earn-runtime → shared `ollama-bench-stats`.

## Lower priority / ideas

- **OpenClaw mode** is hardcoded to `gemma4` renderer/parser; support other families or `ollama show --modelfile` merge when needed.
