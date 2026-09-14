import { runDemo } from "@/lib/demo";
import { runModelRouter, liveModelAvailable } from "@/lib/providers";
import { attachTiers, sanitizeDestinations } from "@/lib/verification";

export const dynamic = "force-dynamic";

const FAIL_MESSAGE = "Discovery intentionally aborted by user.";

function clientFacts(facts) {
  return (facts || []).map((f) => ({
    text: f.text,
    domain: f.domain,
    scopes: f.scopes,
    confidence: f.confidence,
    source: f.source,
  }));
}

export async function POST(request) {
  const started = Date.now();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = String(body.query || "").trim();
  const domain = String(body.domain || "ecommerce");
  const model = body.model === "google" ? "google" : "anthropic";
  const forceFail = Boolean(body.forceFail);
  const facts = clientFacts(body.facts);
  const constraints = Array.isArray(body.constraints) ? body.constraints : [];

  if (forceFail) {
    return Response.json({
      results: [],
      harvestedUrls: [],
      message: FAIL_MESSAGE,
      model,
      provider: "aborted",
      forceFail: true,
      usedDemo: false,
      latencyMs: Date.now() - started,
      constraints: [],
      decomposition: null,
    });
  }

  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const useLive = liveModelAvailable(model);
    const raw = useLive
      ? await runModelRouter({ query, domain, facts, constraints, model })
      : runDemo({ query, domain, facts, constraints });

    const destinations = sanitizeDestinations(raw.parsed);
    const results = attachTiers(destinations, raw.harvestedUrls || []);
    const constraintsOut =
      raw.parsed?.constraints || raw.decomposition?.constraints || [];

    return Response.json({
      results,
      harvestedUrls: raw.harvestedUrls || [],
      message: useLive
        ? null
        : "Live model keys were not configured. Server returned verification fixtures so the trust boundary is still visible.",
      model: raw.model,
      provider: raw.provider,
      forceFail: false,
      usedDemo: !useLive,
      latencyMs: Date.now() - started,
      constraints: constraintsOut,
      decomposition: {
        intent: raw.decomposition?.intent || null,
        constraintCount: constraintsOut.length,
        searchQueries: raw.decomposition?.searchQueries || [],
      },
    });
  } catch (error) {
    const fallback = runDemo({ query, domain, facts, constraints });
    const destinations = sanitizeDestinations(fallback.parsed);
    const results = attachTiers(destinations, fallback.harvestedUrls || []);
    return Response.json({
      results,
      harvestedUrls: fallback.harvestedUrls || [],
      message: `Model call failed (${error.message}). Falling back to verification fixtures.`,
      model: fallback.model,
      provider: "demo",
      forceFail: false,
      usedDemo: true,
      latencyMs: Date.now() - started,
      constraints: fallback.parsed.constraints,
      decomposition: {
        intent: fallback.decomposition.intent,
        constraintCount: fallback.parsed.constraints.length,
        searchQueries: fallback.decomposition.searchQueries,
      },
    });
  }
}
