# Flash Attention + MMAP Injection

**Status:** completed

## Shipped

- `detectFlashAttnSupport()` via `nvidia-smi` GPU name (RTX 20xx+, Quadro RTX, T4/A100-class).
- Modelfile injection: `PARAMETER use_mmap 0` and `PARAMETER flash_attn 1`.
- `--flash-attn` / `--no-flash-attn` / `FINETUNA_FLASH_ATTN` env override.
- Interactive prompt on supported GPUs when left on auto.
- Auto-tune Phase 3 A/B benchmarks flash on vs off (when flash is auto and auto-tune runs).
