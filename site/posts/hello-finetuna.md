---
title: "finetuna.net"
date: 2026-08-13
description: Install notes and posts for the Ollama context tuner. Named models that stay on the GPU.
tags: [meta, releases]
---

The CLI is on npm. This site is install notes and short posts, not a second copy of the GitHub README.

Three things it does:

- GPU-fit via `/api/ps` (`size_vram` / `size`)
- A named model you can `ollama run` (`Modelfile-finetuna` + `ollama create`)
- `--check` / `--verify` with no create

`npm i -g finetuna`, or see [/install](/install). **1.1.2** was published from GitHub Actions with provenance.

Companion for other machines on the network: [ollanet](https://ollanet.dev). The site is [FilePress](https://getfilepress.com).
