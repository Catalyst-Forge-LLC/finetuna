# Auto-tune reliability, remote host, packaging — feature spec

**Spec kind:** Delivery  
**Status:** Draft  
**Date:** 2026-08-10  
**Related:** `TODO.md` (Tests, Binary / `bin` entry); [ollama-host-and-http-api.md](./completed/ollama-host-and-http-api.md); [ollama-api-resilience.md](./completed/ollama-api-resilience.md); [tokens-per-sec-reporting.md](./completed/tokens-per-sec-reporting.md); ollanet bench spec (median + spread — align Finetuna with that verifier)  
**Surfaces:** `finetuna.js` (benchmarks, GPU fit, path helpers), `package.json`, `README.md`, `TODO.md`, new test harness

---

## 1. Problem

Finetuna’s auto-tune **writes Modelfile parameters** from noisy short benchmarks. Selection uses mean-of-N and argmax, so thermal blips, background GPU load, and random generation length can crown a challenger that is not meaningfully faster — especially a larger `num_batch` that spends real VRAM for a 2% “win.”

Several related gaps make the tool disagree with its intended verifier (ollanet bench) and misbehave outside a local checkout:

1. **Selection noise** — mean of 3, no spread gate, ties prefer array order over the incumbent; failed runs return `0` and compete as if measured.
2. **Unpinned decode length** — speed prompt invites short answers; `num_predict: 80` rarely binds; temperature default makes repeats incomparable.
3. **Remote `OLLAMA_HOST`** — local `nvidia-smi` / `sysctl` / process lists size context and warn about the wrong machine.
4. **Fragile GPU-fit** — `checkGPUFit` shells `ollama ps` and parses columns; `/api/ps` already exists and exposes `size` / `size_vram`.
5. **Install story broken** — no npm `bin` / `files` / `repository`; cwd-relative state files scatter when used as a global command (`--reload` fails unless cwd matches).
6. **No tests** — selection and JSON-shape logic are unguarded; a mock `/api/generate` + `/api/ps` would cover the highest-value paths without a GPU.

---

## 2. Goals

1. **Stable auto-tune winners** that match ollanet’s median + spread story: only switch when the challenger beats the incumbent by more than observed spread; otherwise keep the incumbent and say so.
2. **Pinned, comparable speed samples** (`seed`, long prompt so `num_predict` binds, surface `done_reason`).
3. **Correct host affinity:** when Ollama is remote, do not probe local GPUs; lean on remote `/api/ps`.
4. **GPU-fit via `/api/ps` JSON** (`size_vram` vs `size`), with CLI `ollama ps` as fallback only.
5. **Safe installable CLI:** `bin`, published `files`, and state under `~/.finetuna/` (or platform equivalent) when installed.
6. **Automated tests** for selection, failure exclusion, and max-context pick — no real GPU required.

### Non-goals

- Changing Modelfile parameter *sets* (flash_attn, client presets, context tier ladder) except where selection/output copy changes.
- Running `npm publish` / `pnpm publish` in-agent — maintainer publishes after M3 tee-up is ready.
- Replacing Enquirer UX or rewriting the whole auto-tune UI.
- Perfect thermal control or multi-GPU remote inventory APIs (document limits).
- Porting ollanet’s full bench UI — share **aggregation + significance** via a tiny helper (see M5), not the full ollanet CLI.

---

## 3. Background / current state

| Area | Today |
| ---- | ----- |
| Speed / batch / ctx benches | `benchmarkModel` / `benchmarkPromptEval` return **mean** of successful runs; print min/avg/max then discard spread |
| Winner pick | `filter(gpu && avg > 0).sort(avg desc)[0]` — Phase 1 & Phase 2 |
| Failures | Failed run → `0` in the results array; all-fail → avg `0`, still in comparison path |
| Speed request | Prompt: short fun fact; `options.num_predict: 80`; no `seed`; `think: false` top-level (keep) |
| Host | `OLLAMA_BASE` from `OLLAMA_HOST`; GPU memory via local `nvidia-smi` / AMD / Apple / WMI |
| GPU fit | Load via `/api/generate`, then parse `ollama ps` text (`100% GPU` / Metal / %) |
| HTTP ps | `listLoadedModelsHttp()` maps names only — drops `size` / `size_vram` |
| Artifacts | `process.cwd()`: `Modelfile-finetuna`, `.finetuna-state.json`, `finetuna-results.json`, `finetuna-benchmark.md` |
| Package | No `bin`, `files`, `repository`; README / ollanet expect a `finetuna` command |
| Tests | None (`TODO.md`) |

