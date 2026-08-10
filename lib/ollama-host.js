/**
 * Ollama host affinity + /api/ps GPU-fit helpers (Finetuna 1.1).
 * Pure / sync — unit-testable without a live server.
 */

/** Discrete GPUs: require nearly full VRAM residency (int rounding). */
export const FIT_RATIO_DISCRETE = 0.99;

/** Apple Silicon / unified: match prior “≥50% GPU” spirit when only sizes are available. */
export const FIT_RATIO_UNIFIED = 0.5;

/**
 * True when OLLAMA_BASE points at this machine (loopback).
 * @param {string} baseUrl
 */
export function isLocalOllamaBase(baseUrl) {
  try {
    const u = new URL(String(baseUrl || '').trim() || 'http://127.0.0.1:11434');
    const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch {
    return true;
  }
}

/** Short host label for messages (hostname or host:port). */
export function ollamaHostLabel(baseUrl) {
  try {
    const u = new URL(String(baseUrl || '').trim() || 'http://127.0.0.1:11434');
    if (u.port && u.port !== '11434' && u.port !== '80' && u.port !== '443') {
      return `${u.hostname}:${u.port}`;
    }
    return u.hostname || String(baseUrl);
  } catch {
    return String(baseUrl || 'unknown');
  }
}

/**
 * Normalize a /api/ps models[] entry.
 * @param {object} m
 */
export function normalizePsModel(m) {
  if (!m || typeof m !== 'object') return null;
  const name = m.name || m.model || '';
  if (!name) return null;
  const size = Number(m.size);
  const sizeVram = Number(m.size_vram);
  return {
    name: String(name),
    size: Number.isFinite(size) ? size : null,
    sizeVram: Number.isFinite(sizeVram) ? sizeVram : null,
    details: m.details || null,
    raw: m,
  };
}

/** @param {object} data GET /api/ps JSON body */
export function parsePsModels(data) {
  return (data?.models || []).map(normalizePsModel).filter(Boolean);
}

/**
 * Find a loaded model row by name (accepts optional :latest).
 * @param {Array<{ name: string }>} models
 * @param {string} modelName
 */
export function findPsModel(models, modelName) {
  const want = String(modelName || '');
  const wantLatest = want.endsWith(':latest') ? want : `${want}:latest`;
  const bare = want.replace(/:latest$/, '');
  return (
    (models || []).find((m) => {
      const n = m.name || '';
      return n === want || n === wantLatest || n === bare || n === `${bare}:latest`;
    }) || null
  );
}

/**
 * GPU-fit from /api/ps size / size_vram.
 * @param {{ size: number|null, sizeVram: number|null }} model
 * @param {{ unified?: boolean }} [opts]
 * @returns {{ ok: boolean, ratio: number|null, reason: string }}
 */
export function gpuFitFromPsModel(model, { unified = false } = {}) {
  if (!model) return { ok: false, ratio: null, reason: 'missing' };
  const size = model.size;
  const sizeVram = model.sizeVram;
  if (!(size > 0) || sizeVram == null || !Number.isFinite(sizeVram)) {
    // Loaded but sizes unavailable — do not hard-fail (mirror old "unknown processor" leniency).
    return { ok: true, ratio: null, reason: 'unknown-size' };
  }
  if (sizeVram <= 0) {
    return { ok: false, ratio: 0, reason: 'cpu-only' };
  }
  const ratio = sizeVram / size;
  const min = unified ? FIT_RATIO_UNIFIED : FIT_RATIO_DISCRETE;
  if (ratio >= min) {
    return { ok: true, ratio, reason: ratio >= FIT_RATIO_DISCRETE ? 'full' : 'unified-ok' };
  }
  return { ok: false, ratio, reason: 'partial' };
}
