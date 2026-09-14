export function safeUrl(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function hostOf(value) {
  const url = safeUrl(value);
  if (!url) return "";
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

export function pathnameOf(value) {
  const url = safeUrl(value);
  if (!url) return "";
  return (url.pathname.replace(/\/+$/, "") || "/") + url.search;
}

export function normalizeUrl(value) {
  const url = safeUrl(value);
  if (!url) return "";
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.protocol}//${url.hostname.toLowerCase()}${path}${url.search}`;
}

export function entityKey(value) {
  const url = safeUrl(value);
  if (!url) return String(value || "").toLowerCase();
  return `${hostOf(value)}${url.pathname.replace(/\/+$/, "") || "/"}`;
}

export function verifyTier(generatedUrl, harvestedUrls) {
  const generated = safeUrl(generatedUrl);
  if (!generated) return { tier: "none", matchedUrl: null };

  const normalizedHarvest = harvestedUrls
    .map((u) => ({ raw: u, norm: normalizeUrl(u), host: hostOf(u) }))
    .filter((u) => u.norm);

  const exact = normalizedHarvest.find(
    (u) => u.norm === normalizeUrl(generatedUrl)
  );
  if (exact) return { tier: "exact", matchedUrl: exact.raw };

  const host = hostOf(generatedUrl);
  const hostMatch = normalizedHarvest.find((u) => u.host && u.host === host);
  if (hostMatch) return { tier: "host", matchedUrl: hostMatch.raw };

  return { tier: "none", matchedUrl: null };
}

export function extractJson(text) {
  if (!text || typeof text !== "string") return null;
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function sanitizeDestinations(parsed) {
  const list = Array.isArray(parsed?.destinations)
    ? parsed.destinations
    : Array.isArray(parsed?.results)
      ? parsed.results
      : [];

  return list
    .map((item, index) => {
      const url = String(item?.url || item?.href || "").trim();
      const parsedUrl = safeUrl(url);
      if (!parsedUrl) return null;
      const constraintIndices = Array.isArray(item.constraintIndices)
        ? item.constraintIndices.filter((n) => Number.isInteger(n))
        : [];
      const why =
        item.why ||
        (constraintIndices.length
          ? `satisfies [${constraintIndices.join(", ")}]`
          : "no constraint mapping provided");
      return {
        id: `${hostOf(url)}-${index}`,
        name: String(item.name || item.title || parsedUrl.hostname),
        url: parsedUrl.toString(),
        why,
        constraintIndices,
        note: String(item.note || item.evidence || ""),
      };
    })
    .filter(Boolean);
}

export function attachTiers(destinations, harvestedUrls) {
  return destinations.map((dest) => {
    const { tier, matchedUrl } = verifyTier(dest.url, harvestedUrls);
    return {
      ...dest,
      tier,
      matchedUrl,
      host: hostOf(dest.url),
      pathname: pathnameOf(dest.url),
    };
  });
}

export function rankByTier(results) {
  const order = { exact: 0, host: 1, none: 2 };
  return [...results].sort((a, b) => {
    const tierDelta = (order[a.tier] ?? 9) - (order[b.tier] ?? 9);
    if (tierDelta !== 0) return tierDelta;
    return (b.corroboration || 1) - (a.corroboration || 1);
  });
}

export function resolvableRate(results) {
  if (!results.length) return 0;
  const exact = results.filter((r) => r.tier === "exact").length;
  return Math.round((exact / results.length) * 1000) / 10;
}
