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
      if (!response.ok) throw new Error("Código de administração incorreto. Tenta novamente.");
      setCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar sessão.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto my-16 max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-950/5 sm:my-24">
      <div className="bg-zinc-950 px-7 py-8 text-white sm:px-9">
        <p className="text-xl font-bold tracking-tight">Briefings</p>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">Administração</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Acesso à administração</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Área reservada para a gestão de rotas, pilotos e funcionamento da plataforma.</p>
      </div>
      <div className="px-7 py-8 sm:px-9">
      <form onSubmit={signIn} autoComplete="off" className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-zinc-800">Código de administração</span>
          <input value={code} onChange={event => setCode(event.target.value)}
            type="password" autoComplete="off" required
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            placeholder="Introduz o teu código" />
        </label>
        <button type="submit" disabled={busy}
          className="h-12 w-full rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "A entrar…" : "Entrar na consola"}
        </button>
      </form>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <p className="mt-6 text-center text-xs text-zinc-500">Sessão privada · Acesso restrito</p>
      </div>
    </main>
  );
}
