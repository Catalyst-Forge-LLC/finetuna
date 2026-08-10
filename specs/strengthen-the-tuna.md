# Spec: Finetuna 1.1 — credibility, packaging, and framing

**Spec kind:** Delivery  
**Status:** Partial  
**Target:** `1.1.0`  
**Date:** 2026-08-10  
**Surfaces:** `finetuna.js`, `package.json`, `README.md`, `TODO.md`, `lib/bench-stats.js` (or equivalent), `test/*`  
**Related:** [ollama-host-and-http-api.md](./completed/ollama-host-and-http-api.md); [ollama-api-resilience.md](./completed/ollama-api-resilience.md); [tokens-per-sec-reporting.md](./completed/tokens-per-sec-reporting.md); ollanet bench (median + spread verifier)  
**Supersedes:** [auto-tune-reliability-remote-packaging.md](./auto-tune-reliability-remote-packaging.md) (merged here)

**Thesis:** Finetuna's durable value is **"will this model fit on the GPU and stay there, and can I keep that result?"** — not "make it faster." The speed sweeps are the flashiest part and the weakest. This release makes the numbers trustworthy, makes the tool installable, and re-frames the pitch around fit.

Three things gate everything else:

1. **P0 — Measurement credibility.** Auto-tune currently selects winners from noise. A recommendation that doesn't reproduce burns trust silently.
2. **P0 — Packaging.** ollanet's README tells people to run `finetuna`; there is no such command.
3. **P1 — Remote correctness.** With a remote `OLLAMA_HOST`, every GPU probe measures the wrong machine.

---

## 1. Problem (current state)

| Area | Today |
| ---- | ----- |
| Speed / batch / ctx benches | Return **mean** of N; print min/avg/max then discard spread |
| Winner pick | `filter(gpu && avg > 0).sort(avg desc)[0]` — Phase 1 & Phase 2 |
| Failures | Failed run → `0`; all-fail → avg `0`, still in comparison path |
| Speed request | Short fun-fact prompt; `num_predict: 80` rarely binds; no `seed` |
| Host | Local `nvidia-smi` / Apple / WMI even when `OLLAMA_HOST` is remote |
| GPU fit | `execSync('ollama ps')` text parse for `100% GPU` / Metal |
| HTTP `/api/ps` | Names only — drops `size` / `size_vram` |
| Artifacts | All under `process.cwd()` — breaks installed `--reload` |
| Package | Partial tee-up (`repository` / `files` / keywords); still no `bin` / shebang |
| Tests | None |

Strengths to preserve: argv `spawnSync` (no shell injection), API-options probing (no recreate per candidate), SIGINT abort, Apple Silicon unified-memory path, GPU-heavy app flagging (local only), `think: false` top-level.

---

## 2. Goals

1. **Stable auto-tune winners** — median + spread + challenger rule; failed ≠ slow; align with ollanet bench (later share code).
2. **Pinned decode samples** — long prompt, `num_predict: 256`, fixed `seed`, `done_reason === 'length'` required for comparison samples.
3. **Remote-safe probes** — non-loopback `OLLAMA_HOST` skips local GPU entirely.
4. **GPU-fit via `/api/ps`** — `size_vram / size`; no CLI required for remote.
5. **Installable CLI** — `bin`, shebang, `~/.finetuna/` state, publish-ready (maintainer publishes).
6. **Tests** — mock server; selection / fit / remote / paths without a GPU.
7. **Framing** — pitch fit/keep, not fine-tuning or “always faster.”
8. **Workflow features** (after P0/P1) — `--dry-run`, `--json`, non-interactive, `--verify`, capability filter, remote unload warning.

### Non-goals

- Weight fine-tuning (LoRA/QLoRA) — permanently out of scope; say so in the README
- Ollama **server** settings (flash attention server env, KV cache env) — correctly already excluded from “must ship”
- A GUI
- Multi-host orchestration — ollanet’s job
- Replacing Ollama’s own memory estimation
- Agent running `npm publish` / `pnpm publish` — maintainer publishes
- Porting ollanet’s full bench UI — share aggregation math only (M5)

---

## 3. Core concepts

| Term | Meaning |
| ---- | ------- |
| **Incumbent** | Current `num_batch` / `num_ctx` entering a phase |
| **Challenger** | Another candidate under test |
| **Median rate** | Median of **valid** run rates (tok/s); primary score |
| **Spread** | `max − min` over valid rates; `spreadPct = spread / median` (0 if `n < 2` or median 0) |
| **Valid run** | Success + rate &gt; 0 + (generation benches) `done_reason === 'length'` |
| **Significant win** | See challenger rule below |
| **Failed candidate** | Zero valid runs, or GPU-fit false — excluded, never scored as `0` |
| **Local Ollama** | `OLLAMA_BASE` host is loopback (`127.0.0.1`, `localhost`, `::1`) |
| **Remote Ollama** | Anything else — skip local GPU probes |
| **Installed mode** | Entry lives under a `node_modules` path segment (ollanet pattern) → data dir `~/.finetuna/` (override `FINETUNA_DIR`) |
| **Cap bound** | `done_reason === 'length'` |

