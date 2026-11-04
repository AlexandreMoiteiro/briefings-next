"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PinCodeInput } from "@/app/navlog/pin-code-input";

export function AdminLogin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}$/.test(code)) return;
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
      if (!response.ok) throw new Error("Código de administração incorreto. Tenta novamente.");
      setCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar sessão.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto my-20 max-w-sm rounded-2xl border border-zinc-200 bg-white px-6 py-9 shadow-sm sm:my-28 sm:px-8">
      <div className="mb-8 text-center">
        <p className="text-xl font-bold tracking-tight text-zinc-950">Briefings</p>
        <h1 className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Admin</h1>
      </div>
      <form onSubmit={signIn} autoComplete="off" className="space-y-5">
        <div className="flex justify-center"><PinCodeInput value={code} onChange={setCode} disabled={busy} label="Código" /></div>
        <button type="submit" disabled={busy || code.length !== 4}
          className="h-12 w-full rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "A entrar…" : "Entrar"}
        </button>
      </form>
      {error ? <p role="alert" className="mt-4 text-center text-xs text-red-700">{error}</p> : null}
    </main>
  );
}
