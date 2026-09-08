"use client";

import { useRouter } from "next/navigation";

export function LogoutButton(): React.ReactElement {
  const router = useRouter();

  async function handleClick(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" className="button button-ghost" onClick={handleClick}>
      Log out
    </button>
  );
}
