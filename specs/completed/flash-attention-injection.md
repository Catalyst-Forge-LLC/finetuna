# Flash Attention + MMAP Injection

**Status:** completed

## Shipped

- `detectFlashAttnSupport()` via `nvidia-smi` GPU name (RTX 20xx+, Quadro RTX, T4/A100-class).
- Modelfile injection: `PARAMETER use_mmap 0` and `PARAMETER flash_attn 1`.
- `--flash-attn` / `--no-flash-attn` / `FINETUNA_FLASH_ATTN` env override.
- Interactive prompt on supported GPUs when **not** using `--auto-tune` (choice is locked).
- With `--auto-tune` and no flash flag, Phase 3 A/B-tests flash on vs off after batch/ctx sweeps so winners stay consistent.
- `--flash-attn` / `--no-flash-attn` / `FINETUNA_FLASH_ATTN` always lock and skip A/B.
