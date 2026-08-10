# Finetuna — TODO / follow-ups

## Done (recent)

- **`--skip-ctx` honored** — Phase 2 is gated; Phase 1 can run alone; `--skip-batch` + Phase 2 works.
- **`OLLAMA_HOST`** — HTTP API uses the same base URL as Ollama (default `http://127.0.0.1:11434`); `--help` and README updated.
- **No `curl` for API calls** — benchmarks and GPU-fit loading use `fetch` (Node 18+).
- **VRAM** — AMD path via `rocm-smi --showmeminfo vram`; clearer message when detection fails.

## Active spec — Finetuna 1.1

**[specs/strengthen-the-tuna.md](./specs/strengthen-the-tuna.md)** — single source of truth (merged reliability + framing specs).

**Done (steps 1–9):** Credibility; remote/`/api/ps`; packaging `1.1.0`; framing; `--check`/`--json`/`--verify`; non-interactive create; embedding filter; Phase 1 opt-in `--tune-batch`; shared `packages/ollama-bench-stats`.

**Publish (maintainer):** (1) `packages/ollama-bench-stats` → `npm publish --access public`, (2) point Finetuna at the registry version, (3) `pnpm publish --access public` for `finetuna`. Agents do not publish.

**Next:** Optional P3 mock-server cases; wire ollanet to `ollama-bench-stats` in that repo.

## Lower priority / ideas

- **OpenClaw mode** is hardcoded to `gemma4` renderer/parser; support other families or `ollama show --modelfile` merge when needed.
