# Auto-tune Phase Flags (`--skip-batch` / `--skip-ctx`)

**Status:** completed  
**Shipped in:** `finetuna.js`

## Goal

Allow running Phase 1 (`num_batch` sweep) and Phase 2 (`num_ctx` sweep) independently during auto-tune.

## Problem

`--skip-ctx` was parsed but never honored; Phase 2 ran inside the Phase 1 block, and `--skip-batch` skipped both phases.

## Implementation

- **Phase 1:** `if (!FLAGS.skipBatch) { ... }` — batch sweep, updates `bestBatch`
- **Phase 2:** `if (!FLAGS.skipCtx) { ... }` — context sweep, uses `bestBatch` from Phase 1 or user default
- Skipped phases log a short message; **`bestBatch` / `bestCtx`** still applied in final Modelfile
- **`bestBatch`** hoisted to outer scope for the post-tune “reduce context” loop
- **`batchResults` / `ctxResults`** always defined (empty arrays when a phase is skipped) for `finetuna-results.json`
