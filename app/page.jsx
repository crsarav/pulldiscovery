"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BUILTIN_PROFILES, builtinById, DOMAINS, EVAL_QUERIES } from "@/lib/profiles";
import { applyTransferDecision, makeTransferEntries, partitionFacts } from "@/lib/scope";
import { formatWhy, mergeEntities } from "@/lib/retrieve";
import { resolvableRate } from "@/lib/verification";
import {
  CARE_QUERY,
  SHOE_QUERY,
  SOURCE_COPY,
  THESIS_BEATS,
  TIER_COPY,
} from "@/lib/thesis";

const STORAGE_KEY = "pull-discovery:v4";
const SAMPLE_QUERIES = EVAL_QUERIES;

const emptyMeta = {
  message: "",
  usedDemo: false,
  latencyMs: 0,
  harvestedUrls: [],
  constraints: [],
  provider: "",
  model: "",
  forceFail: false,
};

function customFactsByProfile(facts) {
  const map = {};
  for (const fact of facts) {
    if (!fact.custom) continue;
    const id = fact.profileId || "me";
    map[id] = [...(map[id] || []), fact];
  }
  return map;
}

function assembleFacts(profileId, extras, overrides, deleted) {
  const builtin = builtinById(profileId);
  const deletedSet = new Set(deleted[profileId] || []);
  const overrideMap = overrides[profileId] || {};
  const seed = builtin
    ? builtin
        .factory()
        .filter((f) => !deletedSet.has(f.id))
        .map((f) => ({
          ...f,
          seed: true,
          custom: false,
          profileId,
          ...(overrideMap[f.id] || {}),
        }))
    : [];
  return [...seed, ...(extras[profileId] || [])];
}

function deriveStoresFromFacts(profileId, list) {
  const builtin = builtinById(profileId);
  const factory = builtin?.factory() || [];
  const seedIds = new Set(factory.map((f) => f.id));
  const extras = list.filter((f) => f.custom || !seedIds.has(f.id));
  const present = new Set(
    list.filter((f) => seedIds.has(f.id)).map((f) => f.id)
  );
  const deleted = [...seedIds].filter((id) => !present.has(id));
  const origById = Object.fromEntries(factory.map((f) => [f.id, f]));
  const overrides = {};
  for (const f of list) {
    if (!seedIds.has(f.id)) continue;
    const orig = origById[f.id];
    if (!orig) continue;
    const patch = {};
    for (const key of [
      "text",
      "domain",
      "confidence",
      "scopes",
      "withheld",
      "source",
    ]) {
      if (JSON.stringify(f[key]) !== JSON.stringify(orig[key])) {
        patch[key] = f[key];
      }
    }
    if (Object.keys(patch).length) overrides[f.id] = patch;
  }
  return { extras, deleted, overrides };
}

