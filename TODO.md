# Finetuna — TODO / follow-ups

## Done (recent)

- **`--skip-ctx` honored** — Phase 2 is gated; Phase 1 can run alone; `--skip-batch` + Phase 2 works.
- **`OLLAMA_HOST`** — HTTP API uses the same base URL as Ollama (default `http://127.0.0.1:11434`); `--help` and README updated.
- **No `curl` for API calls** — benchmarks and GPU-fit loading use `fetch` (Node 18+).
- **VRAM** — AMD path via `rocm-smi --showmeminfo vram`; clearer message when detection fails.

## Active spec — Finetuna 1.1

**[specs/strengthen-the-tuna.md](./specs/strengthen-the-tuna.md)** — single source of truth (merged reliability + framing specs).

**Done (steps 1–9):** Credibility; remote/`/api/ps`; packaging `1.1.0`; framing; `--check`/`--json`/`--verify`; non-interactive create; embedding filter; Phase 1 opt-in `--tune-batch`; bench helpers in `lib/bench-stats.js` (in-tree; no separate npm package).

**Publish (maintainer):** from repo root, `pnpm publish --access public` (or `npm publish --access public`). Dry-run first with `--dry-run`. Agents do not publish.

**Next:** Optional P3 mock-server cases; keep ollanet bench semantics mirrored (extract a scoped shared package later only if needed).

## Lower priority / ideas

- **OpenClaw mode** is hardcoded to `gemma4` renderer/parser; support other families or `ollama show --modelfile` merge when needed.
