---
title: Ollama runtime tuner
description: Tune runtime settings for your model and GPU, check residency, and save a named variant.
order: 1
---

Tune runtime settings for your model and GPU, check whether the tested configuration stays on the GPU, and save a named variant. The saved settings fit the model and GPU Finetuna tested, under the load at test time. Weights are not trained or altered.

It sets `num_ctx`, `num_batch`, and `num_gpu`, then writes a Modelfile you can `ollama run`. Those settings change how much context and how many layers the host tries to keep in VRAM. They do not make the model reason better by themselves.

If part of the model spills to CPU, generation can run several times slower. Ollama picks a default context from detected VRAM, version, and any override. Check the CONTEXT column in `ollama ps` instead of assuming a 4K default from a 24 GB card label. Official docs use GiB bands, which are not the same as advertised GB.

<div class="cta-row">
  <a class="cta cta-primary" href="/install">Install Finetuna →</a>
  <a class="cta cta-secondary" href="https://github.com/Catalyst-Forge-LLC/finetuna">View on GitHub</a>
</div>

<p class="kicker">npm · pnpm · Node 18+ · MIT</p>

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
