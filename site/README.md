# finetuna.net

Product site for [Finetuna](https://github.com/Catalyst-Forge-LLC/finetuna). [FilePress](https://getfilepress.com) (`getfilepress` on npm).

```bash
pnpm install
pnpm dev          # local preview
pnpm build        # → build/
```

From the package root: `pnpm site:dev`, `pnpm site:build`, `pnpm ship`.

If [LocalBerth](https://www.npmjs.com/package/localberth) is installed, this site stays on **5184** as `finetuna-site`.

Optional: edit `theme.css` next to `filepress.config.ts`.

## Deploy (Cloudflare Pages)

**Use one pipeline only.** Dual deploys overwrite each other when asset hashes disagree.

```bash
pnpm ship
# = pnpm build && wrangler pages deploy build --project-name=finetuna
```

Then attach **finetuna.net** in the Cloudflare dashboard.

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

Site: home, Install, posts. Root README: flags, env, outputs. Same product line and “not weight fine-tuning” contrast in both. When behavior changes, update the README and `site/pages/*`.

## Launch checklist

- [ ] `pnpm ship` (or git-connected Pages) and confirm `https://finetuna.net`
- [ ] Attach the custom domain in Cloudflare Pages
- [ ] Confirm `og:image` / Twitter card in a debugger
