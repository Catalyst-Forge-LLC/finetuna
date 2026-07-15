# VRAM-driven Context Picker + Custom Fix

**Status:** completed  
**Shipped in:** `finetuna.js`

## Goal

Offer context-size presets with light VRAM guidance; fix broken Custom input; never hide large windows behind a bad heuristic.

## Implementation

- **`CONTEXT_TIERS`** ladder: 4k … 128k — **all shown** in the default picker
- **`maxSuggestedCtxFromVram(vramGB)`** — soft labeling tiers only (e.g. ≤8GB → 64K guide). **Not** `vram×2048` (that falsely flagged 32K/64K as over-limit on cards that still hit 100% GPU)
- Tiers above the soft guide: `ambitious for this VRAM (often still OK)` — GPU-fit remains the source of truth
- **Custom context fix:** Enquirer `select` returns **`choice.name`**, not `value`
- **`unwrapChoice()`** treats `custom` correctly; invalid values fall back to 8192
- Custom input default: 32768 (65536 in OpenClaw mode)
- **VRAM detection:** NVIDIA `nvidia-smi`, AMD `rocm-smi`, Windows WMI fallback
