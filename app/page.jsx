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
            <span>Verified after generation</span>
          </div>
        </div>
      </header>
      <div className="page">
        {tab === "discover" ? (
          <>
            <header className="hero">
              <h1>Pull only what the web can prove.</h1>
              <p>
                Generation stays inside the model. Exact, host, and none are
                computed on the server after search URLs are harvested.
              </p>
            </header>
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
                onPull={retrieve}
                results={results}
                meta={meta}
              />
              <WorldModel
                facts={facts}
                setFacts={setFacts}
                transfers={transfers}
                setTransfers={setTransfers}
                activeProfile={activeProfile}
                seedProfile={seedProfile}
                domain={domain}
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
  const samples = [
    { ...SAMPLE_QUERIES[0], label: "Waterproof shoes" },
    { ...SAMPLE_QUERIES[1], label: "After-hours care" },
    { ...SAMPLE_QUERIES[2], label: "Robotics camp" },
    { ...SAMPLE_QUERIES[3], label: "Trade contractors" },
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
          placeholder="What should be pulled from the world, not invented?"
        />
        <div className="composer-row">
          <button className="btn" disabled={loading} type="submit">
            {loading ? "Pulling…" : "Pull destinations"}
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
              Gemini 2.5
            </button>
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={forceFail}
            onChange={(e) => setForceFail(e.target.checked)}
          />
          Intentional failure
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
      {meta.message ? (
        <div className={`banner ${meta.forceFail || meta.usedDemo ? "warn" : ""}`}>
          {meta.message}
          {meta.latencyMs ? ` · ${meta.latencyMs}ms` : ""}
          {meta.model ? ` · ${meta.provider}/${meta.model}` : ""}
        </div>
      ) : null}
      {results.length === 0 && !loading ? (
        <div className="empty">
          Load a profile, then pull. Exact means the URL was in the search-tool
          harvest. Host means the path was invented. None means it was never
          seen.
        </div>
      ) : results.length ? (
        <>
          <TierMix results={results} />
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
        </>
      ) : null}
    </div>
  );
}

function TierMix({ results }) {
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
        <h2>Verification mix</h2>
        <div className="legend">
          <div>
            <span className="dot" style={{ background: "#5b53f5" }} />
            <b>{Math.round((exact / total) * 100)}%</b> exact
          </div>
          <div>
            <span className="dot" style={{ background: "#b7b0d9" }} />
            <b>{Math.round((host / total) * 100)}%</b> host
          </div>
          <div>
            <span className="dot" style={{ background: "#ddd9e8" }} />
            <b>{Math.round((none / total) * 100)}%</b> none
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, constraints, harvestedUrls }) {
  const why = formatWhy(result, constraints);
  return (
    <article className="card">
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
        <span className="badge">corroborated ×{result.corroboration || 1}</span>
        {(result.constraintIndices || []).map((i) => (
          <span className="badge" key={i}>
            constraint {i}
          </span>
        ))}
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
  const pending = [];
  const seenHeld = new Set();
  for (const entry of transfers.filter((t) => t.status === "held")) {
    const key = `${entry.factId}:${entry.toDomain}`;
    if (seenHeld.has(key)) continue;
    seenHeld.add(key);
    pending.push(entry);
  }

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
    <aside className="panel white side">
      <div className="side-head">
        <h2>Current profile</h2>
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
        <button className="btn ghost" type="submit">
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
      <div className="fact-list">
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
    </aside>
  );
}

function Evaluation({ running, onRun, runs, summary, model }) {
  return (
    <>
      <header className="hero">
        <h1>Same four queries, every time.</h1>
        <p className="eval-intro">
          Resolvable-destination rate is the share of destinations whose URL
          exactly matched a harvested search-tool URL. The client never computes
          tiers.
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
