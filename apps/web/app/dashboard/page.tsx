import { LiveDashboard } from "@/components/LiveDashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ participantId?: string }>;
}): Promise<React.ReactElement> {
  const { participantId = "001" } = await searchParams;

  return (
    <main className="page">
      <h1>Dashboard</h1>
      <div className="banner">
        This is an engineering demonstration using de-identified research data. It is not a medical device,
        diagnostic system, or source of medical advice.
      </div>
      <LiveDashboard participantId={participantId} />
    </main>
  );
}