Strengths to preserve: argv `spawnSync` (no shell injection), API-options probing (no recreate per candidate), SIGINT abort of in-flight fetches, Apple Silicon unified-memory path, GPU-heavy app flagging (local only).

---

## 4. Core concepts / definitions

| Term | Meaning |
| ---- | ------- |
| **Incumbent** | Current `num_batch` / `num_ctx` (baseline) entering a phase |
| **Challenger** | Another candidate under test |
| **Median rate** | Median of successful run rates (tok/s); primary score |
| **Spread** | `max − min` over successful runs for that candidate (same units as rate) |
| **Significant win** | Challenger median − incumbent median **>** max(challenger.spread, incumbent.spread). If either side has &lt; 2 successful runs, do not treat as significant (keep incumbent) unless only the challenger has data and incumbent has none |
| **Failed candidate** | Zero successful runs, or GPU-fit false — **excluded** from winner selection (not scored as `0`) |
| **Local Ollama** | `OLLAMA_BASE` hostname is loopback (`127.0.0.1`, `localhost`, `::1`, or equivalent) |
| **Remote Ollama** | Anything else — skip local GPU probes |
| **Installed mode** | Package resolved outside the git checkout (mirror ollanet `IS_INSTALLED` / `paths.ts` idea) → writable dir `~/.finetuna/` |
| **Cap bound** | `/api/generate` `done_reason === 'length'` (or equivalent) — `num_predict` stopped generation |

---

## 5. Proposed approach / Design

### 5.1 Behavior — auto-tune selection (P0)

**Return shape** from `benchmarkModel` / `benchmarkPromptEval` (and any shared helper):

```ts
{
  ok: boolean;           // ≥1 successful run
  median: number;        // 0 if !ok
  mean: number;          // optional, for verbose/debug
  min: number;
  max: number;
  spread: number;        // max - min; 0 if <2 successes
  n: number;             // successful runs
  rates: number[];       // successful rates only
}
```

**Selection** (`pickSignificantWinner(incumbentCand, results, { preferSmallerBatch?: boolean })`):

1. Drop candidates with `!gpu` or `!ok`.
2. Locate incumbent row; if missing/failed, prefer best remaining by median (Phase 2 max-context goal may still prefer largest fitting — see below).
3. Among valid challengers, sort by median descending.
4. Switch only if top challenger has a **significant win** over incumbent.
5. **Ties / non-significant:** keep incumbent; print e.g. `No significant difference — keeping 512` (include medians + spreads in the line).
6. **Phase 1 (`num_batch`):** burden of proof on challenger (VRAM cost of larger batch). If two challengers both significant vs incumbent, prefer higher median; if medians within spread of each other, prefer **smaller** `num_batch`.
7. **Phase 2:** honor existing goals:
   - `max-context` / `--max-vram` (**D8**): among GPU-fit + ok candidates, find the **best median** (highest). Then choose the **largest** `num_ctx` whose median is **not significantly slower** than that best median (i.e. `best.median − cand.median` is not greater than `max(best.spread, cand.spread)`). Never pick failed/OOM. This keeps large context when the slowdown is noise, and backs off when a huge ctx is meaningfully slower.
   - Speed-oriented goal: same significant-win rule as Phase 1, incumbent = baseline ctx.

**Console:** print `min / median / max` (and spread) instead of leading with avg as the decision metric. Tag winners `◀ best` only when selection actually chose them; tag `no significant Δ` when kept.

**Failed vs slow:** never push `0` into the rate array used for median. UI may show `—` for failed candidates.

### 5.2 Behavior — pinned speed samples

In `getSpeedMetrics` (generation path used by auto-tune / before-after):

1. Replace the short fun-fact prompt with a **long-output** prompt that routinely exceeds the cap (reuse/adapt the absurd-recipe style already in-tree, or a dedicated “write until stop” request).
2. Raise default **`options.num_predict` to `256`** (**D9**) so decode samples are long enough for stable `eval_rate`. Override via `FINETUNA_NUM_PREDICT` / `--num-predict` if we already have a flag pattern; otherwise env is enough for M1.
3. Set `options.seed` to a fixed constant (`42`) for auto-tune / comparable repeats. Env override: `FINETUNA_BENCH_SEED`.
4. Record `done_reason` from the JSON body; when `FLAGS.verbose` or when cap did not bind (`done_reason !== 'length'` and eval_count ≪ num_predict), log a one-line warning that the sample was short (do not fail the run solely for that).
5. Keep `think: false` top-level.

Prompt-eval benchmarks may keep a long prompt (already) but should also use a fixed `seed` where the API accepts it for consistency.

