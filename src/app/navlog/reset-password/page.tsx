"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ResetNavlogPasswordPage() {
  const [hasSession, setHasSession] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(Boolean(data.session));
      setReady(true);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setHasSession(Boolean(session));
        setReady(true);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setMessage("The reset link expired. Request another from NavLog.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/navlog/auth/reset-pin", {
        method: "POST",
        headers: { "Authorization": `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update your PIN.");
      setPin("");
      setMessage("PIN updated. You can now return to NavLog.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update your PIN.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-2xl font-semibold text-zinc-950">Reset your NavLog PIN</h1>
      {!ready ? <p className="mt-4 text-sm text-zinc-500">Checking your reset link…</p> : hasSession ? (
        <form onSubmit={(event) => void updatePassword(event)} className="mt-6 space-y-3">
          <label className="block text-sm text-zinc-700">
            New 4-digit PIN
            <input type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3" />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Updating…" : "Update PIN"}</button>
        </form>
      ) : <p className="mt-4 text-sm text-zinc-600">The reset link is invalid or has expired. Request a new link from the NavLog sign-in panel.</p>}
      {message ? <p role="status" className="mt-4 text-sm text-zinc-700">{message}</p> : null}
      <Link href="/navlog" className="mt-6 inline-block text-sm text-zinc-700 underline underline-offset-2">Back to NavLog</Link>
    </main>
  );
}
