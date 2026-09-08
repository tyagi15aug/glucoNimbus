import { getSession } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * DEVELOPER-only area — access is enforced by middleware.ts (redirects to
 * /login before this component ever renders), so `getSession()` here is
 * for display, not the actual gate. Placeholder content: Phase 6 will put
 * the failure-injection control panel (duplicate/delay/drop toggles
 * against `failure_rules`) here.
 */
export default async function DeveloperPage(): Promise<React.ReactElement> {
  const session = await getSession();

  return (
    <main className="page">
      <h1>Developer</h1>
      <div className="banner">
        Signed in as <strong>{session?.email}</strong> ({session?.role}). This area is reachable only with a
        DEVELOPER or ADMIN session — see <code>docs/adr/0012-auth.md</code>.
      </div>
      <p className="empty-state">
        Failure-injection controls land here in Phase 6 (the <code>failure_rules</code> table already exists for
        it). For now this page just proves the auth gate works end to end.
      </p>
      <LogoutButton />
    </main>
  );
}
