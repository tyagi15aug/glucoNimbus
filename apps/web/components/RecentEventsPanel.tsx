"use client";

import { useEffect, useState } from "react";

interface ProcessingEventRow {
  requestId: string;
  eventId: string | null;
  operation: string;
  status: string;
  error: string | null;
  durationMs: number;
  archived: boolean;
  createdAt: string;
}

interface EventsResponse {
  events: ProcessingEventRow[];
}

const POLL_INTERVAL_MS = 3000;

/**
 * Same polling shape as components/LiveDashboard.tsx — the point of
 * putting this next to FailureRulesPanel is to make Failure → Retry →
 * Recovery (spec Section 5) actually visible: add a processing-scope
 * "error" rule, watch `failed` rows appear here while SQS redelivers,
 * remove the rule, watch the next delivery land as `persisted`.
 */
export function RecentEventsPanel(): React.ReactElement {
  const [events, setEvents] = useState<ProcessingEventRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch("/api/processing-events?limit=20");
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as EventsResponse;
        if (!cancelled) setEvents(body.events);
      } catch {
        // Transient fetch failures just mean next poll is stale by one
        // tick — no need to surface an error state for a 3s-interval view.
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="chart-panel">
      <p className="panel-title">Recent processing events</p>
      {events.length === 0 ? (
        <p className="empty-state">Nothing processed yet.</p>
      ) : (
        <div className="events-table-wrap">
          <table className="events-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={`${e.requestId}-${e.createdAt}`} className={`event-row-${e.status}`}>
                  <td>{new Date(e.createdAt).toLocaleTimeString()}</td>
                  <td>{e.status}</td>
                  <td>{e.durationMs}ms</td>
                  <td className="event-detail">{e.error ?? e.eventId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
