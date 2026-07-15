# VRAM-driven Context Picker + Custom Fix

**Status:** completed  
**Shipped in:** `finetuna.js`

## Goal

Offer context-size presets with VRAM guidance; fix broken Custom input; allow trying larger windows than the VRAM hint.

## Implementation

- **`CONTEXT_TIERS`** ladder: 4k, 8k, 12k, 16k, 24k, 32k, 48k, 64k, 96k, 128k — **all shown** in the default picker
- **`maxSuggestedCtxFromVram(vramGB)`** ≈ `vramGB × 2048` (cap 131072; unknown VRAM → 65536) only **labels** stretch options; it no longer hides 48k/64k+
- Tiers above the hint are tagged `stretch (above VRAM hint)` (through 64k) or `may exceed VRAM hint` (above 64k)
- **Custom context fix:** Enquirer `select` returns **`choice.name`**, not `value` — Custom option uses `{ name: 'custom', message: '…' }`
- **`unwrapChoice()`** treats `custom` correctly; invalid values fall back to 8192
- Custom input default: 32768 (65536 in OpenClaw mode)
- **VRAM detection:** NVIDIA `nvidia-smi`, AMD `rocm-smi`, Windows WMI fallback
