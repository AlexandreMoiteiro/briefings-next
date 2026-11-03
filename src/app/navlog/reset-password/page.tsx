"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ResetNavlogPasswordPage() {
  const [hasSession, setHasSession] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const [password, setPassword] = useState("");
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
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage(error.message);
    else {
      setPassword("");
      setMessage("Password updated. You can now return to NavLog.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-2xl font-semibold text-zinc-950">Reset NavLog password</h1>
      {!ready ? <p className="mt-4 text-sm text-zinc-500">Checking your reset link…</p> : hasSession ? (
        <form onSubmit={(event) => void updatePassword(event)} className="mt-6 space-y-3">
          <label className="block text-sm text-zinc-700">
            New password (at least 8 characters)
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3" />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Updating…" : "Update password"}</button>
        </form>
      ) : <p className="mt-4 text-sm text-zinc-600">The reset link is invalid or has expired. Request a new link from the NavLog sign-in panel.</p>}
      {message ? <p role="status" className="mt-4 text-sm text-zinc-700">{message}</p> : null}
      <Link href="/navlog" className="mt-6 inline-block text-sm text-zinc-700 underline underline-offset-2">Back to NavLog</Link>
    </main>
  );
}
