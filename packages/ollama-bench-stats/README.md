# ollama-bench-stats

Tiny zero-dependency helpers for **median + spread** Ollama benchmark selection.

Shared contract for **Finetuna** (tuner) and **[ollanet](https://github.com/Catalyst-Forge-LLC/ollanet)** (verifier) so they cannot drift:

- Score candidates by **median** rate (not mean)
- `spreadPct = (max − min) / median`
- Switch only on a **significant** relative win:  
  `relGain > max(incumbent.spreadPct, challenger.spreadPct, MIN_WIN_PCT)` with `MIN_WIN_PCT = 0.05`
- Otherwise report **no significant difference** and keep the incumbent
- Failed candidates are excluded (`ok: false`), never scored as `0`

## Install

```bash
npm install ollama-bench-stats
```

## API

```js
import {
  MIN_WIN_PCT,
  median,
  summarizeRates,
  isSignificantWin,
  pickSignificantWinner,
  pickMaxContext,
  formatSpreadPct,
  formatNoSignificantMessage,
} from 'ollama-bench-stats';

const a = summarizeRates([100, 100, 100]);
const b = summarizeRates([102, 102, 102]);
isSignificantWin(b, { ...a, spreadPct: 0.06 }); // false — inside noise
```

## Publish (maintainer)

From this directory (after tests):

```bash
pnpm test
npm publish --access public
```

Then point Finetuna / ollanet at the registry version instead of the workspace `workspace:*` dep.

## License

MIT
