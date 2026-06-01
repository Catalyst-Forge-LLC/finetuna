# OpenClaw Preset Mode (64K)

**Status:** completed

## Shipped

- `--openclaw` defaults context picker to 65536 (64K OpenClaw target).
- Context tiers step down from 64K; auto-tune Phase 2 continues to smaller sizes on GPU fit failure.
- `PARAMETER num_keep 64` in Modelfile when OpenClaw mode is on.
- VRAM warning when detected ceiling is below 64K.
- `--openclaw-agent` sets `temperature 0.1` and `top_k 20` (implies `--openclaw`).

## Baseline

See [openclaw-modelfile-preset.md](./openclaw-modelfile-preset.md) for the original Gemma4 TEMPLATE block.
