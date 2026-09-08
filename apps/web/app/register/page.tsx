import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage(): React.ReactElement {
  return (
    <main className="page page-narrow">
      <h1>Create an account</h1>
      <p className="form-note">
        New accounts get the standard USER role. The DEVELOPER-only area (
        <Link href="/developer">/developer</Link>) uses a separate seeded demo account — see the README.
      </p>
      <AuthForm mode="register" />
      <p className="form-note">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