**Why 256:** 80 rarely binds and yields ~25–40 token samples with noisy rates. 256 is long enough for stabler decode stats without making Phase 2 (many ctx × repeats) painfully slow. If verbose shows frequent non-`length` stops, revisit the prompt before raising further.

### 5.3 Behavior — remote vs local Ollama

1. Add `isLocalOllamaBase(baseUrl): boolean`.
2. On startup:
   - **Local:** current GPU memory report, heavy-app warnings, `--max-vram` local dedicated VRAM targeting.
   - **Remote:** skip `detectGpuMemory` / `listGpuComputeApps` / local free-VRAM warnings; print clearly e.g. `Ollama is remote (http://…). Skipping local GPU probes — sizing uses the server via /api/ps after load.` Soft context hints may fall back to “unknown VRAM” tiers or a conservative default; do not claim laptop VRAM.
3. Context picker / `--max-vram`: if remote, either disable `--max-vram` with an explanation or redefine it as “maximize ctx that still GPU-fits on remote via `/api/ps`” without local free-MiB math. Prefer the latter only if fit checks are API-based (M2).

### 5.4 Behavior — GPU fit via `/api/ps`

1. Extend HTTP helpers to return full model rows: `name`, `size`, `size_vram`, and any processor/details fields Ollama provides.
2. After load probe, poll **`GET /api/ps`** until the model appears (same timeout budget as today).
3. Fit rule (dedicated NVIDIA / discrete):
   - Prefer `size_vram === size` (full offload), or `size_vram / size >=` threshold (e.g. 0.99) to absorb int rounding.
4. Apple Silicon / unified: treat loaded + mostly-on-GPU as OK (keep current unified leniency using any processor hint if present; if API only has sizes, `size_vram > 0` and ratio ≥ 0.5 may match today’s “≥50% GPU” spirit — lock in Decisions during impl).
5. Keep `ollama ps` text parsing as **fallback** when `/api/ps` fails (CLI local only); never require CLI for remote hosts.
6. Update README “Proof it stays on the GPU” to mention `/api/ps` (`size_vram`).

### 5.5 Behavior — packaging & paths

**npm name:** `finetuna` is **available** on the registry (404 today). First publish uses unscoped `finetuna@1.0.0` (or bump if needed). Maintainer runs publish; agents do not.

1. **`package.json` tee-up (do before first publish):**
   - `"bin": { "finetuna": "./finetuna.js" }`
   - shebang `#!/usr/bin/env node` at top of `finetuna.js`
   - `"files": ["finetuna.js", "README.md", "LICENSE"]` (and any tiny extracted runtime modules — **not** `specs/`)
   - `"repository"`, `"homepage"`, `"bugs"` → `https://github.com/Catalyst-Forge-LLC/finetuna`
   - `"keywords"`: e.g. `ollama`, `modelfile`, `llm`, `gpu`, `tuner`
   - `"scripts.test"` once M4 lands; optional `"prepublishOnly": "pnpm test"`
2. **Paths helper** (ollanet `IS_INSTALLED` / `~/.ollanet/` pattern → `~/.finetuna/`):
   - **Checkout / dev:** artifacts under `process.cwd()` (current behavior).
   - **Installed:** `.finetuna-state.json`, `finetuna-results.json`, `finetuna-benchmark.md` under `~/.finetuna/` so `--reload` works from any cwd.
   - **Modelfile location:** still open — see tradeoffs below; pick before M3 merge.
3. README: install (`npm i -g finetuna` / `pnpm add -g finetuna`), data dir, migration note for old cwd state files.
4. **Publish checklist (maintainer):** M3 paths + bin green → `pnpm test` → `npm pack --dry-run` (confirm no `specs/`) → `pnpm publish --access public` (user runs this).

#### Modelfile path tradeoffs (Open Question 3 — pick one)

| Option | Behavior | Pros | Cons |
| ------ | -------- | ---- | ---- |
| **A. Cwd Modelfile + home state** | Installed: write `Modelfile-finetuna` in `process.cwd()`; state/results in `~/.finetuna/` | Editable “here”; matches mental model of “I tuned in this project folder”; easy to `cat` / commit Modelfile next to a project | Cwd pollution; two directories to know; Modelfile from last run may be “left behind” in random folders |
| **B. All under `~/.finetuna/`** | Modelfile, state, results, benchmark md all in home data dir | Predictable; no cwd clutter; `--reload` and last Modelfile always in one place | Less discoverable; users who want a project-local Modelfile must copy; surprising if they expect a file “right here” |
| **C. Home default + `--modelfile PATH`** | Default **B**, optional flag/env to write Modelfile (and maybe results) to a path/cwd | Best of both once documented; scripting-friendly | Slightly more surface area; need clear help text |

