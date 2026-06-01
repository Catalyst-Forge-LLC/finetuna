# VRAM-driven Context Picker + Custom Fix

**Status:** completed  
**Shipped in:** `finetuna.js`

## Goal

Offer context-size presets scaled to detected VRAM; fix broken Custom input; add an optional 32k “stretch” preset.

## Implementation

- **`CONTEXT_TIERS`** ladder (4k … 131k) filtered by **`maxSuggestedCtxFromVram(vramGB)`** ≈ `vramGB × 2048`, cap 131072; unknown VRAM cap 65536
- **`32768` stretch preset** added when VRAM hint is below 32k and 32k is not already in the tier list
- **Custom context fix:** Enquirer `select` returns **`choice.name`**, not `value` — Custom option uses `{ name: 'custom', message: 'Custom (any number you want)' }` so the follow-up input prompt runs
- **`unwrapChoice()`** treats `custom` and strings starting with “custom” as custom; invalid parsed values fall back to 8192
- Custom input **default: 32768**
- **VRAM detection:** NVIDIA `nvidia-smi`, AMD `rocm-smi --showmeminfo vram`, Windows WMI fallback
