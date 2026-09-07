import Link from "next/link";

export default function HomePage(): React.ReactElement {
  return (
    <main className="page">
      <h1>GlucoNimbus</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        A CGM real-time data platform: replayed research CGM data flowing through an event-driven ingestion
        pipeline into a live dashboard.
      </p>
      <div className="banner">
        This is an engineering demonstration using de-identified research data. It is not a medical device,
        diagnostic system, or source of medical advice.
      </div>
      <p>
        <Link href="/dashboard">Open the dashboard →</Link>
      </p>
    </main>
  );
}