**Recommendation to resolve later:** prefer **C** (home default + override) if we want one solid install story; prefer **A** if we want minimal behavior change for people who already look for `Modelfile-finetuna` in cwd. **Do not block M1/M2** on this — only M3.

### 5.6 Behavior — tests

Minimal harness (Node built-in test runner — `node:test` + `node:assert`):

| Case | Expect |
| ---- | ------ |
| Challenger +2% with spread 6% | Keep incumbent; “no significant difference” |
| Challenger +15% with spread 3% | Switch |
| Candidate all runs fail | Excluded; not chosen over slower ok candidate |
| Incumbent fails GPU, challenger ok | Pick challenger |
| Remote base URL | `isLocalOllamaBase` false; GPU detect skipped (unit) |
| Fit JSON `size_vram === size` | ok; partial ratio fails on discrete |
| Max-context | Largest fitting ctx that is not significantly slower than best median (**D8**) |

Use a mock HTTP server returning canned `/api/generate` (`eval_count`, `eval_duration`, `done_reason`) and `/api/ps`. Extract pure functions (`median`, `spread`, `isSignificantWin`, `pickSignificantWinner`, `pickMaxContext`, `isLocalOllamaBase`, `gpuFitFromPsModel`) for unit tests without booting the full CLI.

### 5.7 Shared bench-math helper (M5 / cross-tool)

**Decision (D10):** yes — extract shared selection math so Finetuna (tuner) and ollanet (verifier) cannot drift.

**Shape (tiny, zero-dep ESM):**

- `median(rates: number[]): number`
- `spread(rates: number[]): number` — `max − min`, `0` if `length < 2`
- `summarizeRates(rates: number[]): { ok, median, mean, min, max, spread, n }`
- `isSignificantWin(challenger, incumbent): boolean` — same rule as §4
- Optional: `pickSignificantWinner(...)` / `pickMaxContextNotSignificantlySlower(...)` if both CLIs want identical orchestration

**Rollout:**

1. **M1:** implement helpers **inside** Finetuna (or `lib/bench-stats.js` in this repo) with tests.
2. **M5:** publish a tiny package (working name: `ollama-bench-stats` — confirm name free at extract time; or `@catalyst-forge/ollama-bench-stats` if scoping is preferred).
3. Finetuna depends on it; ollanet switches its bench spec implementation to the same package and drops duplicated math.
4. Until M5 ships, keep **identical semantics + mirrored tests** and a README note: “aligned with ollanet bench (median + spread).”

### 5.8 Files (optional)

| New | Modified |
| --- | -------- |
| `specs/auto-tune-reliability-remote-packaging.md` (this) | `finetuna.js` |
| `lib/bench-stats.js` (or inline until M5) | `package.json`, `README.md`, `TODO.md` |
| `test/*.test.js` | |

---

## 6. Edge cases and risks

- **n &lt; 2 successes:** spread is 0 or undefined — do not switch on a single noisy sample vs incumbent with real spread; keep incumbent if incumbent `ok`.
- **All candidates fail:** keep baseline settings; do not write a “winner” from zeros.
- **CLI fallback path** (`ollama run`) still has no eval_rate — treat as `!ok` for selection (already `noRateMetrics`).
- **Remote without GPU metrics:** context soft-labels unavailable; user may pick ambitious ctx — fit check after load remains authoritative.
- **WDDM / Windows:** local process VRAM may still be N/A; unchanged for local; irrelevant for remote skip.
- **Published `files` too narrow:** forgetting new runtime assets breaks install — only ship what `bin` needs.
- **Path detection false positive:** if `IS_INSTALLED` wrong, state goes to unexpected place — log resolved data dir once at startup when verbose.

| Risk | Mitigation |
| ---- | ---------- |
| Users expect old mean-based “best” | Print median + spread; message when keeping incumbent |
| ollanet still disagrees | Same significance rule; document in README “aligned with ollanet bench” |
| Remote fit ambiguous on Mac server | Unified rule in Decisions; verbose dump of `/api/ps` row |
| Breaking cwd workflows for devs | Dev/checkout keeps cwd artifacts |

---

## 7. Milestones / phasing