### Challenger rule (both phases) — D2

```
relGain = (candidate.median - incumbent.median) / incumbent.median
threshold = max(incumbent.spreadPct, candidate.spreadPct, MIN_WIN_PCT)  // MIN_WIN_PCT = 0.05
switch only if relGain > threshold
```

- Ties and sub-threshold wins **always** keep the incumbent.
- Phase 1: larger `num_batch` costs VRAM → burden of proof on challenger; if two challengers both significant, prefer higher median, then **smaller** batch if within each other’s noise.
- Print in spirit:  
  `── no significant difference (1024: 42.1 t/s, 512: 41.6 t/s, spread ±6%) — keeping 512`

### Phase 2 max-context / `--max-vram` — D8

Among GPU-fit + ok candidates: find **best median**, then pick the **largest** `num_ctx` whose median is **not significantly slower** than that best (same threshold math with roles flipped: slowdown is not a significant win for “best” over “large”). Never pick failed/OOM.

Speed-oriented Phase 2 goal: same challenger rule vs baseline ctx.

---

## 4. Work items

### P0-1 · Measurement credibility

Return a result object (not a bare number) from `benchmarkModel` / `benchmarkPromptEval`:

```js
{
  ok: boolean,           // ≥1 valid run
  median, min, max, mean,
  spread, spreadPct,
  samples: number[],     // valid rates only
  failedRuns: number,
  n: number
}
```

- Headline metric: **median**.
- Never coerce total failure to `0` for selection.
- Benchmark tables: add a **spread** column.
- `finetuna-results.json`: per-candidate `samples[]` so median/min/max recompute later.

**Acceptance**

1. Sub-threshold win does **not** change the setting, and says so.
2. All-failed candidate → `failed` / `—`, never `0 t/s`, never selected.
3. Results JSON has `samples[]` per candidate.
4. Two consecutive `--auto-tune` runs on an idle machine produce the same winner (manual smoke).

### P0-2 · Benchmark prompt binds the cap

- Long-output generation prompt (mirror existing `LONG_PROMPT` energy).
- Default **`num_predict: 256`** (D9); override `FINETUNA_NUM_PREDICT`.
- Fixed `options.seed` (`42`; override `FINETUNA_BENCH_SEED`).
- Record `done_reason`; **exclude** non-`length` samples from comparison (flag in verbose / per-run log).
- Keep `think: false` top-level + comment.

**Acceptance**

5. Normal models report `done_reason: "length"`; early stops are flagged and excluded from comparison.

### P0-3 · Packaging — real `finetuna` command

**Paths (D12 — Option A locked)**

| Context | State / results / benchmark md | Modelfile |
| ------- | ------------------------------ | --------- |
| Checkout | `process.cwd()` (unchanged) | `process.cwd()/Modelfile-finetuna` |
| Installed | `~/.finetuna/` (or `FINETUNA_DIR`) | **cwd** by default; print absolute path |

`--reload` must work from any directory in installed mode (reads home state).

**Package**

- `bin`: `{ "finetuna": "./finetuna.js" }`
- Shebang line 1: `#!/usr/bin/env node`
- `files`: `finetuna.js`, `README.md`, `LICENSE` (+ any extracted runtime modules; **not** `specs/`)
- Keep `enquirer` + `ansi-colors` (interactive TUI is legitimate)
- Keywords (expand): `ollama`, `vram`, `gpu`, `num_ctx`, `context-length`, `modelfile`, `local-llm`, `quantization`, `llm-performance`, …
- npm name **`finetuna`** is available; target publish **`1.1.0`** after this work (maintainer publishes)

**Acceptance**

6. Global install puts `finetuna` on PATH; runs from any directory.
7. Installed mode: state/results under `~/.finetuna/`; `--reload` works from another cwd.
8. `npm pack` contains exactly the intended runtime files (+ `package.json`), not `specs/`.

### P1-1 · Remote `OLLAMA_HOST`

- `isLocalOllamaBase(baseUrl)`.
- Remote: skip `detectGpuMemory` / `listGpuComputeApps` / local free-VRAM warnings. Print:

  ```
  ⚠️  Remote Ollama (192.168.1.10) — local GPU probes disabled.
      Memory guidance comes from /api/ps on the remote host.
  ```

