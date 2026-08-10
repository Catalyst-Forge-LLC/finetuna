/**
 * Ollama model capability helpers (/api/tags or /api/show).
 */

/**
 * Embedding-only models cannot generate — skip in the picker.
 * @param {{ capabilities?: string[] } | null | undefined} meta
 */
export function isEmbeddingOnly(meta) {
  const caps = meta?.capabilities;
  if (!Array.isArray(caps) || !caps.length) return false;
  return caps.includes('embedding') && !caps.includes('completion');
}

/** @param {{ capabilities?: string[] } | null | undefined} meta */
export function modelSupportsThinking(meta) {
  return Boolean(meta?.capabilities?.includes('thinking'));
}

/** @param {{ capabilities?: string[] } | null | undefined} meta */
export function modelSupportsVision(meta) {
  return Boolean(meta?.capabilities?.includes('vision'));
}

/**
 * Filter out embedding-only names when metadata is available.
 * @param {string[]} names
 * @param {Map<string, object>} tagsByName
 * @returns {{ kept: string[], skipped: string[] }}
 */
export function filterGenerativeModels(names, tagsByName) {
  const kept = [];
  const skipped = [];
  for (const name of names || []) {
    const meta = tagsByName?.get(name) || tagsByName?.get(String(name).replace(/:latest$/, '')) || null;
    if (isEmbeddingOnly(meta)) skipped.push(name);
    else kept.push(name);
  }
  return { kept, skipped };
}
