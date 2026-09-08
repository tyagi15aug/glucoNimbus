import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}): Promise<React.ReactElement> {
  const { from } = await searchParams;

  return (
    <main className="page page-narrow">
      <h1>Log in</h1>
      {from && (
        <p className="form-note">
          You need a developer account to open <code>{from}</code>.
        </p>
      )}
      <AuthForm mode="login" redirectTo={from} />
      <p className="form-note">
        No account? <Link href="/register">Register</Link>
      </p>
    </main>
  );
}
