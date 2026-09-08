"use client";

import { useEffect, useState } from "react";

type FailureScope = "ingestion" | "processing";
type FailureType = "error" | "delay" | "db_outage";

interface FailureRule {
  id: string;
  scope: FailureScope;
  failureType: FailureType;
  delayMs: number | null;
  probability: number;
  createdAt: string;
}

interface RulesResponse {
  rules: FailureRule[];
}

interface ApiErrorBody {
  error: { message: string };
}

const FAILURE_TYPES_BY_SCOPE: Record<FailureScope, { value: FailureType; label: string }[]> = {
  ingestion: [
    { value: "error", label: "Error (POST /api/readings returns 500)" },
    { value: "delay", label: "Delay (artificial latency before publishing)" },
  ],
  processing: [
    { value: "error", label: "Processor failure (worker throws before persisting)" },
    { value: "delay", label: "Delay (artificial latency before persisting)" },
    { value: "db_outage", label: "Database unavailable" },
  ],
};

function describeRule(rule: FailureRule): string {
  const pct = Math.round(rule.probability * 100);
  const detail = rule.failureType === "delay" ? ` (${rule.delayMs}ms)` : "";
  return `${rule.scope} · ${rule.failureType}${detail} · ${pct}% of the time`;
}

/**
 * Phase 6 reliability demonstration (spec Section 5) — a rule's mere
 * existence is what makes it active, so "create" and "remove" are the
 * entire lifecycle; there's no enable/disable toggle to keep in sync with
 * a separate boolean. Pair this with RecentEventsPanel to actually watch
 * Failure → Retry → Recovery happen once a processing-scope rule is live.
 */
export function FailureRulesPanel(): React.ReactElement {
  const [rules, setRules] = useState<FailureRule[] | null>(null);
  const [scope, setScope] = useState<FailureScope>("processing");
  const [failureType, setFailureType] = useState<FailureType>("error");
  const [delayMs, setDelayMs] = useState("2000");
  const [probability, setProbability] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh(): Promise<void> {
    const res = await fetch("/api/failure-rules");
    if (!res.ok) return;
    const body = (await res.json()) as RulesResponse;
    setRules(body.rules);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function handleScopeChange(next: FailureScope): void {
    setScope(next);
    // Reset to a type that's actually valid for the new scope (e.g. leaving
    // "db_outage" selected after switching to "ingestion" would fail
    // validation on submit for no reason visible in the form itself).
    const firstValid = FAILURE_TYPES_BY_SCOPE[next][0];
    if (firstValid) setFailureType(firstValid.value);
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/failure-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          failureType,
          ...(failureType === "delay" ? { delayMs: Number(delayMs) } : {}),
          probability: Number(probability),
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error?.message ?? "Failed to create rule.");
        return;
      }
      await refresh();
    } catch {
      setError("Network error — is the server reachable?");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setError(null);
    const res = await fetch(`/api/failure-rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      setError(body.error?.message ?? "Failed to remove rule.");
      return;
    }
    await refresh();
  }

  return (
    <div className="chart-panel">
      <p className="panel-title">Failure injection</p>

      <form onSubmit={handleCreate} className="failure-rule-form">
        <label className="field">
          <span>Scope</span>
          <select value={scope} onChange={(e) => handleScopeChange(e.target.value as FailureScope)}>
            <option value="ingestion">ingestion (POST /api/readings)</option>
            <option value="processing">processing (the worker)</option>
          </select>
        </label>
        <label className="field">
          <span>Failure type</span>
          <select value={failureType} onChange={(e) => setFailureType(e.target.value as FailureType)}>
            {FAILURE_TYPES_BY_SCOPE[scope].map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {failureType === "delay" && (
          <label className="field">
            <span>Delay (ms)</span>
            <input type="number" min={1} max={60000} value={delayMs} onChange={(e) => setDelayMs(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Probability (0–1)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? "Adding…" : "Add rule"}
        </button>
      </form>

      {rules === null ? (
        <p className="empty-state">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="empty-state">No active rules — the pipeline is running clean.</p>
      ) : (
        <ul className="failure-rule-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <span>{describeRule(rule)}</span>
              <button type="button" className="button button-ghost" onClick={() => void handleDelete(rule.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
