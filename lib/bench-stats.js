/**
 * Bench aggregation + significance helpers (Finetuna 1.1 / ollanet-aligned).
 * Pure functions — safe to unit-test without a GPU or Ollama.
 *
 * Kept in-tree (not a separate npm package). Mirror semantics/tests in ollanet
 * until a scoped shared package is worthwhile.
 */

/** Minimum relative win over incumbent (5%), even when measured spread is tiny. */
export const MIN_WIN_PCT = 0.05;

/** @param {number[]} rates */
export function median(rates) {
  if (!rates?.length) return 0;
  const s = [...rates].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param {number[]} rates
 * @returns {{
 *   ok: boolean,
 *   median: number,
 *   mean: number,
 *   min: number,
 *   max: number,
 *   spread: number,
 *   spreadPct: number,
 *   n: number,
 *   samples: number[],
 * }}
 */
export function summarizeRates(rates) {
  const samples = (rates || []).filter((r) => Number.isFinite(r) && r > 0);
  if (!samples.length) {
    return {
      ok: false,
      median: 0,
      mean: 0,
      min: 0,
      max: 0,
      spread: 0,
      spreadPct: 0,
      n: 0,
      samples: [],
    };
  }
  const med = median(samples);
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const spread = samples.length >= 2 ? max - min : 0;
  const spreadPct = med > 0 && samples.length >= 2 ? spread / med : 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    ok: true,
    median: med,
    mean,
    min,
    max,
    spread,
    spreadPct,
    n: samples.length,
    samples: [...samples],
  };
}

/**
 * Challenger beats incumbent when relative gain exceeds noise floor.
 * Challenger needs ≥2 valid runs. Incumbent with n<2 uses MIN_WIN_PCT as its spread stand-in.
 *
 * @param {{ ok?: boolean, median: number, spreadPct: number, n: number }} challenger
 * @param {{ ok?: boolean, median: number, spreadPct: number, n: number }} incumbent
 */
export function isSignificantWin(challenger, incumbent) {
  if (!challenger?.ok || !incumbent?.ok) return false;
  if (challenger.n < 2) return false;
  if (!(incumbent.median > 0)) return challenger.median > 0;
  const relGain = (challenger.median - incumbent.median) / incumbent.median;
  const incSpread = incumbent.n >= 2 ? incumbent.spreadPct : MIN_WIN_PCT;
  const threshold = Math.max(incSpread, challenger.spreadPct || 0, MIN_WIN_PCT);
  return relGain > threshold;
}

/**
 * @param {number} incumbentCand
 * @param {Array<{ cand: number, gpu?: boolean, ok?: boolean, median?: number, spreadPct?: number, n?: number }>} results
 * @param {{ preferSmallerOnTie?: boolean }} [opts]
 */
export function pickSignificantWinner(incumbentCand, results, { preferSmallerOnTie = false } = {}) {
  const valid = (results || []).filter((r) => r.gpu && r.ok && r.n > 0);
  const incumbentRow = (results || []).find((r) => r.cand === incumbentCand);
  const incumbent = incumbentRow?.ok ? incumbentRow : null;

  if (!valid.length) {
    return {
      winner: incumbentCand,
      switched: false,
      reason: 'no-valid',
      entry: incumbentRow || null,
    };
  }

  if (!incumbent) {
    const sorted = [...valid].sort((a, b) => b.median - a.median || a.cand - b.cand);
    let best = sorted[0];
    if (preferSmallerOnTie) {
      const near = sorted.filter((r) => !isSignificantWin(best, r) && !isSignificantWin(r, best));
      near.sort((a, b) => a.cand - b.cand);
      best = near[0] || best;
    }
    return { winner: best.cand, switched: best.cand !== incumbentCand, reason: 'incumbent-failed', entry: best };
  }

  const beaters = valid.filter((r) => r.cand !== incumbentCand && isSignificantWin(r, incumbent));
  if (!beaters.length) {
    return { winner: incumbentCand, switched: false, reason: 'no-significant', entry: incumbent };
  }

  beaters.sort((a, b) => b.median - a.median || a.cand - b.cand);
  let best = beaters[0];
  if (preferSmallerOnTie) {
    const near = beaters.filter((r) => !isSignificantWin(best, r));
    near.sort((a, b) => a.cand - b.cand);
    best = near[0] || best;
  }
  return { winner: best.cand, switched: true, reason: 'significant', entry: best };
}

/**
 * Largest fitting ok candidate that is not significantly slower than the best median.
 * @param {Array<{ cand: number, gpu?: boolean, ok?: boolean, median?: number, spreadPct?: number, n?: number }>} results
 */
export function pickMaxContext(results) {
  const valid = (results || []).filter((r) => r.gpu && r.ok && r.n > 0);
  if (!valid.length) return null;
  const best = valid.reduce((a, b) => (b.median > a.median ? b : a));
  const eligible = valid.filter((r) => !isSignificantWin(best, r));
  return eligible.reduce((a, b) => (b.cand > a.cand ? b : a));
}

/** Human-readable spread for tables, e.g. "±6%". */
export function formatSpreadPct(spreadPct) {
  if (!Number.isFinite(spreadPct) || spreadPct <= 0) return '—';
  return `±${Math.round(spreadPct * 100)}%`;
}

/**
 * One-line message when keeping the incumbent.
 * @param {number} incumbentCand
 * @param {{ median: number, spreadPct: number }} incumbent
 * @param {{ cand: number, median: number, spreadPct: number } | null} [topChallenger]
 */
export function formatNoSignificantMessage(incumbentCand, incumbent, topChallenger = null) {
  const incPct = formatSpreadPct(incumbent.spreadPct);
  if (topChallenger) {
    return (
      `── no significant difference (${topChallenger.cand}: ${topChallenger.median.toFixed(1)} t/s, ` +
      `${incumbentCand}: ${incumbent.median.toFixed(1)} t/s, spread ${incPct}) — keeping ${incumbentCand}`
    );
  }
  return (
    `── no significant difference — keeping ${incumbentCand} ` +
    `(${incumbent.median.toFixed(1)} t/s, spread ${incPct})`
  );
}
