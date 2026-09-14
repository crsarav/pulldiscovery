export function decomposePrompt({ query, domain, facts, constraints }) {
  const factBlock =
    facts.length === 0
      ? "(no in-scope world-model facts)"
      : facts
          .map(
            (f, i) =>
              `- [${i}] (${f.domain}, scopes=${(f.scopes || []).join("|")}, confidence=${f.confidence}) ${f.text}`
          )
          .join("\n");

  const constraintBlock =
    constraints?.length > 0
      ? constraints.map((c, i) => `${i}. ${c}`).join("\n")
      : "(none supplied — extract them from the query and in-scope facts)";

  return `You are the decompose stage of Pull Discovery.
A persuasive answer is not a verified result. Your only job is to turn a user need into an auditable retrieval plan.

Query: ${query}
Active domain: ${domain}

In-scope world-model facts (already passed the domain boundary):
${factBlock}

Known constraints:
${constraintBlock}

Return ONLY JSON:
{
  "intent": "one sentence",
  "constraints": ["atomic constraint", "..."],
  "searchQueries": ["web search query 1", "web search query 2"],
  "mustVerify": ["what a destination URL must prove"]
}`;
}

export function retrievePrompt({ query, domain, decomposition, facts }) {
  const factBlock =
    facts.length === 0
      ? "(none)"
      : facts.map((f, i) => `- [${i}] ${f.text}`).join("\n");

  const constraints = (decomposition?.constraints || []).map(
    (c, i) => `${i}. ${c}`
  );

  return `You are the retrieve stage of Pull Discovery.
Search the live web, then name destinations. Do not invent URLs. Prefer official product, clinic, school, or company pages over roundups.

User query: ${query}
Domain: ${domain}

World-model facts in scope:
${factBlock}

Decomposition:
${JSON.stringify(decomposition || {}, null, 2)}

Numbered constraints (the "why" field MUST cite these indices):
${constraints.join("\n") || "(derive from the query)"}

After searching, respond with ONLY JSON (no markdown):
{
  "destinations": [
    {
      "name": "short entity name",
      "url": "https://fully-qualified-url",
      "why": "satisfies [0, 2]",
      "constraintIndices": [0, 2],
      "note": "one sentence of evidence from the page or snippet"
    }
  ]
}

Rules:
- Every destination needs a real http(s) URL.
- "why" must map to constraint indices like "satisfies [0, 1]".
- 3 to 6 destinations.
- If search did not support a URL, omit it. Never pad with guesses.`;
}
