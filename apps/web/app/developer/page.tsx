import { getSession } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";
import { FailureRulesPanel } from "@/components/FailureRulesPanel";
import { RecentEventsPanel } from "@/components/RecentEventsPanel";

/**
 * DEVELOPER-only area — access is enforced by middleware.ts (redirects to
 * /login before this component ever renders), so `getSession()` here is
 * for display, not the actual gate. Phase 6 (spec Section 5): failure
 * injection at the ingestion/processing boundaries, backed by the
 * `failure_rules` table — see docs/adr/0013-failure-injection.md.
 */
export default async function DeveloperPage(): Promise<React.ReactElement> {
  const session = await getSession();

  return (
    <main className="page">
      <h1>Developer</h1>
      <div className="banner">
        Signed in as <strong>{session?.email}</strong> ({session?.role}). Rules added here affect the live
        ingestion/processing pipeline for every participant — this is a shared demo environment, not a sandbox
        per user.
      </div>
      <FailureRulesPanel />
      <RecentEventsPanel />
      <LogoutButton />
    </main>
  );
}
