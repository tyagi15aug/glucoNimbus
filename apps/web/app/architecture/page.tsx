import Link from "next/link";
import { PipelineExplorer } from "@/components/PipelineExplorer";

export default function ArchitecturePage(): React.ReactElement {
  return (
    <main className="page">
      <h1>System architecture</h1>
      <div className="banner">
        GlucoNimbus replays de-identified research readings through the same asynchronous path used for simulated live data.
        It is an engineering demonstration, not a medical device or source of medical advice.
      </div>
      <PipelineExplorer expanded />
      <section className="architecture-notes">
        <div>
          <h2>Why a queue sits in the middle</h2>
          <p>The API acknowledges a validated reading quickly. The worker then handles persistence independently, so retries and duplicate deliveries do not create duplicate logical readings.</p>
        </div>
        <div>
          <h2>What the status means</h2>
          <p>Queue and database states are checked against local infrastructure. The worker stage comes from its processing audit trail; an idle stage means no recent worker event, not a fabricated healthy signal.</p>
        </div>
      </section>
      <p className="architecture-actions"><Link href="/dashboard">Return to the live dashboard →</Link> · <Link href="/developer">Open developer diagnostics →</Link></p>
    </main>
  );
}
