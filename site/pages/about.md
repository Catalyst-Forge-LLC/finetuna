---
title: "Find settings that fit your model and GPU."
description: "Finetuna tests runtime settings on your Ollama host, checks GPU residency, and saves a named configuration. Keep a useful setup for the hardware you have, instead of repeatedly guessing at flags."
order: 1
---

<section class="value-hero" aria-label="Finetuna overview"><div class="value-intro"><div class="value-headline"><p class="value-kind">Command-line runtime tuner for Ollama</p><h1>Find settings that fit your model and GPU.</h1></div><div class="value-pitch"><p class="value-lede">Finetuna tests runtime settings on your Ollama host, checks GPU residency, and saves a named configuration. Keep a useful setup for the hardware you have, instead of repeatedly guessing at flags.</p><div class="cta-row"><a class="cta cta-primary" href="/install">Install Finetuna</a><a class="cta cta-secondary" href="#settings-example">See settings and a residency check</a></div><p class="value-limit">It changes runtime settings, not model weights. Results apply to the tested model, context, and host load.</p></div></div>
<figure class="value-proof worked-example" id="settings-example" tabindex="-1">
<figcaption>Keep the settings you checked, then recheck the saved model</figcaption>
<p class="example-context">Invented Ollama session for llama3.2. Values below illustrate the file and residency messages; they are not measurements from your GPU or recommended settings for every machine.</p>
<section class="example-step" aria-labelledby="example-step-1">
<h2 id="example-step-1"><span>1 · Check the loaded run</span> Some of the model is off the GPU</h2>
<pre><code>finetuna --verify llama3.2</code></pre><p>Illustrative console excerpt:</p><pre><code>⚠️  Not fully on GPU → size_vram/size=75.0%</code></pre><p>This tells you why a different context or batch setting is worth testing.</p>
</section>
<section class="example-step example-report" aria-labelledby="example-step-2">
<h2 id="example-step-2"><span>2 · Test and save a variant</span> The settings survive the tuning session</h2>
<p>Illustrative <code>Modelfile-finetuna</code> after testing a smaller context:</p><pre><code>FROM llama3.2
PARAMETER num_ctx 8192
PARAMETER num_gpu 999
PARAMETER num_batch 512</code></pre><p>Create the named variant <code>llama3.2-ft</code> with the settings that pass on your host.</p>
</section>
<section class="example-step" aria-labelledby="example-step-3">
<h2 id="example-step-3"><span>3 · Verify the saved name</span> Check the configuration you will actually use</h2>
<pre><code>finetuna --verify llama3.2-ft</code></pre><p>Illustrative successful console excerpt:</p><pre><code>✅ Perfect! Model is fully on GPU (size_vram/size=1.000) — it’s hooked! 🐟</code></pre><p class="example-payoff">You have a named setup to reuse and a command to recheck when host load changes.</p>
</section>
<p class="value-note">These ratios describe residency at check time, not speed or answer quality. Verification loads an existing model; it does not create one. No model weights are trained.</p>
<p class="example-links"><a href="/install">See the create, check, and verify commands</a></p>
</figure></section>

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
