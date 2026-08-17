---
title: Fit more context on your GPU — and keep it.
description: VRAM-aware context tuner for Ollama. Named models that stay on the GPU.
order: 1
---

Not weight fine-tuning. No LoRA, no training. Finetuna sets `num_ctx`, `num_batch`, and `num_gpu`, then saves a named Ollama model you can `ollama run`.

If part of the model spills to CPU, generation can drop by 5–10×. Ollama's defaults are conservative. A 24GB card can sit at 4K context and never get checked.

<div class="cta-row">
  <a class="cta cta-primary" href="/install">Install Finetuna →</a>
  <a class="cta cta-secondary" href="https://github.com/Catalyst-Forge-LLC/finetuna">View on GitHub</a>
</div>

<p class="kicker">npm · pnpm · Node 18+ · MIT</p>

## What it answers

Does it fit? `/api/ps` compares `size_vram` to `size`. How much context still fits? The largest window that stays on the GPU. Can you keep the settings? A named Modelfile variant.

Leaving the incumbent is valid. Auto-tune only switches when the win beats measured noise (median + spread).

## Quick start

```bash
npm install -g finetuna
finetuna --check
finetuna
```

`--check` and `--dry-run` never run `ollama create`. Non-interactive create: `--model` `--name` `--ctx`. Context fit-search: `--auto-tune`.

Flags: [install](/install) and the [GitHub README](https://github.com/Catalyst-Forge-LLC/finetuna#readme).

## With ollanet

<div class="mesh-panel">
  <p>Finetuna runs on the machine that hosts Ollama. To find and chat with those models from another box, use <a href="https://ollanet.dev"><strong>ollanet</strong></a>.</p>
  <p>Here: <code>finetuna</code> writes a named variant. There: <code>ollanet scan</code> then <code>ollanet prompt</code>. Same API.</p>
</div>

## What a run does

1. Pick a source model and a new name
2. Pick context / batch / GPU layers (presets through 128K)
3. Write `Modelfile-finetuna` and run `ollama create`
4. Measure baseline speed; optionally search context that still fits
5. Suggest a name like `gemma4-ctx32k-flash`

Built by [Catalyst Forge LLC](https://www.catalystforge.com).
