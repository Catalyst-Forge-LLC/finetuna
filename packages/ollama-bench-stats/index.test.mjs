import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_WIN_PCT,
  median,
  summarizeRates,
  isSignificantWin,
  pickSignificantWinner,
  pickMaxContext,
  formatNoSignificantMessage,
} from './index.js';

describe('median / summarizeRates', () => {
  it('computes median for odd and even lengths', () => {
    assert.equal(median([1, 3, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it('marks empty / non-positive rates as !ok (never a zero crown)', () => {
    const empty = summarizeRates([]);
    assert.equal(empty.ok, false);
    assert.equal(empty.n, 0);
    assert.deepEqual(empty.samples, []);

    const zeros = summarizeRates([0, -1, NaN]);
    assert.equal(zeros.ok, false);
  });

  it('keeps samples[] and spreadPct for recomputation', () => {
    const s = summarizeRates([40, 42, 44]);
    assert.equal(s.ok, true);
    assert.equal(s.median, 42);
    assert.equal(s.min, 40);
    assert.equal(s.max, 44);
    assert.equal(s.spread, 4);
    assert.ok(Math.abs(s.spreadPct - 4 / 42) < 1e-9);
    assert.deepEqual(s.samples, [40, 42, 44]);
  });
});

describe('isSignificantWin / challenger rule', () => {
  it('rejects a 2% win when spread is 6% (keep incumbent)', () => {
    const incumbent = summarizeRates([100, 100, 100]); // spreadPct 0 → floor MIN_WIN_PCT
    // Force a high observed spread on incumbent
    incumbent.spreadPct = 0.06;
    const challenger = summarizeRates([102, 102, 102]);
    challenger.spreadPct = 0.01;
    assert.equal(isSignificantWin(challenger, incumbent), false);
    assert.ok(MIN_WIN_PCT === 0.05);
  });

  it('accepts a clear win above noise and MIN_WIN_PCT', () => {
    const incumbent = summarizeRates([100, 101, 99]); // ~2% spread
    const challenger = summarizeRates([120, 118, 122]); // ~20% faster
    assert.equal(isSignificantWin(challenger, incumbent), true);
  });

  it('requires challenger n>=2', () => {
    const incumbent = summarizeRates([100, 100, 100]);
    const challenger = summarizeRates([130]);
    assert.equal(isSignificantWin(challenger, incumbent), false);
  });
});

describe('pickSignificantWinner', () => {
  it('keeps incumbent when challenger gain is inside the noise floor', () => {
    const results = [
      { cand: 512, gpu: true, ...summarizeRates([100, 100, 100]) },
      { cand: 1024, gpu: true, ...summarizeRates([102, 102, 102]) },
    ];
    results[0].spreadPct = 0.06;
    results[1].spreadPct = 0.02;
    const pick = pickSignificantWinner(512, results, { preferSmallerOnTie: true });
    assert.equal(pick.winner, 512);
    assert.equal(pick.switched, false);
    assert.equal(pick.reason, 'no-significant');
    assert.match(formatNoSignificantMessage(512, results[0], results[1]), /keeping 512/);
  });

  it('switches on a significant win', () => {
    const results = [
      { cand: 512, gpu: true, ...summarizeRates([100, 100, 100]) },
      { cand: 1024, gpu: true, ...summarizeRates([120, 118, 122]) },
    ];
    const pick = pickSignificantWinner(512, results, { preferSmallerOnTie: true });
    assert.equal(pick.winner, 1024);
    assert.equal(pick.switched, true);
  });

  it('excludes failed candidates (never treats as 0 t/s winner)', () => {
    const results = [
      { cand: 512, gpu: true, ...summarizeRates([50, 52, 51]) },
      { cand: 1024, gpu: true, ...summarizeRates([]) }, // failed
      { cand: 256, gpu: false, ...summarizeRates([200, 200, 200]) }, // gpu miss
    ];
    const pick = pickSignificantWinner(512, results);
    assert.equal(pick.winner, 512);
    assert.equal(results[1].ok, false);
  });

  it('picks a valid challenger when incumbent failed', () => {
    const results = [
      { cand: 512, gpu: true, ...summarizeRates([]) },
      { cand: 1024, gpu: true, ...summarizeRates([80, 82, 81]) },
    ];
    const pick = pickSignificantWinner(512, results);
    assert.equal(pick.winner, 1024);
    assert.equal(pick.reason, 'incumbent-failed');
  });

  it('prefers smaller batch among near-tied significant beaters', () => {
    const results = [
      { cand: 512, gpu: true, ...summarizeRates([100, 100, 100]) },
      { cand: 768, gpu: true, ...summarizeRates([120, 120, 120]) },
      { cand: 1024, gpu: true, ...summarizeRates([121, 121, 121]) },
    ];
    const pick = pickSignificantWinner(512, results, { preferSmallerOnTie: true });
    assert.equal(pick.winner, 768);
  });
});

describe('pickMaxContext (D8)', () => {
  it('picks largest ctx that is not significantly slower than best median', () => {
    const results = [
      { cand: 8192, gpu: true, ...summarizeRates([100, 100, 100]) },
      { cand: 16384, gpu: true, ...summarizeRates([98, 99, 97]) }, // within noise of best
      { cand: 32768, gpu: true, ...summarizeRates([70, 72, 71]) }, // significantly slower
      { cand: 65536, gpu: false, ...summarizeRates([]) },
    ];
    const pick = pickMaxContext(results);
    assert.ok(pick);
    assert.equal(pick.cand, 16384);
  });

  it('does not pick failed or non-gpu rows', () => {
    const results = [
      { cand: 8192, gpu: true, ...summarizeRates([90, 91, 89]) },
      { cand: 16384, gpu: true, ...summarizeRates([]) },
      { cand: 32768, gpu: false, ...summarizeRates([100, 100, 100]) },
    ];
    const pick = pickMaxContext(results);
    assert.equal(pick.cand, 8192);
  });
});