- Context tiers: **unknown memory** mode — show all tiers, label none “ambitious,” GPU-fit is truth.
- `--max-vram` remote: maximize ctx that still GPU-fits via `/api/ps` (no local free-MiB math), or explain and fall back to max-context fit search.
- Warn before `--unload` / eviction cycles when target is not loopback (shared host / tailnet).

### P1-2 · GPU-fit via `/api/ps`

```js
const ratio = m.size_vram / m.size;   // 1.0 → fully resident
const ok = ratio >= FIT_RATIO_MIN;     // 0.99 discrete; unified keeps softer rule (~0.5 spirit)
```

- Poll `/api/ps` over HTTP (keep retry budget).
- No `ollama ps` subprocess on the happy path; **no CLI required for remote**.
- Optional local CLI text fallback only if HTTP `/api/ps` fails on loopback (degraded); do not require it for acceptance.
- Extend helpers to return full rows (`name`, `size`, `size_vram`, …).

**Acceptance**

9. GPU-fit works against a remote host with no local `ollama` CLI; happy path uses `/api/ps` only.

### P1-3 · Phase 1 (`num_batch`) — earn its runtime

After P0 credibility lands, measure Phase 1 win margin vs spread across 3–4 real models:

- Real wins often &gt; noise → keep Phase 1 on by default.
- Else → opt-in `--tune-batch`; `--skip-batch` becomes a no-op alias; default auto-tune = context-fit.
- Either way: reframe Phase 2 output as primarily a **fit search** (“largest context that stays on the GPU”), speed secondary.

### P2 · Framing and branding

Keep the name `finetuna`. Correct the misdirection:

**Tagline:** *"Fit more context on your GPU — and keep it. VRAM-aware context tuner for Ollama."*

Apply to `package.json` `description`, GitHub repo description, README first line.

README disambiguation near the top:

> **Not** weight fine-tuning (no LoRA/QLoRA/training). Finetuna tunes **runtime** settings — `num_ctx`, `num_batch`, `num_gpu` — and saves them as a reusable named model.

Lead with the GPU-fit cliff (CPU spill can cost 5–10×); move auto-tune below the fold. Defensible claims: *will it fit?*, *how much context?*, *can I keep it?* Honest “no change needed” is a credibility asset.

**Strategic note (track, no code):** If Ollama ships strong automatic fitting, sizing value erodes; durable value is named variants, client snippets, before/after evidence, `--unload`/`--reload`. Watch Ollama release notes.

### P2 · Feature improvements (after P0/P1)

| Feature | Behavior |
| ------- | -------- |
| `--dry-run` / `--check` | Report fit / largest likely ctx / whether defaults leave context on the table — **no** `ollama create` |
| `--json` | Machine-readable full run (pairs with `samples[]` for ollanet) |
| Non-interactive | `--model` `--ctx` `--name` …; prompts only if required value missing and stdin is a TTY |
| `--verify <name>` | Re-run GPU-fit on an existing tuned model (driver/Ollama/app drift) |
| Capability filter | `/api/show` `capabilities` — skip embedding-only in picker; use `thinking` for `think: false` when present |

### P3 · Testing

`node:test` + mock server (port ollanet `test/helpers.mjs` ideas): canned `eval_count` / `eval_duration` / `done_reason` / `/api/ps`.

Highest-value cases (no GPU):

1. 2% win with 6% spread → keep incumbent  
2. All-failed candidate excluded  
3. max-context → largest fitting not-significantly-slower (**D8**), not merely fastest  
4. Fit ok when `size_vram === size`; fail partial offload (discrete)  
5. Remote host disables local GPU probes  
6. Installed-mode paths → `~/.finetuna/`  

Script: `"test": "node --test test/*.test.mjs"`. Extract pure helpers: `median`, `spreadPct`, `isSignificantWin`, `pickSignificantWinner`, `pickMaxContext`, `isLocalOllamaBase`, `gpuFitFromPsModel`, path helpers.

### M5 · Shared `ollama-bench-stats` (cross-tool)

After in-repo helpers + tests stabilize: publish tiny zero-dep ESM (`ollama-bench-stats` or `@catalyst-forge/ollama-bench-stats`); Finetuna + ollanet both depend on it so tuner and verifier cannot drift. Until then: identical semantics + mirrored tests + README “aligned with ollanet bench.”

---

## 5. Build order (start here)