| Milestone | Outcome |
| --------- | ------- |
| **M1 — Selection + samples** | Median/spread; significant-win picker; **D8** max-context; long prompt + **`num_predict: 256`** + seed + `done_reason`; failed ≠ 0; Phase 1/2 messaging. **Ship this first.** |
| **M2 — Remote + `/api/ps` fit** | Localhost detection; skip local GPU on remote; GPU-fit from JSON; CLI ps fallback |
| **M3 — Packaging + publish tee-up** | shebang, `bin`, `files`, repo metadata; `~/.finetuna/` when installed; resolve Modelfile option A/B/C; README install; dry-run pack. **Maintainer publishes.** |
| **M4 — Tests** | Mock server / pure-function tests for M1–M2 rules; `pnpm test` script |
| **M5 — Shared `ollama-bench-stats`** | Extract bench math; publish tiny package; wire Finetuna + ollanet |

---

## 8. Acceptance criteria

1. Given three noisy runs where challenger mean/median is within spread of incumbent, when Phase 1 finishes, then incumbent `num_batch` is kept and the tool prints that there was no significant difference (not “Best batch size: …”).
2. Given a challenger whose median exceeds incumbent median by more than both spreads, when Phase 1 finishes, then the challenger is selected.
3. Given a candidate whose every generate fails, when selecting a winner, then that candidate is excluded (not treated as 0 tok/s beating nothing incorrectly, and not crowned).
4. Given speed benchmarks, when `/api/generate` runs, then requests use default **`num_predict: 256`**, a fixed `seed`, and a long prompt that normally yields `done_reason: length`.
5. Given `OLLAMA_HOST` pointing at a non-loopback host, when Finetuna starts, then it does not call local `nvidia-smi` / Apple memory probes for sizing, and it states that local GPU probes were skipped.
6. Given a loaded model on the Ollama host, when checking GPU fit, then Finetuna uses `/api/ps` `size` / `size_vram` (CLI text only if HTTP unavailable on local).
7. Given an installed `finetuna` binary, when the user runs from an arbitrary cwd, then `--reload` reads/writes state under `~/.finetuna/` (or platform home equivalent).
8. Given `package.json` after M3, when `npm pack --dry-run` runs, then `bin` is present, `specs/` is absent, and install docs describe global `finetuna`.
9. Given the test suite, when run without a GPU / Ollama, then M1 selection cases (including **D8** max-context) and fit/host helpers pass.
10. Given M5, when ollanet and Finetuna both depend on the shared bench-stats package, then significance math is imported—not copied.

---

## 9. Open questions

| # | Question | Status | Notes |
| - | -------- | ------ | ----- |
| 1 | Phase 2 max-context vs slight slowdown | **Resolved → D8** | Largest ctx that is not significantly slower than best median |
| 2 | Raise `num_predict`? | **Resolved → D9** | Default **256**; env override |
| 3 | Installed-mode Modelfile path (cwd vs home vs flag) | **Open (blocks M3 only)** | Tradeoffs in §5.5; recommend C or A |
| 4 | npm name `finetuna` | **Resolved** | Available; tee up in M3; **maintainer publishes** |
| 5 | Shared bench-math package with ollanet? | **Resolved → D10** | Yes — M5 after in-repo helpers stabilize |

---

## 10. Decisions

**D1.** Primary score is **median**, not mean. Spread = max − min of successful runs.  
**D2.** Switch only on **significant win**; otherwise keep incumbent (ties → incumbent).  
**D3.** Failed candidates are excluded (`ok: false`), never scored as `0`.  
**D4.** Implement **M1 before** packaging or remote work — Modelfile correctness first.  
**D5.** Align wording and math with ollanet bench (median + spread / no difference); later share code via M5.  
**D6.** Remote host → no local VRAM truth; say so; use `/api/ps` on the server.  
**D7.** Prefer `/api/ps` JSON for GPU-fit; demote `ollama ps` parsing to fallback.  
**D8.** Phase 2 `max-context` / `--max-vram`: pick the **largest** fitting ok `num_ctx` that is **not significantly slower** than the best median among fitting candidates.  
**D9.** Default generation bench **`num_predict = 256`** (was 80), with long prompt + fixed seed so the cap binds.  
**D10.** Extract shared bench-stats for Finetuna + ollanet (M5); implement in-repo first in M1/M4.  
**D11.** Package name **`finetuna`** on npm; prepare metadata/bin/files in M3; maintainer runs publish (agents do not).

---

## Progress (while Partial)

- `2026-08-10:` Spec drafted from external review (selection noise, num_predict pin, remote host, `/api/ps` fit, packaging paths, tests).
- `2026-08-10:` Locked D8–D11 from maintainer answers; documented Modelfile path tradeoffs (Q3 still open for M3); publish tee-up + M5 shared helper.

---

## Implementation summary

**Implemented:** _(empty until completed)_

**Verification:** _(e.g. `pnpm test` / manual auto-tune on local + remote Ollama)_
