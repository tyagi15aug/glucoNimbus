"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  timestamp: string;
  glucose: number;
}

/**
 * The one non-obvious analytics touch worth commenting on: the 70/180
 * reference lines are the standard "time in range" band used across CGM
 * consumer apps (Abbott Lingo included) — shown here purely as a visual
 * reference band, not a diagnostic threshold. See the boundary disclaimer
 * on every page that renders this.
 */
export function GlucoseChart({ points }: { points: ChartPoint[] }): React.ReactElement {
  if (points.length === 0) {
    return <div className="empty-state">No readings yet — start the simulator to see data here.</div>;
  }

  const data = points.map((p) => ({
    ...p,
    label: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#232e3a" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#93a4b8" fontSize={12} tickMargin={8} minTickGap={40} />
        <YAxis stroke="#93a4b8" fontSize={12} domain={[40, 260]} width={40} />
        <ReferenceLine y={70} stroke="#f2745c" strokeDasharray="4 4" />
        <ReferenceLine y={180} stroke="#f2745c" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{ background: "#131a22", border: "1px solid #232e3a", borderRadius: 8 }}
          labelStyle={{ color: "#93a4b8" }}
        />
        <Line type="monotone" dataKey="glucose" stroke="#4fd1c5" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
