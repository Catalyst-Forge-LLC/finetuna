# Finetuna Enhancement Spec

**Status:** completed (2026-06)

All six roadmap items are shipped. Per-feature notes live alongside this file in `specs/completed/`.

---

## 1. Tokens/sec Reporting — done

See [tokens-per-sec-reporting.md](./tokens-per-sec-reporting.md).

---

## 2. Flash Attention + MMAP Flag Injection — done

See [flash-attention-injection.md](./flash-attention-injection.md).

---

## 3. OpenClaw Preset Mode — done

See [openclaw-preset-64k.md](./openclaw-preset-64k.md) and [openclaw-modelfile-preset.md](./openclaw-modelfile-preset.md).

---

## 4. Consistent Naming Convention — done

See [benchmark-report-and-naming.md](./benchmark-report-and-naming.md).

---

## 5. VRAM Panic Button — done

See [vram-panic-button.md](./vram-panic-button.md).

---

## 6. Verbose Benchmark Output Mode — done

See [benchmark-report-and-naming.md](./benchmark-report-and-naming.md).

---

## Possible follow-ups (not in original scope)

- Poll VRAM at 1s intervals during generation for more accurate peak (currently sampled at benchmark end).
- Record benchmark rows for every auto-tune candidate, not just the final config.
- `ollama cp` vs recreate for suggested naming when tags differ.
