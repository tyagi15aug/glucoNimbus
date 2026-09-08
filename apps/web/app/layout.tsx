import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "GlucoNimbus",
  description: "CGM real-time data platform — engineering demonstration.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="site-brand">
            GlucoNimbus
          </Link>
          <nav className="site-nav">
            <Link href="/dashboard">Dashboard</Link>
            {session ? (
              <>
                {(session.role === "DEVELOPER" || session.role === "ADMIN") && (
                  <Link href="/developer">Developer</Link>
                )}
                <span className="site-nav-user">{session.email}</span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login">Log in</Link>
                <Link href="/register">Register</Link>
              </>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
