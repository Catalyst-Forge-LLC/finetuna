---
title: "Hello from finetuna.net"
date: 2026-08-13
description: Product site for the VRAM-aware Ollama context tuner — fit more context, keep a named model.
tags: [meta, releases]
---

**finetuna.net** is the public home for Finetuna: install notes, short posts, and a place that is *not* the GitHub README.

What the CLI already does:

- **GPU-fit** via `/api/ps` (`size_vram` / `size`) — not a VRAM guess
- **Named models** you can `ollama run` forever (`Modelfile-finetuna` + `ollama create`)
- **`--check` / `--verify`** with no create side effects
- **Auto-tune** that only switches when the win beats measured noise (median + spread)
- Remote Ollama via `OLLAMA_HOST`; companion discovery/chat on the network is [ollanet](https://ollanet.dev)

Install with `npm i -g finetuna`, or see [/install](/install). npm **1.1.1** ships with provenance from GitHub Actions.

This site is built with [FilePress](https://getfilepress.com) — git-native Markdown, static HTML, Cloudflare Pages.