export default function Page() {
  const [tab, setTab] = useState("discover");
  const [facts, setFacts] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [query, setQuery] = useState(SAMPLE_QUERIES[0].query);
  const [domain, setDomain] = useState("ecommerce");
  const [model, setModel] = useState("anthropic");
  const [forceFail, setForceFail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [pullContext, setPullContext] = useState(null);
  const [meta, setMeta] = useState(emptyMeta);
  const [evalRuns, setEvalRuns] = useState([]);
  const [evalRunning, setEvalRunning] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [beat, setBeat] = useState(1);
  const [customProfiles, setCustomProfiles] = useState([]);
  const [extrasByProfile, setExtrasByProfile] = useState({});
  const [seedOverridesByProfile, setSeedOverridesByProfile] = useState({});
  const [deletedSeedIdsByProfile, setDeletedSeedIdsByProfile] = useState({});
  const [factsByProfile, setFactsByProfile] = useState({});
  const extrasRef = useRef(extrasByProfile);
  const overridesRef = useRef(seedOverridesByProfile);
  const deletedRef = useRef(deletedSeedIdsByProfile);
  const factsByProfileRef = useRef(factsByProfile);
  const factsRef = useRef(facts);
  const activeProfileRef = useRef(activeProfile);
  const transfersRef = useRef(transfers);
  const customProfilesRef = useRef(customProfiles);
  const hydratedRef = useRef(false);
  extrasRef.current = extrasByProfile;
  overridesRef.current = seedOverridesByProfile;
  deletedRef.current = deletedSeedIdsByProfile;
  factsByProfileRef.current = factsByProfile;
  factsRef.current = facts;
  activeProfileRef.current = activeProfile;
  transfersRef.current = transfers;
  customProfilesRef.current = customProfiles;

  function persistNow() {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          facts: factsRef.current,
          transfers: transfersRef.current,
          activeProfile: activeProfileRef.current,
          customProfiles: customProfilesRef.current,
          extrasByProfile: extrasRef.current,
          seedOverridesByProfile: overridesRef.current,
          deletedSeedIdsByProfile: deletedRef.current,
          factsByProfile: factsByProfileRef.current,
        })
      );
    } catch {
      /* ignore quota */
    }
  }

  function replaceTransfers(next) {
    const value =
      typeof next === "function" ? next(transfersRef.current) : next;
    transfersRef.current = value;
    setTransfers(value);
    persistNow();
  }

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem("pull-discovery:v3") ||
        localStorage.getItem("pull-discovery:v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        const extras =
          parsed.extrasByProfile ||
          customFactsByProfile(parsed.facts || []);
        const overrides = parsed.seedOverridesByProfile || {};
        const deleted = parsed.deletedSeedIdsByProfile || {};
        const profiles = parsed.customProfiles || [];
        const byProfile = { ...(parsed.factsByProfile || {}) };
        if (
          parsed.activeProfile &&
          Array.isArray(parsed.facts) &&
          parsed.facts.length &&
          !byProfile[parsed.activeProfile]
        ) {
          byProfile[parsed.activeProfile] = parsed.facts;
        }
        const ids = new Set([
          ...Object.keys(byProfile),
          ...Object.keys(extras),
          ...["me", "pradeepa", "son"],
          ...profiles.map((p) => p.id),
        ]);
        if (parsed.activeProfile) ids.add(parsed.activeProfile);
        for (const id of ids) {
          if (!byProfile[id]) {
            byProfile[id] = assembleFacts(id, extras, overrides, deleted);
          }
        }
        setCustomProfiles(profiles);
        setExtrasByProfile(extras);
        setSeedOverridesByProfile(overrides);
        setDeletedSeedIdsByProfile(deleted);
        setFactsByProfile(byProfile);
        factsByProfileRef.current = byProfile;
        extrasRef.current = extras;
        overridesRef.current = overrides;
        deletedRef.current = deleted;
        const active = parsed.activeProfile || null;
        setActiveProfile(active);
        activeProfileRef.current = active;
        const nextFacts = active
          ? byProfile[active] || parsed.facts || []
          : parsed.facts || [];
        setFacts(nextFacts);
        factsRef.current = nextFacts;
        setTransfers(parsed.transfers || []);
        transfersRef.current = parsed.transfers || [];
      }
    } catch {
      /* ignore */
    }
    hydratedRef.current = true;
  }, []);

  function writeProfileSnapshot(profileId, list) {
    if (!profileId) return;
    const derived = deriveStoresFromFacts(profileId, list);
    factsByProfileRef.current = {
      ...factsByProfileRef.current,
      [profileId]: list,
    };
    extrasRef.current = {
      ...extrasRef.current,
      [profileId]: derived.extras,
    };
    deletedRef.current = {
      ...deletedRef.current,
      [profileId]: derived.deleted,
    };
    overridesRef.current = {
      ...overridesRef.current,
      [profileId]: derived.overrides,
    };
    setFactsByProfile({ ...factsByProfileRef.current });
    setExtrasByProfile({ ...extrasRef.current });
    setDeletedSeedIdsByProfile({ ...deletedRef.current });
    setSeedOverridesByProfile({ ...overridesRef.current });
    persistNow();
  }

  function loadProfile(id) {
    const previous = activeProfileRef.current;
    if (previous && previous !== id) {
      writeProfileSnapshot(previous, factsRef.current);
    }
    activeProfileRef.current = id;
    setActiveProfile(id);
    replaceTransfers([]);
    const cached = factsByProfileRef.current[id];
    const next = Array.isArray(cached)
      ? cached
      : assembleFacts(
          id,
          extrasRef.current,
          overridesRef.current,
          deletedRef.current
        );
    factsRef.current = next;
    factsByProfileRef.current = {
      ...factsByProfileRef.current,
      [id]: next,
    };
    setFactsByProfile({ ...factsByProfileRef.current });
    setFacts(next);
    persistNow();
  }

  function createProfile(label) {
    const name = (label || "").trim() || "Untitled";
    const id = `p-${crypto.randomUUID()}`;
    const nextProfiles = [
      ...customProfilesRef.current,
      { id, label: name },
    ];
    customProfilesRef.current = nextProfiles;
    setCustomProfiles(nextProfiles);
    factsByProfileRef.current = {
      ...factsByProfileRef.current,
      [id]: [],
    };
    extrasRef.current = { ...extrasRef.current, [id]: [] };
    setFactsByProfile({ ...factsByProfileRef.current });
    setExtrasByProfile({ ...extrasRef.current });
    loadProfile(id);
    return id;
  }

  function renameProfile(id, label) {
    const name = (label || "").trim();
    if (!name) return;
    customProfilesRef.current = customProfilesRef.current.map((p) =>
      p.id === id ? { ...p, label: name } : p
    );
    setCustomProfiles(customProfilesRef.current);
    persistNow();
  }

  function deleteProfile(id) {
    if (builtinById(id)) return;
    customProfilesRef.current = customProfilesRef.current.filter(
      (p) => p.id !== id
    );
    setCustomProfiles(customProfilesRef.current);
    const nextFactsByProfile = { ...factsByProfileRef.current };
    delete nextFactsByProfile[id];
    factsByProfileRef.current = nextFactsByProfile;
    setFactsByProfile(nextFactsByProfile);
    const nextExtras = { ...extrasRef.current };
    delete nextExtras[id];
    extrasRef.current = nextExtras;
    setExtrasByProfile(nextExtras);
    if (activeProfileRef.current === id) {
      activeProfileRef.current = null;
      setActiveProfile(null);
      factsRef.current = [];
      setFacts([]);
      replaceTransfers([]);
    }
    persistNow();
  }

  function addCustomFact(fields) {
    let profileId = activeProfileRef.current;
    if (!profileId) {
      profileId = "me";
      activeProfileRef.current = profileId;
      setActiveProfile(profileId);
      if (!Array.isArray(factsByProfileRef.current.me)) {
        const seeded = assembleFacts(
          "me",
          extrasRef.current,
          overridesRef.current,
          deletedRef.current
        );
        factsRef.current = seeded;
        factsByProfileRef.current = {
          ...factsByProfileRef.current,
          me: seeded,
        };
      } else {
        factsRef.current = factsByProfileRef.current.me;
      }
      setFacts(factsRef.current);
    }
    const extra = {
      ...fields,
      custom: true,
      seed: false,
      profileId,
    };
    const next = [extra, ...factsRef.current];
    factsRef.current = next;
    setFacts(next);
    writeProfileSnapshot(profileId, next);
  }

  function removeFact(id) {
    const profileId = activeProfileRef.current;
    const next = factsRef.current.filter((f) => f.id !== id);
    factsRef.current = next;
    setFacts(next);
    if (profileId) writeProfileSnapshot(profileId, next);
  }

  function patchFact(id, patch) {
    const profileId = activeProfileRef.current;
    const next = factsRef.current.map((f) =>
      f.id === id ? { ...f, ...patch } : f
    );
    factsRef.current = next;
    setFacts(next);
    if (profileId) writeProfileSnapshot(profileId, next);
  }

  function clearCurrentProfileFacts() {
    const id = activeProfileRef.current;
    factsRef.current = [];
    setFacts([]);
    replaceTransfers([]);
    if (id) writeProfileSnapshot(id, []);
  }

  function restoreSeedFacts() {
    const id = activeProfileRef.current;
    if (!id || !builtinById(id)) return;
    extrasRef.current = { ...extrasRef.current, [id]: [] };
    overridesRef.current = { ...overridesRef.current, [id]: {} };
    deletedRef.current = { ...deletedRef.current, [id]: [] };
    setExtrasByProfile({ ...extrasRef.current });
    setSeedOverridesByProfile({ ...overridesRef.current });
    setDeletedSeedIdsByProfile({ ...deletedRef.current });
    const next = assembleFacts(
      id,
      extrasRef.current,
      overridesRef.current,
      deletedRef.current
    );
    factsRef.current = next;
    setFacts(next);
    writeProfileSnapshot(id, next);
  }

  const { allowed, held } = useMemo(
    () => partitionFacts(facts, domain),
    [facts, domain]
  );

  const pendingHolds = useMemo(() => {
    const pending = [];
    const seen = new Set();
    for (const entry of transfers.filter(
      (t) => t.status === "held" && t.toDomain === domain
    )) {
      const key = `${entry.factId}:${entry.toDomain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push(entry);
    }
    return pending;
  }, [transfers, domain]);

  async function retrieve(overrides = {}) {
    const nextQuery = overrides.query ?? query;
    const nextDomain = overrides.domain ?? domain;
    const nextFacts = overrides.facts ?? facts;
    if (overrides.query) setQuery(overrides.query);
    if (overrides.domain) setDomain(overrides.domain);
    setLoading(true);
    const partitioned = partitionFacts(nextFacts, nextDomain);
    if (partitioned.held.length && !forceFail) {
      replaceTransfers((prev) => {
        const pendingKeys = new Set(
          prev
            .filter((t) => t.status === "held")
            .map((t) => `${t.factId}:${t.toDomain}`)
        );
        const fresh = makeTransferEntries(
          partitioned.held,
          nextDomain,
          nextQuery
        ).filter((t) => !pendingKeys.has(`${t.factId}:${t.toDomain}`));
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    }
    const extraConstraints = nextFacts
      .filter(
        (f) =>
          (f.source === "feedback" || f.source === "inferred") && !f.withheld
      )
      .filter((f) =>
        (f.scopes?.length ? f.scopes : [f.domain]).includes(nextDomain)
      )
      .map((f) => f.text);
    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nextQuery,
          domain: nextDomain,
          model,
          forceFail,
          facts: partitioned.allowed,
          constraints: extraConstraints,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Discover failed");
      setResults(mergeEntities(data.results || []));
      setPullContext({
        profileId: activeProfileRef.current,
        domain: nextDomain,
        query: nextQuery,
        allowed: partitioned.allowed,
        held: partitioned.held,
      });
      setMeta({
        message: data.message || "",
        usedDemo: Boolean(data.usedDemo),
        latencyMs: data.latencyMs || 0,
        harvestedUrls: data.harvestedUrls || [],
        constraints: data.constraints || [],
        provider: data.provider,
        model: data.model,
        forceFail: Boolean(data.forceFail),
      });
    } catch (error) {
      setResults([]);
      setPullContext(null);
      setMeta({ ...emptyMeta, message: error.message });
    } finally {
      setLoading(false);
    }
  }

  function factsForProfile(id) {
    if (Array.isArray(factsByProfileRef.current[id])) {
      return factsByProfileRef.current[id];
    }
    return assembleFacts(
      id,
      extrasRef.current,
      overridesRef.current,
      deletedRef.current
    );
  }

  function startAsPerson() {
    loadProfile("me");
    setQuery(SHOE_QUERY.query);
    setDomain("ecommerce");
    setResults([]);
    setPullContext(null);
    setFeedbackNote("");
    setBeat(1);
    setTab("discover");
  }

  async function pullTheIntent() {
    loadProfile("me");
    const nextFacts = factsForProfile("me");
    setBeat(2);
    setFeedbackNote("");
    await retrieve({
      query: SHOE_QUERY.query,
      domain: "ecommerce",
      facts: nextFacts,
    });
  }

  async function crossTheBoundary() {
    loadProfile("me");
    const nextFacts = factsForProfile("me");
    setBeat(3);
    setFeedbackNote(
      "A shoe budget is still an ecommerce fact. It will not enter this healthcare pull unless you approve the transfer."
    );
    await retrieve({
      query: CARE_QUERY.query,
      domain: "healthcare",
      facts: nextFacts,
    });
  }

  function rememberFit(result) {
    if (!activeProfile) loadProfile("me");
    addCustomFact({
      id: crypto.randomUUID(),
      text: `Wants more destinations like ${result.name} (${result.host})`,
      domain,
      source: "inferred",
      confidence: 0.72,
      scopes: [domain],
      withheld: false,
      createdAt: new Date().toISOString(),
    });
    setResults((prev) => {
      const rest = prev.filter((r) => r.url !== result.url);
      return [{ ...result, feedback: "fit" }, ...rest];
    });
    setFeedbackNote(
      `Kept. “${result.name}” is now an inferred preference in the world model — inspect, correct, or delete it.`
    );
  }

  function rejectDestination(result) {
    if (!activeProfile) loadProfile("me");
    addCustomFact({
      id: crypto.randomUUID(),
      text: `Do not return ${result.name} (${result.url})`,
      domain,
      source: "feedback",
      confidence: 0.95,
      scopes: [domain],
      withheld: false,
      createdAt: new Date().toISOString(),
    });
    setResults((prev) =>
      prev.map((r) =>
        r.url === result.url ? { ...r, feedback: "rejected" } : r
      )
    );
    setFeedbackNote(
      `Held out. “${result.name}” will constrain the next ${domain} pull. You stayed in authority.`
    );
  }

  async function runEval() {
    setEvalRunning(true);
    const runs = [];
    for (const item of EVAL_QUERIES) {
      const started = Date.now();
      const { allowed } = partitionFacts(facts, item.domain);
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: item.query,
          domain: item.domain,
          model,
          forceFail: false,
          facts: allowed,
        }),
      });
      const data = await response.json();
      const merged = mergeEntities(data.results || []);
      runs.push({
        ...item,
        latencyMs: data.latencyMs || Date.now() - started,
        rate: resolvableRate(merged),
        exact: merged.filter((r) => r.tier === "exact").length,
        total: merged.length,
        usedDemo: data.usedDemo,
        provider: data.provider,
      });
      setEvalRuns([...runs]);
    }
    setEvalRunning(false);
  }

  const evalSummary = useMemo(() => {
    if (!evalRuns.length) return null;
    const totalExact = evalRuns.reduce((s, r) => s + r.exact, 0);
    const total = evalRuns.reduce((s, r) => s + r.total, 0);
    const avgLatency = Math.round(
      evalRuns.reduce((s, r) => s + r.latencyMs, 0) / evalRuns.length
    );
    return {
      rate: total ? Math.round((totalExact / total) * 1000) / 10 : 0,
      avgLatency,
      n: evalRuns.length,
    };
  }, [evalRuns]);

  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <a className="logo" href="/">
            <span className="logo-mark" aria-hidden="true" />
            Pull
          </a>
          <nav className="tabs">
            <button
              className={tab === "discover" ? "active" : ""}
              onClick={() => setTab("discover")}
            >
              Discover
            </button>
            <button
              className={tab === "eval" ? "active" : ""}
              onClick={() => setTab("eval")}
            >
              Evaluation
            </button>
          </nav>
          <div className="nav-end">
            <span>You stay in authority</span>
          </div>
        </div>
      </header>
      <div className="page">
        {tab === "discover" ? (
          <>
            <header className="hero">
              <h1>Discovery that starts with the person, not the platform.</h1>
              <p>
                Say what you want to find. AI explores. The server checks
                whether those destinations actually appeared in search. Your
                world model stays yours — a shoe budget does not silently become
                a healthcare constraint.
              </p>
            </header>
            <ThesisBeats
              beat={beat}
              loading={loading}
              onPerson={startAsPerson}
              onPull={pullTheIntent}
              onBoundary={crossTheBoundary}
            />
            <div className="stage">
              <Discover
                query={query}
                setQuery={setQuery}
                domain={domain}
                setDomain={setDomain}
                model={model}
                setModel={setModel}
                forceFail={forceFail}
                setForceFail={setForceFail}
                loading={loading}
                onPull={() => retrieve()}
                results={results}
                pullContext={pullContext}
                customProfiles={customProfiles}
                meta={meta}
                allowed={allowed}
                held={held}
                pendingHolds={pendingHolds}
                feedbackNote={feedbackNote}
                onFit={rememberFit}
                onReject={rejectDestination}
                onApproveHold={(entry) => {
                  const updated = applyTransferDecision(
                    facts,
                    entry,
                    "approve"
                  ).find((f) => f.id === entry.factId);
                  if (updated) {
                    patchFact(entry.factId, {
                      scopes: updated.scopes,
                      withheld: updated.withheld,
                    });
                  }
                  replaceTransfers((prev) =>
                    prev.map((t) =>
                      t.id === entry.id ? { ...t, status: "approve" } : t
                    )
                  );
                }}
                onKeepHold={(entry) => {
                  patchFact(entry.factId, { withheld: true });
                  replaceTransfers((prev) =>
                    prev.map((t) =>
                      t.id === entry.id ? { ...t, status: "withhold" } : t
                    )
                  );
                }}
              />
              <WorldModel
                facts={facts}
                activeProfile={activeProfile}
                customProfiles={customProfiles}
                domain={domain}
                loadProfile={loadProfile}
                createProfile={createProfile}
                renameProfile={renameProfile}
                deleteProfile={deleteProfile}
                restoreSeedFacts={restoreSeedFacts}
                onAddFact={addCustomFact}
                onDeleteFact={removeFact}
                onUpdateFact={patchFact}
                onClearFacts={clearCurrentProfileFacts}
              />
            </div>
          </>
        ) : (
          <Evaluation
            running={evalRunning}
            onRun={runEval}
            runs={evalRuns}
            summary={evalSummary}
            model={model}
          />
        )}
      </div>
    </div>
  );
}

function ThesisBeats({ beat, loading, onPerson, onPull, onBoundary }) {
  const actions = [onPerson, onPull, onBoundary];
  return (
    <ol className="thesis">
      {THESIS_BEATS.map((item, i) => (
        <li
          key={item.id}
          className={`thesis-beat ${beat === i + 1 ? "active" : ""}`}
        >
          <span className="thesis-n">{item.n}</span>
          <div>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <button
              className={beat === i + 1 ? "btn" : "btn ghost"}
              type="button"
              disabled={loading}
              onClick={actions[i]}
            >
              {loading && beat === i + 1 ? "Working…" : item.cta}
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BoundaryBoard({
  domain,
  allowed,
  held,
  pendingHolds,
  onApproveHold,
  onKeepHold,
  readonly,
  caption,
}) {
  const holdByFact = new Map(
    pendingHolds.map((entry) => [entry.factId, entry])
  );

  return (
    <section className="boundary">
      {caption ? <p className="pull-stamp">{caption}</p> : null}
      <div className="boundary-col">
        <h3>
          {readonly
            ? `This ${domain} pull used`
            : `This ${domain} search can use`}
        </h3>
        {allowed.length === 0 ? (
          <p className="muted">
            Nothing from the world model is in scope yet. Load a profile, or
            this search runs without personal constraints.
          </p>
        ) : (
          <ul className="boundary-used">
            {allowed.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        )}
      </div>
      <div className={`boundary-col hold ${held.length ? "alert" : ""}`}>
        <h3>
          {readonly
            ? `Held out of this ${domain} pull`
            : "Not in this search unless you allow it"}
        </h3>
        {held.length === 0 ? (
          <p className="muted">
            {readonly
              ? `Every in-scope fact was allowed for this ${domain} pull.`
              : `Every loaded fact is already allowed for ${domain}.`}
          </p>
        ) : (
          <>
            <p className="boundary-note">
              {readonly
                ? "These facts were not sent to the model. Switching profile does not rerun search."
                : `Same person, different part of life. Each fact below stays out of this ${domain} search until you choose.`}
            </p>
            <div className="hold-list">
              {held.map((fact) => {
                const scopes = (fact.scopes?.length
                  ? fact.scopes
                  : [fact.domain]
                ).join(", ");
                const entry = holdByFact.get(fact.id) || {
                  id: `preview:${fact.id}:${domain}`,
                  factId: fact.id,
                  text: fact.text,
                  fromDomain: fact.domain,
                  toDomain: domain,
                };
                return (
                  <article className="hold-card" key={fact.id}>
                    <p>{fact.text}</p>
                    <p className="muted">
                      Allowed in {scopes}. This search is {domain}, so it
                      {readonly ? " was not used." : " is sitting out."}
                    </p>
                    {readonly ? null : (
                      <div className="actions">
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() => onApproveHold(entry)}
                        >
                          Use in {domain}
                        </button>
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() => onKeepHold(entry)}
                        >
                          Keep out
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Discover({
  query,
  setQuery,
  domain,
  setDomain,
  model,
  setModel,
  forceFail,
  setForceFail,
  loading,
  onPull,
  results,
  pullContext,
  customProfiles,
  meta,
  allowed,
  held,
  pendingHolds,
  feedbackNote,
  onFit,
  onReject,
  onApproveHold,
  onKeepHold,
}) {
  const samples = [
    { ...SAMPLE_QUERIES[0], label: "Waterproof shoes" },
    { ...SAMPLE_QUERIES[1], label: "After-hours care" },
    { ...SAMPLE_QUERIES[2], label: "Robotics camp" },
    { ...SAMPLE_QUERIES[3], label: "Trade contractors" },
  ];
  const frozen = Boolean(results.length && pullContext);
  const boardDomain = frozen ? pullContext.domain : domain;
  const boardAllowed = frozen ? pullContext.allowed : allowed;
  const boardHeld = frozen ? pullContext.held : held;
  const pullName = frozen
    ? displayProfileName(pullContext.profileId, customProfiles)
    : null;
  const visible = [
    ...results.filter((r) => r.feedback !== "rejected"),
    ...results.filter((r) => r.feedback === "rejected"),
  ];

  return (
    <div>
      <form
        className="panel composer"
        onSubmit={(e) => {
          e.preventDefault();
          onPull();
        }}
      >
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to find, understand, or accomplish?"
        />
        <div className="composer-row">
          <button className="btn" disabled={loading} type="submit">
            {loading ? "Exploring, then verifying…" : "Pull destinations"}
          </button>
        </div>
        <div className="composer-row">
          <div className="seg" role="group" aria-label="Domain">
            {DOMAINS.map((d) => (
              <button
                type="button"
                key={d}
                className={domain === d ? "active" : ""}
                onClick={() => setDomain(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Model">
            <button
              type="button"
              className={model === "anthropic" ? "active" : ""}
              onClick={() => setModel("anthropic")}
            >
              Claude
            </button>
            <button
              type="button"
              className={model === "google" ? "active" : ""}
              onClick={() => setModel("google")}
            >
              Gemini
            </button>
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={forceFail}
            onChange={(e) => setForceFail(e.target.checked)}
          />
          Stop before the model acts
        </label>
      </form>
      <div className="samples">
        {samples.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setQuery(item.query);
              setDomain(item.domain);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <BoundaryBoard
        domain={boardDomain}
        allowed={boardAllowed}
        held={boardHeld}
        pendingHolds={frozen ? [] : pendingHolds}
        readonly={frozen}
        caption={
          frozen
            ? `Showing destinations pulled for ${pullName}. Switching profile does not rerun search.`
            : null
        }
        onApproveHold={onApproveHold}
        onKeepHold={onKeepHold}
      />
      {feedbackNote ? <div className="banner">{feedbackNote}</div> : null}
      {meta.message ? (
        <div className={`banner ${meta.forceFail || meta.usedDemo ? "warn" : ""}`}>
          {meta.message}
          {meta.latencyMs ? ` · ${meta.latencyMs}ms` : ""}
          {meta.model ? ` · ${meta.provider}/${meta.model}` : ""}
        </div>
      ) : null}
      {loading ? (
        <div className="empty">
          Generation stays inside the model. Verification is computed afterward
          from harvested search URLs — a fluent answer is not a verified result.
        </div>
      ) : null}
      {results.length === 0 && !loading ? (
        <div className="empty">
          Play the three beats above. You should see a person, then proven
          destinations, then a domain boundary that waits for you.
        </div>
      ) : results.length ? (
        <>
          <TierMix results={results} harvested={meta.harvestedUrls.length} />
          <div className="results">
            {visible.map((result) => (
              <ResultCard
                key={`${result.host}${result.pathname}${result.url}`}
                result={result}
                constraints={meta.constraints}
                harvestedUrls={meta.harvestedUrls}
                onFit={onFit}
                onReject={onReject}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function TierMix({ results, harvested }) {
  const exact = results.filter((r) => r.tier === "exact").length;
  const host = results.filter((r) => r.tier === "host").length;
  const none = results.filter((r) => r.tier === "none").length;
  const total = results.length || 1;
  const c = 2 * Math.PI * 36;
  const segs = [
    { n: exact, color: "#5b53f5" },
    { n: host, color: "#b7b0d9" },
    { n: none, color: "#ddd9e8" },
  ];
  let offset = 0;
  return (
    <div className="mix">
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r="36" fill="none" stroke="#f3f0f8" strokeWidth="10" />
        {segs.map((seg) => {
          const dash = (seg.n / total) * c;
          const circle = (
            <circle
              key={seg.color}
              cx="44"
              cy="44"
              r="36"
              fill="none"
              stroke={seg.color}
              strokeWidth="10"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 44 44)"
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div>
        <h2>What search could prove</h2>
        <p className="mix-lead">
          {harvested || 0} harvested search URLs. Proven means the generated
          destination was in that harvest — not that the model sounded confident.
        </p>
        <div className="legend">
          <div>
            <span className="dot" style={{ background: "#5b53f5" }} />
            <b>{exact}</b> {TIER_COPY.exact.label}
          </div>
          <div>
            <span className="dot" style={{ background: "#b7b0d9" }} />
            <b>{host}</b> {TIER_COPY.host.label}
          </div>
          <div>
            <span className="dot" style={{ background: "#ddd9e8" }} />
            <b>{none}</b> {TIER_COPY.none.label}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, constraints, harvestedUrls, onFit, onReject }) {
  const why = formatWhy(result, constraints);
  const copy = TIER_COPY[result.tier] || TIER_COPY.none;
  const rejected = result.feedback === "rejected";
  const fit = result.feedback === "fit";
  return (
    <article className={`card ${rejected ? "rejected" : ""} ${fit ? "fit" : ""}`}>
      <div className="card-head">
        <div>
          <h3>{result.name}</h3>
          <a className="meta" href={result.url} target="_blank" rel="noreferrer">
            {result.url}
          </a>
        </div>
        <span className={`badge ${result.tier}`}>{copy.label}</span>
      </div>
      <p className="why">{why}</p>
      {result.note ? <p className="why muted">{result.note}</p> : null}
      <p className="tier-hint">{copy.hint}</p>
      <div className="badge-row">
        <span className="badge">corroborated ×{result.corroboration || 1}</span>
        {(result.constraintIndices || []).map((i) => (
          <span className="badge" key={i}>
            {constraints?.[i] || `constraint ${i}`}
          </span>
        ))}
      </div>
      <div className="actions">
        <button
          className="icon-btn"
          type="button"
          disabled={fit}
          onClick={() => onFit(result)}
        >
          {fit ? "Kept in world model" : "Fits me"}
        </button>
        <button
          className="icon-btn"
          type="button"
          disabled={rejected}
          onClick={() => onReject(result)}
        >
          {rejected ? "Held out" : "Not this"}
        </button>
      </div>
      <div className="ledger">
        generated {result.url}
        <br />
        matched {result.matchedUrl || "—"}
        <br />
        harvested {harvestedUrls.length} search URLs · {result.host}
        {result.pathname}
      </div>
    </article>
  );
}

function displayProfileName(activeProfile, customProfiles) {
  const builtin = builtinById(activeProfile);
  if (builtin) return builtin.label.replace(/^Load /, "");
  const custom = customProfiles.find((p) => p.id === activeProfile);
  return custom?.label || activeProfile || "empty";
}

function ScopeToggles({ scopes, onChange }) {
  return (
    <div className="scope-toggles">
      {DOMAINS.map((d) => {
        const on = scopes.includes(d);
        return (
          <button
            key={d}
            type="button"
            className={`pill-btn ${on ? "on" : ""}`}
            onClick={() =>
              onChange(
                on
                  ? scopes.filter((s) => s !== d)
                  : [...scopes, d]
              )
            }
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

function WorldModel({
  facts,
  activeProfile,
  customProfiles,
  domain,
  loadProfile,
  createProfile,
  renameProfile,
  deleteProfile,
  restoreSeedFacts,
  onAddFact,
  onDeleteFact,
  onUpdateFact,
  onClearFacts,
}) {
  const [draft, setDraft] = useState({
    text: "",
    domain: "ecommerce",
    confidence: 0.8,
    scopes: ["ecommerce"],
  });
  const [newProfileName, setNewProfileName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(null);

  function addFact(e) {
    e.preventDefault();
    if (!draft.text.trim()) return;
    onAddFact({
      id: crypto.randomUUID(),
      text: draft.text.trim(),
      domain: draft.domain,
      source: "stated",
      confidence: Number(draft.confidence) || 0.5,
      scopes: draft.scopes.length ? draft.scopes : [draft.domain],
      withheld: false,
      createdAt: new Date().toISOString(),
    });
    setDraft({ ...draft, text: "" });
  }

  function startEdit(fact) {
    setEditingId(fact.id);
    setEdit({
      text: fact.text,
      domain: fact.domain,
      confidence: fact.confidence,
      scopes: [...(fact.scopes || [fact.domain])],
    });
  }

  function saveEdit(e) {
    e.preventDefault();
    if (!edit?.text.trim()) return;
    onUpdateFact(editingId, {
      text: edit.text.trim(),
      domain: edit.domain,
      confidence: Number(edit.confidence) || 0.5,
      scopes: edit.scopes.length ? edit.scopes : [edit.domain],
    });
    setEditingId(null);
    setEdit(null);
  }

  function exportFacts() {
    const blob = new Blob([JSON.stringify(facts, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "world-model.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function submitNewProfile(e) {
    e.preventDefault();
    const name = newProfileName.trim();
    if (!name) return;
    createProfile(name);
    setNewProfileName("");
  }

  return (
    <aside className="panel white side">
      <div className="side-head">
        <h2>Current profile</h2>
        <span className="muted">
          {displayProfileName(activeProfile, customProfiles)}
        </span>
      </div>
      <div className="profile-grid">
        {BUILTIN_PROFILES.map((p) => (
          <button
            key={p.id}
            className={activeProfile === p.id ? "btn" : "btn ghost"}
            onClick={() => loadProfile(p.id)}
          >
            {p.label}
          </button>
        ))}
        {customProfiles.map((p) => (
          <div className="profile-row" key={p.id}>
            <button
              className={activeProfile === p.id ? "btn" : "btn ghost"}
              onClick={() => loadProfile(p.id)}
            >
              {p.label}
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => {
                const next = window.prompt("Rename profile", p.label);
                if (next != null) renameProfile(p.id, next);
              }}
            >
              Rename
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete profile “${p.label}” and its facts?`
                  )
                ) {
                  deleteProfile(p.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <form className="profile-new" onSubmit={submitNewProfile}>
        <input
          placeholder="New profile name"
          value={newProfileName}
          onChange={(e) => setNewProfileName(e.target.value)}
        />
        <button className="btn ghost" type="submit">
          Add profile
        </button>
      </form>
      <div className="section-title">
        <h2>Facts</h2>
        <span className="muted">{facts.length}</span>
      </div>
      <form className="fact-form" onSubmit={addFact}>
        <textarea
          rows={3}
          placeholder="Add a fact the system may use"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
        <select
          value={draft.domain}
          onChange={(e) => {
            const nextDomain = e.target.value;
            setDraft({
              ...draft,
              domain: nextDomain,
              scopes: draft.scopes.includes(nextDomain)
                ? draft.scopes
                : [...draft.scopes, nextDomain],
            });
          }}
        >
          {DOMAINS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <ScopeToggles
          scopes={draft.scopes}
          onChange={(scopes) => setDraft({ ...draft, scopes })}
        />
        <input
          type="number"
          min="0"
          max="1"
          step="0.05"
          value={draft.confidence}
          onChange={(e) => setDraft({ ...draft, confidence: e.target.value })}
        />
        <button className="btn ghost" type="submit">
          Add fact
        </button>
      </form>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="icon-btn" onClick={exportFacts} type="button">
          Export
        </button>
        {builtinById(activeProfile) ? (
          <button
            className="icon-btn"
            type="button"
            onClick={restoreSeedFacts}
          >
            Restore built-in facts
          </button>
        ) : null}
        <button className="icon-btn" type="button" onClick={onClearFacts}>
          Delete all facts
        </button>
      </div>
      <div className="fact-list">
        {facts.map((fact) => (
          <div
            key={fact.id}
            className={`fact ${fact.withheld ? "withheld" : ""}`}
          >
            {editingId === fact.id && edit ? (
              <form className="fact-form fact-edit" onSubmit={saveEdit}>
                <textarea
                  rows={3}
                  value={edit.text}
                  onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                />
                <select
                  value={edit.domain}
                  onChange={(e) =>
                    setEdit({ ...edit, domain: e.target.value })
                  }
                >
                  {DOMAINS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <ScopeToggles
                  scopes={edit.scopes}
                  onChange={(scopes) => setEdit({ ...edit, scopes })}
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={edit.confidence}
                  onChange={(e) =>
                    setEdit({ ...edit, confidence: e.target.value })
                  }
                />
                <div className="actions">
                  <button className="btn ghost" type="submit">
                    Save
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEdit(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="scope-pills">
                  {[
                    ...new Set(
                      [fact.domain, ...(fact.scopes || [])].filter(Boolean)
                    ),
                  ].map((s) => (
                    <span className="pill" key={s}>
                      {s}
                    </span>
                  ))}
                  <span className="pill">
                    {Math.round(fact.confidence * 100)}%
                  </span>
                  {fact.custom ? <span className="pill">added</span> : null}
                  <span className="pill">
                    {SOURCE_COPY[fact.source] || fact.source || "stated"}
                  </span>
                </div>
                <p>{fact.text}</p>
                <div className="actions">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => startEdit(fact)}
                  >
                    Edit
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() =>
                      onUpdateFact(fact.id, { withheld: !fact.withheld })
                    }
                  >
                    {fact.withheld ? "Restore" : "Withhold"}
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => onDeleteFact(fact.id)}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="section-title">
        <h2>Outside this search</h2>
        <span className="muted">{domain}</span>
      </div>
      <p className="muted">
        Facts that are not scoped to {domain} wait on the discovery panel. Allow
        or keep out each one there — a shoe budget never silently enters
        healthcare.
      </p>
    </aside>
  );
}

function Evaluation({ running, onRun, runs, summary, model }) {
  return (
    <>
      <header className="hero">
        <h1>Prove discovery, not engagement.</h1>
        <p className="eval-intro">
          Same four intentions, every time. Resolvable-destination rate is the
          share of destinations whose URL exactly matched a harvested search
          URL. Measure successful discovery alongside latency and cost — the
          client never computes tiers.
        </p>
      </header>
      <div className="eval-actions">
        <button className="btn" onClick={onRun} disabled={running}>
          {running ? "Running suite…" : `Run eval against ${model}`}
        </button>
      </div>
      {summary ? (
        <div className="stats">
          <div className="stat">
            <b>{summary.rate}%</b>
            <span>resolvable-destination rate</span>
          </div>
          <div className="stat">
            <b>{summary.avgLatency}ms</b>
            <span>mean latency</span>
          </div>
          <div className="stat">
            <b>{summary.n}</b>
            <span>fixed queries</span>
          </div>
        </div>
      ) : null}
      <div className="eval-list">
        {(runs.length ? runs : EVAL_QUERIES).map((run) => (
          <div className="eval-card" key={run.id}>
            <strong>{run.domain}</strong>
            <p className="why">{run.query}</p>
            {"rate" in run ? (
              <p className="meta">
                {run.exact}/{run.total} exact · {run.rate}% resolvable ·{" "}
                {run.latencyMs}ms
                {run.usedDemo ? " · demo fixtures" : ""}
              </p>
            ) : (
              <p className="meta">queued</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
