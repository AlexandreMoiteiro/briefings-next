"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { PinCodeInput } from "../pin-code-input";

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
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[0.17em] text-zinc-500">Briefings · NavLog</p>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-950">Choose a new PIN</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">Use four numbers to protect your saved routes.</p>
      {!ready ? <p className="mt-4 text-sm text-zinc-500">Checking your reset link…</p> : hasSession ? (
        <form onSubmit={(event) => void updatePassword(event)} className="mt-6 space-y-5">
          <PinCodeInput value={pin} onChange={setPin} label="New 4-digit PIN" disabled={busy} />
          <button type="submit" disabled={busy || pin.length !== 4} className="h-12 w-full rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Updating…" : "Save new PIN"}</button>
        </form>
      ) : <p className="mt-4 text-sm text-zinc-600">The reset link is invalid or has expired. Request a new link from the NavLog sign-in panel.</p>}
      {message ? <p role="status" className="mt-4 text-sm text-zinc-700">{message}</p> : null}
      <Link href="/navlog" className="mt-6 inline-block text-sm font-semibold text-zinc-700 underline underline-offset-2">← Back to NavLog</Link>
      </div>
    </main>
  );
}
