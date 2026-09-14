"use client";

import { useEffect, useMemo, useState } from "react";
import { PROFILE_BUTTONS, DOMAINS, EVAL_QUERIES } from "@/lib/profiles";
import { applyTransferDecision, makeTransferEntries, partitionFacts } from "@/lib/scope";
import { formatWhy, mergeEntities } from "@/lib/retrieve";
import { resolvableRate } from "@/lib/verification";

const STORAGE_KEY = "pull-discovery:v1";
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
  const [meta, setMeta] = useState(emptyMeta);
  const [evalRuns, setEvalRuns] = useState([]);
  const [evalRunning, setEvalRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setFacts(parsed.facts || []);
        setTransfers(parsed.transfers || []);
        setActiveProfile(parsed.activeProfile || null);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ facts, transfers, activeProfile })
    );
  }, [facts, transfers, activeProfile, hydrated]);

  function seedProfile(factory, id) {
    setFacts(factory());
    setActiveProfile(id);
    setTransfers([]);
  }

  async function retrieve() {
    setLoading(true);
    const { allowed, held } = partitionFacts(facts, domain);
    if (held.length && !forceFail) {
      setTransfers((prev) => {
        const pendingKeys = new Set(
          prev
            .filter((t) => t.status === "held")
            .map((t) => `${t.factId}:${t.toDomain}`)
        );
        const fresh = makeTransferEntries(held, domain, query).filter(
          (t) => !pendingKeys.has(`${t.factId}:${t.toDomain}`)
        );
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    }
    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          domain,
          model,
          forceFail,
          facts: allowed,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Discover failed");
      setResults(mergeEntities(data.results || []));
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
      setMeta({ ...emptyMeta, message: error.message });
    } finally {
      setLoading(false);
    }
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
      <aside className="rail">
        <div className="brand">
          <p className="eyebrow">Exponentials demo</p>
          <h1>Pull Discovery</h1>
          <p className="thesis">
            A persuasive generated answer is not the same as a verified result.
            Generation happens inside the model. Tiers are computed after, on
            the server.
          </p>
        </div>
        <WorldModel
          facts={facts}
          setFacts={setFacts}
          transfers={transfers}
          setTransfers={setTransfers}
          activeProfile={activeProfile}
          seedProfile={seedProfile}
          domain={domain}
        />
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="tabs">
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
          </div>
          <div className="trust-flag">
            Trust boundary · harvest then verify · never trust the prose
          </div>
        </div>
        {tab === "discover" ? (
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
            onPull={retrieve}
            results={results}
            meta={meta}
          />
        ) : (
          <Evaluation
            running={evalRunning}
            onRun={runEval}
            runs={evalRuns}
            summary={evalSummary}
            model={model}
          />
        )}
      </main>
    </div>
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
  meta,
}) {
  return (
    <div className="workspace">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          onPull();
        }}
      >
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What should be pulled from the world, not invented?"
        />
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
              Claude 3.5 + search
            </button>
            <button
              type="button"
              className={model === "google" ? "active" : ""}
              onClick={() => setModel("google")}
            >
              Gemini 2.5 + grounding
            </button>
          </div>
        </div>
        <div className="composer-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={forceFail}
              onChange={(e) => setForceFail(e.target.checked)}
            />
            Intentional failure
          </label>
          <button className="btn" disabled={loading} type="submit">
            {loading ? "Pulling…" : "Pull"}
          </button>
        </div>
      </form>
      <div className="samples">
        {SAMPLE_QUERIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setQuery(item.query);
              setDomain(item.domain);
            }}
          >
            {item.domain}: {item.query.slice(0, 72)}…
          </button>
        ))}
      </div>
      {meta.message ? (
        <div className={`banner ${meta.forceFail || meta.usedDemo ? "warn" : ""}`}>
          {meta.message}
          {meta.latencyMs ? ` · ${meta.latencyMs}ms` : ""}
          {meta.model ? ` · ${meta.provider}/${meta.model}` : ""}
        </div>
      ) : null}
      {results.length === 0 && !loading ? (
        <div className="empty">
          No destinations yet. Load a profile, pick a domain, and pull. Exact
          means the generated URL was in the search-tool harvest. Host means the
          path was invented. None means the URL was never seen.
        </div>
      ) : (
        <div className="results">
          {results.map((result) => (
            <ResultCard
              key={`${result.host}${result.pathname}${result.url}`}
              result={result}
              constraints={meta.constraints}
              harvestedUrls={meta.harvestedUrls}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, constraints, harvestedUrls }) {
  const why = formatWhy(result, constraints);
  return (
    <article className={`card ${result.tier}`}>
      <div className="stripe" />
      <div className="card-body">
        <div className="card-head">
          <div>
            <h3>{result.name}</h3>
            <a className="meta" href={result.url} target="_blank" rel="noreferrer">
              {result.url}
            </a>
          </div>
          <span className={`badge ${result.tier}`}>{result.tier}</span>
        </div>
        <p className="why">{why}</p>
        {result.note ? <p className="why muted">{result.note}</p> : null}
        <div className="badge-row">
          <span className="badge muted">
            corroborated ×{result.corroboration || 1}
          </span>
          {(result.constraintIndices || []).map((i) => (
            <span className="badge muted" key={i}>
              constraint {i}
            </span>
          ))}
        </div>
        <div className="ledger">
          generated {result.url}
          <br />
          matched {result.matchedUrl || "—"}
          <br />
          harvested {harvestedUrls.length} search URLs · host {result.host}
          {result.pathname}
        </div>
      </div>
    </article>
  );
}

function WorldModel({
  facts,
  setFacts,
  transfers,
  setTransfers,
  activeProfile,
  seedProfile,
  domain,
}) {
  const [draft, setDraft] = useState({
    text: "",
    domain: "ecommerce",
    confidence: 0.8,
    scopes: ["ecommerce"],
  });
  const pending = transfers.filter((t) => t.status === "held").slice(0, 8);

  function addFact(e) {
    e.preventDefault();
    if (!draft.text.trim()) return;
    setFacts((prev) => [
      {
        id: crypto.randomUUID(),
        text: draft.text.trim(),
        domain: draft.domain,
        source: "stated",
        confidence: Number(draft.confidence) || 0.5,
        scopes: draft.scopes,
        withheld: false,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setDraft({ ...draft, text: "" });
  }

  function updateFact(id, patch) {
    setFacts((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function decide(entry, decision) {
    setFacts((prev) => applyTransferDecision(prev, entry, decision));
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === entry.id ? { ...t, status: decision } : t
      )
    );
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

  return (
    <div className="rail-body">
      <div className="section-title">
        <h2>World model</h2>
        <span className="muted">{activeProfile || "empty"}</span>
      </div>
      <div className="profile-grid">
        {PROFILE_BUTTONS.map((p) => (
          <button
            key={p.id}
            className={activeProfile === p.id ? "btn" : "btn ghost"}
            onClick={() => seedProfile(p.factory, p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
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
          onChange={(e) =>
            setDraft({
              ...draft,
              domain: e.target.value,
              scopes: [e.target.value],
            })
          }
        >
          {DOMAINS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          max="1"
          step="0.05"
          value={draft.confidence}
          onChange={(e) => setDraft({ ...draft, confidence: e.target.value })}
        />
        <button className="btn small" type="submit">
          Add fact
        </button>
      </form>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="icon-btn" onClick={exportFacts} type="button">
          Export
        </button>
        <button
          className="icon-btn"
          type="button"
          onClick={() => {
            setFacts([]);
            setTransfers([]);
            setActiveProfile(null);
          }}
        >
          Delete all
        </button>
      </div>
      <div className="results" style={{ marginTop: 12 }}>
        {facts.map((fact) => (
          <div
            key={fact.id}
            className={`fact ${fact.withheld ? "withheld" : ""}`}
          >
            <div className="scope-pills">
              <span className="pill">{fact.domain}</span>
              {(fact.scopes || []).map((s) => (
                <span className="pill" key={s}>
                  {s}
                </span>
              ))}
              <span className="pill">{Math.round(fact.confidence * 100)}%</span>
            </div>
            <p>{fact.text}</p>
            <div className="actions">
              <button
                className="icon-btn"
                type="button"
                onClick={() => {
                  const next = window.prompt("Correct this fact", fact.text);
                  if (next != null) updateFact(fact.id, { text: next });
                }}
              >
                Correct
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={() => updateFact(fact.id, { withheld: !fact.withheld })}
              >
                {fact.withheld ? "Restore" : "Withhold"}
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={() =>
                  setFacts((prev) => prev.filter((f) => f.id !== fact.id))
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="section-title">
        <h2>Held at the domain boundary</h2>
        <span className="muted">active {domain}</span>
      </div>
      {pending.length === 0 ? (
        <p className="muted">
          Cross-domain facts stay here until you approve a transfer. A shoe
          budget never silently enters a healthcare pull.
        </p>
      ) : (
        pending.map((entry) => (
          <div className="held" key={entry.id}>
            <p>
              {entry.text}
              <br />
              <span className="muted">
                {entry.fromDomain} → {entry.toDomain}
              </span>
            </p>
            <div className="actions">
              <button
                className="icon-btn"
                type="button"
                onClick={() => decide(entry, "approve")}
              >
                Approve transfer
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={() => decide(entry, "withhold")}
              >
                Keep withheld
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Evaluation({ running, onRun, runs, summary, model }) {
  return (
    <div className="workspace">
      <p className="thesis" style={{ color: "var(--ink-soft)", maxWidth: 640 }}>
        Same four queries, every time. Resolvable-destination rate is the share
        of destinations whose URL exactly matched a harvested search-tool URL.
        Client code does not compute tiers.
      </p>
      <div className="composer-row" style={{ marginTop: 16 }}>
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
    </div>
  );
}
