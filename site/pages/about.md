---
title: "Find settings that fit your model and GPU."
description: "Finetuna tests runtime settings on your Ollama host, checks GPU residency, and saves a named configuration. Keep a useful setup for the hardware you have, instead of repeatedly guessing at flags."
order: 1
---

<section class="value-hero" aria-label="Finetuna overview"><div class="value-intro"><p class="value-kind">Command-line runtime tuner for Ollama</p><h1>Find settings that fit your model and GPU.</h1><p class="value-lede">Finetuna tests runtime settings on your Ollama host, checks GPU residency, and saves a named configuration. Keep a useful setup for the hardware you have, instead of repeatedly guessing at flags.</p><div class="cta-row"><a class="cta cta-primary" href="/install">Install Finetuna</a><a class="cta cta-secondary" href="#quick-start">See the tuning workflow</a></div><p class="value-limit">It changes runtime settings, not model weights. Results apply to the tested model, context, and host load.</p></div><figure class="value-proof"><figcaption>Illustrative example</figcaption><p><strong>Starting point</strong><br>A local model may be spilling part of its workload onto the CPU.</p><div class="value-result"><p><strong>What you get</strong><br>A residency check and a Modelfile recording the tested context, batch, and GPU settings.</p></div><p>Create the named variant and verify it again when the model or host load changes.</p><p class="value-note">Illustrative workflow. No speed increase or permanent residency is promised.</p></figure></section>

The saved Modelfile records `num_ctx`, `num_batch`, and `num_gpu`. Create the named Ollama variant from it, then run that name. Check the CONTEXT column in `ollama ps` instead of assuming a fixed default.

## What it answers

Does this loaded run look GPU-resident? `/api/ps` compares `size_vram` to `size`. How much context still fits in that search? The largest window that stays on the GPU. Can you keep the settings? A named Modelfile variant.

A residency pass is for the model, context, and host load at check time. It is not a perpetual GPU guarantee. Re-run `--verify` after you change the model, context, concurrency, or host load.

`--check` and `--dry-run` never run `ollama create`. `--verify` loads an existing name and does not create a new one.

Leaving the incumbent is valid. The default context search picks the largest window that stayed on the GPU and was not measurably slower than the fastest candidate. A speed or batch search switches only when the win beats measured noise (median + spread).

## Quick start

```bash
npm install -g finetuna
finetuna --check
finetuna
```

Non-interactive create: `--model` `--name` `--ctx`. Context fit-search: `--auto-tune`.

Flags: [install](/install) and the [GitHub README](https://github.com/Catalyst-Forge-LLC/finetuna#readme).

## With ollanet

<div class="mesh-panel">
  <p>Finetuna runs on the machine that hosts Ollama. Each tool works alone. To find and chat with those models from another box, you can use <a href="https://ollanet.dev"><strong>ollanet</strong></a>.</p>
  <p>Here: <code>finetuna</code> writes a named variant. There: <code>ollanet scan</code> then <code>ollanet prompt</code>. Same API.</p>
</div>

## What a run does

1. Pick a source model and a new name
2. Pick context / batch / GPU layers (presets through 128K)
3. Write `Modelfile-finetuna` and run `ollama create`
4. Measure baseline speed; optionally search context that still fits
5. Suggest a name like `gemma4-ctx32k-flash`

Built by [Catalyst Forge LLC](https://www.catalystforge.com).
