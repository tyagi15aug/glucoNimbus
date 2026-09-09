"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AuthFormProps {
  mode: "login" | "register";
  redirectTo?: string | undefined;
}

interface AuthErrorBody {
  error: { code: string; message: string };
}

/** Shared form for /login and /register — same fields, different endpoint + copy. */
export function AuthForm({ mode, redirectTo }: AuthFormProps): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Split into two try/catches on purpose: a thrown fetch() (DNS
    // failure, connection refused, CORS) is a genuine network error, but
    // a thrown res.json() or a thrown router.push()/router.refresh() is
    // not — lumping all three into one catch previously reported every
    // one of them as "network error", which was actively misleading
    // while chasing a real server-side bug (a route throwing before
    // returning JSON, surfaced as Next's HTML error page here).
    let res: Response;
    try {
      res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      setError("Network error — is the server reachable?");
      setSubmitting(false);
      return;
    }

    if (!res.ok) {
      try {
        const body = (await res.json()) as AuthErrorBody;
        setError(body.error?.message ?? "Something went wrong.");
      } catch {
        // Response wasn't JSON at all — most likely an unhandled
        // exception in the route handler rendered as an HTML error page.
        // Surfacing the real status code here (instead of "network
        // error") is what makes that diagnosable from the browser alone.
        setError(`Server error (${res.status}) — check the server logs for details.`);
      }
      setSubmitting(false);
      return;
    }

    try {
      router.push(redirectTo ?? "/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="button" disabled={submitting}>
        {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
      </button>
    </form>
  );
}
