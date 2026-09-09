"use client";

import { useEffect, useState } from "react";
import { GlucoseChart, type ChartPoint } from "./GlucoseChart";

interface LatestResponse {
  reading: { glucose: number; unit: string; timestamp: string } | null;
  trend: "rising" | "falling" | "steady" | "unknown";
  rateOfChangePerMinute: number | null;
}

interface HistoryResponse {
  readings: ChartPoint[];
}

interface DailyResponse {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  standardDeviation?: number | null;
  coefficientOfVariation?: number | null;
}

interface TrendResponse {
  series: Array<{ date: string; count: number; average: number | null }>;
  comparison: { averageDelta: number | null } | null;
}

interface ContextEvent {
  eventId: string;
  type: "meal";
  timestamp: string;
  description: string | null;
  carbsGrams: number | null;
}

interface EventsResponse {
  events: ContextEvent[];
}

interface HealthResponse {
  postgres: "ready" | "unreachable";
  localstack: "ready" | "unreachable";
  overall: "ready" | "starting";
}

const POLL_INTERVAL_MS = 5000;

/**
 * Polls the analytics/readings API on an interval rather than any
 * push-based mechanism — deliberately simple for the MVP (Section 25 asks
 * for "near-real-time," not literal streaming). Swapping this for SSE/WS
 * once the SQS/Lambda pipeline exists is a self-contained follow-up, not a
 * rewrite: only this component's data-fetching effect would change.
 */
export function LiveDashboard({ participantId }: { participantId: string }): React.ReactElement {
  const [latest, setLatest] = useState<LatestResponse | null>(null);
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [trends, setTrends] = useState<TrendResponse | null>(null);
  const [events, setEvents] = useState<ContextEvent[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const [latestRes, historyRes, dailyRes, trendRes, eventsRes, healthRes] = await Promise.all([
          fetch(`/api/readings/latest?participantId=${participantId}`).then((r) => r.json() as Promise<LatestResponse>),
          fetch(`/api/readings?participantId=${participantId}&limit=200`).then(
            (r) => r.json() as Promise<HistoryResponse>,
          ),
          fetch(`/api/analytics/daily?participantId=${participantId}`).then((r) => r.json() as Promise<DailyResponse>),
          fetch(`/api/analytics/trends?participantId=${participantId}&days=7`).then((r) => r.json() as Promise<TrendResponse>),
          fetch(`/api/events?participantId=${participantId}&limit=3`).then((r) => r.json() as Promise<EventsResponse>),
          fetch("/api/health").then((r) => r.json() as Promise<HealthResponse>),
        ]);

        if (cancelled) return;
        setLatest(latestRes);
        setHistory(historyRes.readings);
        setDaily(dailyRes);
        setTrends(trendRes);
        setEvents(eventsRes.events);
        setHealth(healthRes);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Dashboard poll failed:", err);
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [participantId]);

  const trendArrow =
    latest?.trend === "rising" ? "↑" : latest?.trend === "falling" ? "↓" : latest?.trend === "steady" ? "→" : "–";
  const averageDelta = trends?.comparison?.averageDelta;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Current Glucose</div>
          <div className={`value trend-${latest?.trend ?? "unknown"}`}>
            {latest?.reading ? Math.round(latest.reading.glucose) : "–"}
            <span className="unit">{latest?.reading?.unit ?? ""}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Trend</div>
          <div className={`value trend-${latest?.trend ?? "unknown"}`}>{trendArrow}</div>
        </div>
        <div className="stat-card">
          <div className="label">Today&rsquo;s Average</div>
          <div className="value">{daily?.average ?? "–"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Today&rsquo;s Range</div>
          <div className="value" style={{ fontSize: "1.2rem" }}>
            {daily?.min ?? "–"} – {daily?.max ?? "–"}
          </div>
        </div>
      </div>

      <div className="chart-panel">
        <p className="panel-title">
          Glucose (last {history.length} readings){" "}
          {lastUpdated && <span>· updated {lastUpdated.toLocaleTimeString()}</span>}
        </p>
        <GlucoseChart points={history} />
      </div>

      <div className="dashboard-detail-grid">
        <section className="chart-panel">
          <p className="panel-title">Seven-day comparison</p>
          <div className="comparison-value">
            {averageDelta === null || averageDelta === undefined
              ? "Not enough prior readings"
              : `${averageDelta >= 0 ? "+" : ""}${averageDelta} mg/dL vs. prior 7 days`}
          </div>
          <div className="trend-days" aria-label="Daily average glucose over the last seven days">
            {trends?.series.map((day) => (
              <div key={day.date} className="trend-day">
                <strong>{day.average ?? "–"}</strong>
                <span>{new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="chart-panel">
          <p className="panel-title">Recent meal context</p>
          {events.length === 0 ? (
            <p className="empty-state">No meal events are available for this participant.</p>
          ) : (
            <ul className="context-events">
              {events.map((event) => (
                <li key={event.eventId}>
                  <span>{event.description ?? "Meal"}</span>
                  <small>
                    {event.carbsGrams === null ? "Carbohydrates not recorded" : `${event.carbsGrams}g carbohydrates`} · {new Date(event.timestamp).toLocaleString()}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="chart-panel system-status" aria-live="polite">
        <p className="panel-title">System status</p>
        <div className="status-list">
          <span>API <strong className="status-ready">Ready</strong></span>
          <span>Database <strong className={`status-${health?.postgres ?? "unknown"}`}>{health?.postgres ?? "Checking"}</strong></span>
          <span>Queue storage <strong className={`status-${health?.localstack ?? "unknown"}`}>{health?.localstack ?? "Checking"}</strong></span>
        </div>
      </section>
    </>
  );
}
