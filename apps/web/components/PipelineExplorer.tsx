"use client";

import { useEffect, useState } from "react";

type StageStatus = "ready" | "active" | "idle" | "unreachable" | "unknown";

interface Stage {
  id: string;
  label: string;
  detail: string;
  status: StageStatus;
}

interface SystemStatusResponse {
  updatedAt: string;
  stages: Stage[];
  lastEvent: { eventId: string | null; status: string; durationMs: number; createdAt: string; error: string | null } | null;
}

const POLL_INTERVAL_MS = 5000;

/**
 * Makes the otherwise invisible asynchronous pipeline legible to a reviewer.
 * It uses observed infrastructure state where available and labels idle or
 * unreachable services honestly rather than treating a diagram as telemetry.
 */
export function PipelineExplorer({ expanded = false }: { expanded?: boolean }): React.ReactElement {
  const [system, setSystem] = useState<SystemStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const response = await fetch("/api/system-status", { cache: "no-store" });
        const body = (await response.json()) as SystemStatusResponse;
        if (!cancelled) setSystem(body);
      } catch {
        // Keep the last known pipeline state visible on a transient network error.
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const stages = system?.stages ?? [];
  return (
    <section className={`pipeline-explorer ${expanded ? "pipeline-explorer-expanded" : ""}`} aria-live="polite">
      <div className="pipeline-heading">
        <div>
          <p className="panel-title">How this reading moves through GlucoNimbus</p>
          <p className="pipeline-subtitle">Each stage is the real local pipeline, with live status where it can be observed.</p>
        </div>
        <span className="pipeline-updated">{system ? `updated ${new Date(system.updatedAt).toLocaleTimeString()}` : "checking services…"}</span>
      </div>
      <ol className="pipeline-stages">
        {stages.map((stage, index) => (
          <li key={stage.id} className="pipeline-stage">
            <div className={`pipeline-dot status-${stage.status}`} aria-hidden="true" />
            <div>
              <strong>{stage.label}</strong>
              <span>{stage.detail}</span>
              <em className={`pipeline-status status-${stage.status}`}>{stage.status}</em>
            </div>
            {index < stages.length - 1 && <div className="pipeline-arrow" aria-hidden="true">→</div>}
          </li>
        ))}
      </ol>
      {system?.lastEvent ? (
        <div className="pipeline-last-event">
          <strong>Last worker event:</strong> <span className={`status-${system.lastEvent.status}`}>{system.lastEvent.status}</span>
          {" · "}{system.lastEvent.durationMs}ms · {new Date(system.lastEvent.createdAt).toLocaleTimeString()}
          {system.lastEvent.error ? ` · ${system.lastEvent.error}` : ""}
        </div>
      ) : (
        <p className="pipeline-last-event">No worker event recorded yet. Start the simulator to watch a reading travel through the system.</p>
      )}
    </section>
  );
}
