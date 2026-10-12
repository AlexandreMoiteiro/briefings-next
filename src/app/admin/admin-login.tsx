"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!response.ok) throw new Error("Invalid admin code. Please try again.");
      setCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        Enter your admin code to access Dashboard, Messages and Export access.
      </p>
      <form onSubmit={signIn} autoComplete="off" className="mt-6 space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin code</span>
          <input value={code} onChange={event => setCode(event.target.value)}
            type="password" autoComplete="off" required
            className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none focus:border-zinc-500"
            placeholder="Enter admin code" />
        </label>
        <button type="submit" disabled={busy}
          className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "Signing in…" : "Enter Admin"}
        </button>
      </form>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    </main>
  );
}
