import { entityKey, rankByTier } from "./verification";

const TIER_RANK = { exact: 0, host: 1, none: 2 };

export function mergeEntities(results) {
  const map = new Map();
  for (const result of results || []) {
    const key = entityKey(result.url);
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...result, corroboration: 1 });
      continue;
    }
    current.corroboration += 1;
    if ((TIER_RANK[result.tier] ?? 9) < (TIER_RANK[current.tier] ?? 9)) {
      current.tier = result.tier;
      current.matchedUrl = result.matchedUrl;
    }
    const extraWhy = result.why && result.why !== current.why;
    if (extraWhy) current.why = `${current.why}; ${result.why}`;
    if (result.note && !current.note) current.note = result.note;
    const extraConstraints = result.constraintIndices || [];
    current.constraintIndices = [
      ...new Set([...(current.constraintIndices || []), ...extraConstraints]),
    ];
  }
  return rankByTier([...map.values()]);
}

export function formatWhy(result, constraints) {
  const indices = result.constraintIndices || [];
  const mapped = indices
    .map((i) => constraints?.[i])
    .filter(Boolean)
    .map((text) => `"${text}"`);
  if (mapped.length) {
    return `Satisfies ${mapped.join(", ")}.`;
  }
  return result.why || "No constraint mapping returned.";
}
