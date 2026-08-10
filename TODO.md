# Finetuna — TODO / follow-ups

## Done (recent)

- **`--skip-ctx` honored** — Phase 2 is gated; Phase 1 can run alone; `--skip-batch` + Phase 2 works.
- **`OLLAMA_HOST`** — HTTP API uses the same base URL as Ollama (default `http://127.0.0.1:11434`); `--help` and README updated.
- **No `curl` for API calls** — benchmarks and GPU-fit loading use `fetch` (Node 18+).
- **VRAM** — AMD path via `rocm-smi --showmeminfo vram`; clearer message when detection fails.

## Active spec — Finetuna 1.1

**[specs/strengthen-the-tuna.md](./specs/strengthen-the-tuna.md)** — single source of truth (merged reliability + framing specs).

**Start here (build order steps 1–2):**

1. **P0-1 + P0-2** — median/spread/challenger rule; `num_predict: 256`; long prompt + seed; exclude non-`length` samples.
2. **P3 (partial)** — mock harness + selection tests.

Then: `/api/ps` fit → remote probe skip → paths/`bin`/publish tee-up → README framing → `--dry-run`/`--json` → Phase 1 earn-runtime → shared `ollama-bench-stats`.

**Locked for packaging:** installed Modelfile stays in **cwd** (print absolute path); state/results under `~/.finetuna/` (`FINETUNA_DIR`). Maintainer publishes `finetuna@1.1.0` (name is free).

## Lower priority / ideas

- **OpenClaw mode** is hardcoded to `gemma4` renderer/parser; support other families or `ollama show --modelfile` merge when needed.
