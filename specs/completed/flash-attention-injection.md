# Flash Attention (server env)

**Status:** completed (corrected)

## Important

Ollama does **not** accept `PARAMETER flash_attn` (or `use_mmap` paired for this purpose) in a Modelfile. `ollama create` fails with `unknown parameter 'flash_attn'`.

Flash attention is controlled on the **Ollama server**:

```bash
OLLAMA_FLASH_ATTENTION=1
```

See [Ollama FAQ](https://docs.ollama.com/faq). Restart the Ollama app/service after changing it.

## What Finetuna does

- Detects RTX 20xx+ (and similar) GPUs via `nvidia-smi`
- Prints setup tips for `OLLAMA_FLASH_ATTENTION` (Windows `setx`, bash `export`, systemd)
- `--flash-attn` / `--no-flash-attn` / `FINETUNA_FLASH_ATTN` control naming (`-flash` suffix) and docs intent only
- Records flash intent in results/state comments — does **not** inject invalid Modelfile parameters
- No per-model A/B via recreate (cannot toggle flash without restarting the Ollama server)
