---
title: Fit more context on your GPU — and keep it.
description: VRAM-aware context tuner for Ollama. Named models that stay on the GPU.
order: 1
---

**Finetuna** is not weight fine-tuning. No LoRA, no training. It tunes **runtime** settings — `num_ctx`, `num_batch`, `num_gpu` — and saves them as a reusable named Ollama model.

If even a few layers spill to CPU, generation can slow down **5–10×**. Most people never check whether their model is fully resident — and Ollama’s conservative defaults leave plenty of 24GB cards quietly running 4K context.

<div class="cta-row">
  <a class="cta cta-primary" href="/install">Install Finetuna →</a>
  <a class="cta cta-secondary" href="https://github.com/Catalyst-Forge-LLC/finetuna">View on GitHub</a>
</div>

<p class="kicker">npm · pnpm · Node 18+ · MIT</p>

## Three questions

- **Will it fit?** Verified via `/api/ps` (`size_vram` / `size`) — not a guess
- **How much context can I actually get?** Largest window that stays on the GPU
- **Can I keep it?** A named Modelfile variant any client can `ollama run` forever

Honest **“no change needed”** is a feature. Auto-tune only switches settings when the win beats measured noise (median + spread).

## Quick start

```bash
npm install -g finetuna
finetuna --check
finetuna
```

Look-but-don’t-touch: `--check` / `--dry-run`. Non-interactive: `--model` `--name` `--ctx`. Optional fit-search: `--auto-tune`.

Full flags live on the [install](/install) page and the [GitHub README](https://github.com/Catalyst-Forge-LLC/finetuna#readme).

## The ollanet loop

<div class="mesh-panel">
  <p>Finetuna runs on the machine that <em>hosts</em> Ollama. To discover and chat with those models from another box on your LAN, Tailscale, or VPN, use <a href="https://ollanet.dev"><strong>ollanet</strong></a>.</p>
  <p>Here: <code>finetuna</code> → a tuned named variant. Elsewhere: <code>ollanet scan</code> → <code>ollanet prompt</code>. Same API, closed loop.</p>
</div>

## What a run does

1. Choose a source model and a new name
2. Pick context / batch / GPU layers (presets through **128K**)
3. Write **`Modelfile-finetuna`** and run **`ollama create`**
4. Measure baseline speed; optionally search context that still fits
5. Suggest a self-documenting name like `gemma4-ctx32k-flash`

Goal: an **optimum that still fits in memory** — not “always shrink context,” not “always claim a speedup.”

<div class="cta-row">
  <a class="cta cta-primary" href="/install">Get started →</a>
  <a class="cta cta-secondary" href="/writing">Read the posts</a>
</div>

Built by [Catalyst Forge LLC](https://www.catalystforge.com).
