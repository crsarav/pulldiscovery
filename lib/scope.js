export function partitionFacts(facts, domain) {
  const allowed = [];
  const held = [];
  for (const fact of facts || []) {
    if (fact.withheld) continue;
    const scopes = fact.scopes?.length ? fact.scopes : [fact.domain];
    if (scopes.includes(domain)) allowed.push(fact);
    else held.push(fact);
  }
  return { allowed, held };
}

export function makeTransferEntries(heldFacts, domain, query) {
  return heldFacts.map((fact) => ({
    id: `${fact.id}:${domain}:${Date.now()}`,
    factId: fact.id,
    text: fact.text,
    fromDomain: fact.domain,
    toDomain: domain,
    query,
    status: "held",
    createdAt: new Date().toISOString(),
    reason: `Fact is scoped to ${(fact.scopes || [fact.domain]).join(", ")} and was not auto-sent into ${domain}.`,
  }));
}

export function applyTransferDecision(facts, entry, decision) {
  return facts.map((fact) => {
    if (fact.id !== entry.factId) return fact;
    if (decision === "approve") {
      const scopes = new Set(fact.scopes || [fact.domain]);
      scopes.add(entry.toDomain);
      return { ...fact, scopes: [...scopes] };
    }
    if (decision === "withhold") {
      return { ...fact, withheld: true };
    }
    return fact;
  });
}
