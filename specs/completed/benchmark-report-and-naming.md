# Benchmark Report + Naming Convention

**Status:** completed

## Shipped

- `--benchmark-report` prints a markdown table and writes `finetuna-benchmark.md`.
- Columns: num_ctx, num_batch, flash_attn, eval_rate, prompt_eval_rate, VRAM peak (MiB), num_gpu.
- After tuning, prompts to copy model to a self-documenting name (e.g. `model-ctx32k-flash`).
