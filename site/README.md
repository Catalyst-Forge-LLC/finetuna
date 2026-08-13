# Finetuna.dev

Marketing + notes site for [Finetuna](https://github.com/Catalyst-Forge-LLC/finetuna), built with [FilePress](https://getfilepress.com) ([`getfilepress`](https://www.npmjs.com/package/getfilepress) on npm).

```bash
pnpm install
pnpm dev          # local preview
pnpm build        # → build/
```

From the package root: `pnpm site:dev`, `pnpm site:build`, `pnpm site:deploy`.

Optional: edit `theme.css` next to `filepress.config.ts`.

## Deploy (Cloudflare Pages)

**Use one pipeline only.** Dual deploys overwrite each other when asset hashes disagree.

```bash
pnpm deploy
# = pnpm build && wrangler pages deploy build --project-name=finetuna
```

Then attach **finetuna.dev** in the Cloudflare dashboard.

### Git-connected Pages

| Setting | Value |
| --- | --- |
| Root directory | `site` |
| Build command | `pnpm install && pnpm build` |
| Output directory | `build` |

Dependency is the public npm package:

```json
"getfilepress": "^0.1.2"
```

## Content sync

**Site** = product narrative (home, Install, posts). **Root README** = CLI / flag / env reference. Same promise sentence and “not weight fine-tuning” disambiguation in both; when behavior changes, update README + `site/pages/*`.

## Launch checklist

- [ ] `pnpm deploy` (or git-connected Pages) and confirm `https://finetuna.dev`
- [ ] Attach the custom domain in Cloudflare Pages
- [ ] Confirm `og:image` / Twitter card in a debugger