| Step | Work | Notes |
| ---- | ---- | ----- |
| **1** | **P0-1 + P0-2** | Median/spread/challenger + long prompt / 256 / seed / `done_reason`. Smallest diff, largest trust gain. |
| **2** | **P3 (partial)** | Mock harness + selection tests — protect step 1 before more code. |
| **3** | **P1-2** | `/api/ps` fit (unblocks remote). |
| **4** | **P1-1** | Remote probe gating + unload warning. |
| **5** | **P0-3** | Paths (`FINETUNA_DIR`, Option A) → `bin` / shebang → pack dry-run → **maintainer publish 1.1.0**. |
| **6** | **P2 framing** | Tagline + README rewrite. |
| **7** | **P2 features** | `--dry-run`, `--json`, then non-interactive / `--verify` / capabilities. |
| **8** | **P1-3** | Measure Phase 1; keep or demote to `--tune-batch`. |
| **9** | **M5** | Extract shared bench-stats; wire ollanet. |

Ship **1–2** before anything else. Rest lands incrementally.

---

## 6. Edge cases and risks

| Risk | Mitigation |
| ---- | ---------- |
| `n < 2` valid runs | No significant switch vs healthy incumbent |
| All candidates fail | Keep baseline; no zero-crown |
| Cap never binds on some models | Flag/exclude; fix prompt before raising `num_predict` again |
| Users expect old “always best” churn | Explicit “no significant difference” copy |
| Path detection wrong | Verbose log of data dir; `FINETUNA_DIR` override |
| Publish too early | No `bin` until paths land; maintainer publishes after step 5 |
| ollanet drift before M5 | Mirrored tests + same formula in both READMEs |

---

## 7. Decisions (locked)

**D1.** Primary score is **median**, not mean.  
**D2.** Challenger rule: relative gain must exceed `max(inc.spreadPct, cand.spreadPct, MIN_WIN_PCT)` with `MIN_WIN_PCT = 0.05`; else keep incumbent.  
**D3.** Failed candidates excluded (`ok: false`); never scored as `0`.  
**D4.** Implement measurement credibility (steps 1–2) before packaging/remote polish.  
**D5.** Align with ollanet bench semantics; share code in M5.  
**D6.** Remote host → no local VRAM truth; say so; use `/api/ps`.  
**D7.** Prefer `/api/ps` JSON for GPU-fit; CLI ps only as local degraded fallback.  
**D8.** max-context: largest fitting ctx **not significantly slower** than best median.  
**D9.** Default generation **`num_predict = 256`**; long prompt + fixed seed; non-`length` samples excluded from comparison.  
**D10.** Extract shared bench-stats (M5) after in-repo helpers stabilize.  
**D11.** npm name **`finetuna`**; maintainer publishes (agents do not). Target version **1.1.0** for this release.  
**D12.** Installed Modelfile = **cwd** (print absolute path); state/results/reports = `~/.finetuna/` / `FINETUNA_DIR` (Option A).  
**D13.** Pitch = fit/keep, not weight fine-tuning and not “always faster.”

---

## 8. Open questions

| # | Question | Blocking? | Notes |
| - | -------- | --------- | ----- |
| 1 | After P1-3 measurement, keep Phase 1 default-on or `--tune-batch`? | Blocks default UX only | Data-driven post-P0 |
| 2 | Shared package name: `ollama-bench-stats` vs scoped `@catalyst-forge/…`? | M5 only | Check npm at extract time |
| 3 | Soft unified-memory fit ratio exact value (0.5 vs keep processor hints)? | P1-2 | Match today’s Apple leniency |

---

## 9. Progress

- `2026-08-10:` Reliability spec drafted from external review; D8–D11 locked.
- `2026-08-10:` Merged framing + build order; **D12** Modelfile = Option A.
- `2026-08-10:` **Steps 1–2 landed:** `lib/bench-stats.js`; median/spread selection; pinned gen benches; `pnpm test`.
- `2026-08-10:` **Steps 3–4 landed:** P1-2 `/api/ps` fit (`lib/ollama-host.js`, `gpuFitFromPsModel`); P1-1 remote host skips local GPU probes, unknown-memory context tiers, unload/evict warnings; 22 unit tests. Next: P0-3 packaging paths + `bin`.

---

## 10. Implementation summary

**Implemented:** _(in progress — through P1-1 / P1-2)_

1. `lib/bench-stats.js` — median/spread/significance helpers  
2. Auto-tune selection uses challenger rule + D8 max-context  
3. Gen bench: long prompt, `num_predict` 256, seed 42, exclude non-`length`  
4. `lib/ollama-host.js` — `isLocalOllamaBase`, `gpuFitFromPsModel`  
5. `checkGPUFit` polls `/api/ps` (CLI text only as local degraded fallback)  
6. Remote `OLLAMA_HOST` skips local GPU probes; unknown-memory context labels  
7. `test/*.test.mjs` — 22 unit tests  

**Verification:** `pnpm test` (pass). Manual remote `OLLAMA_HOST` smoke recommended.
