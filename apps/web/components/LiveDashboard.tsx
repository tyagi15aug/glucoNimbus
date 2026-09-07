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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const [latestRes, historyRes, dailyRes] = await Promise.all([
          fetch(`/api/readings/latest?participantId=${participantId}`).then((r) => r.json() as Promise<LatestResponse>),
          fetch(`/api/readings?participantId=${participantId}&limit=200`).then(
            (r) => r.json() as Promise<HistoryResponse>,
          ),
          fetch(`/api/analytics/daily?participantId=${participantId}`).then((r) => r.json() as Promise<DailyResponse>),
        ]);

        if (cancelled) return;
        setLatest(latestRes);
        setHistory(historyRes.readings);
        setDaily(dailyRes);
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
    </>
  );
}
