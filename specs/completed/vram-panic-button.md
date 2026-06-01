# VRAM Panic Button

**Status:** completed

## Shipped

- `--unload` / `--panic` lists models via `GET /api/ps` and evicts each with `keep_alive: 0` on `/api/generate`.
- `--reload` warms the last model from `.finetuna-state.json`.
- State file written after successful Finetuna run (model, ctx, batch, flash, openClaw).
