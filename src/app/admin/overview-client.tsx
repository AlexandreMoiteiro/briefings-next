"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type RouteRow = { id: string; is_default: boolean; category: "VFR" | "IFR" | null };
type AccountRow = { user_id: string; email_confirmed_at: string | null };
type UsageRow = { id: string; created_at: string; title: string | null; module: string; event_type: string };
type PageOpen = { day: string; meteorology: number; notam_map: number };

type OverviewData = {
  routes: RouteRow[];
  accounts: AccountRow[];
  events: UsageRow[];
  pageOpens: PageOpen[];
};

const shortcuts = [
  { label: "Biblioteca de rotas", description: "Escolher as rotas Briefings, classificar VFR/IFR, corrigir pontos e confirmar o percurso no mapa.", href: "/admin/navlog-routes", action: "Gerir rotas" },
  { label: "Contas de pilotos", description: "Consultar utilizadores, e-mails, acessos e rotas privadas guardadas; corrigir usernames.", href: "/admin/accounts", action: "Gerir contas" },
  { label: "Mensagens", description: "Ler as mensagens e sugestões recebidas através do website.", href: "/admin/messages", action: "Ver mensagens" },
  { label: "Pedidos de desbloqueio", description: "Consultar pedidos de acesso enviados pelos visitantes.", href: "/admin/unblock-requests", action: "Ver pedidos" },
] as const;

function displayDate(value: string) {
  return new Date(value).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/admin/navlog-routes", { cache: "no-store" }),
        fetch("/api/admin/accounts", { cache: "no-store" }),
        fetch("/api/admin/session", { cache: "no-store" }),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error("Não foi possível obter todos os dados do Admin. Tenta atualizar.");
      const [routes, accounts, usage] = await Promise.all(responses.map((response) => response.json())) as [
        { routes: RouteRow[] }, { accounts: AccountRow[] }, { rows: UsageRow[]; pageOpens: PageOpen[] }
      ];
      setData({ routes: routes.routes ?? [], accounts: accounts.accounts ?? [], events: usage.rows ?? [], pageOpens: usage.pageOpens ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro a carregar os dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const routes = data?.routes ?? [];
  const featured = routes.filter((route) => route.is_default).length;
  const accounts = data?.accounts ?? [];
  const recent = (data?.events ?? []).filter((row) => !["meteorology_open", "notam_map_open"].includes(row.event_type)).slice(0, 6);
  const today = data?.pageOpens?.[0];

  return (
    <main className="mx-auto max-w-[1250px] space-y-7 px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Centro de gestão</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Visão geral</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Tudo o que precisas para administrar o Briefings, organizado por tarefa.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
          {loading ? "A atualizar…" : "Atualizar dados"}
        </button>
      </header>

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</div> : null}

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {([
          ["Rotas Briefings", featured, "Selecionadas para o NavLog"],
          ["Rotas por rever", Math.max(0, routes.length - featured), "Ainda sem validação de autoria"],
          ["Contas de pilotos", accounts.length, "Registos na plataforma"],
          ["E-mails confirmados", accounts.filter((account) => account.email_confirmed_at).length, "Contas verificadas"],
        ] as const).map(([label, value, detail]) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-950">{loading && !data ? "—" : value}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
          </div>
        ))}
      </section>

      {data && featured === 0 && routes.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-300 bg-white px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900">As rotas Briefings ainda não estão selecionadas</p>
            <p className="mt-1 text-xs leading-5 text-zinc-600">Existem {routes.length} rotas antigas. Escolhe as que são realmente tuas antes de as apresentarmos como recomendadas.</p>
          </div>
          <Link href="/admin/navlog-routes" className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">Selecionar rotas</Link>
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950">Gestão</h2>
          <p className="text-xs text-zinc-500">Escolhe o que queres fazer</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {shortcuts.map((item) => (
            <Link key={item.href} href={item.href} className="group flex min-h-40 flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 hover:bg-zinc-50">
              <div><h3 className="text-base font-semibold text-zinc-950">{item.label}</h3><p className="mt-2 max-w-md text-sm leading-6 text-zinc-600">{item.description}</p></div>
              <span className="mt-4 text-sm font-semibold text-zinc-950 group-hover:underline">{item.action} <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold text-zinc-950">Atividade recente</h2><Link href="/admin/analytics" className="text-xs font-semibold text-zinc-700 underline underline-offset-4">Ver toda a atividade</Link></div>
          {recent.length ? <div className="divide-y divide-zinc-100">{recent.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="truncate font-medium text-zinc-900">{row.title || row.event_type}</p><p className="mt-0.5 text-xs text-zinc-500">{row.module}</p></div><time className="shrink-0 text-xs text-zinc-500">{displayDate(row.created_at)}</time></div>
          ))}</div> : <p className="py-8 text-sm text-zinc-500">{loading ? "A carregar atividade…" : "Ainda não há registos de atividade."}</p>}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-base font-semibold text-zinc-950">Visitas hoje</h2>
          <p className="mt-1 text-xs text-zinc-500">Aberturas de página, não visitantes únicos.</p>
          <div className="mt-5 divide-y divide-zinc-100">
            <div className="flex items-center justify-between py-4"><span className="text-sm text-zinc-700">Meteorologia</span><strong className="text-2xl font-semibold tabular-nums text-zinc-950">{today?.meteorology ?? "—"}</strong></div>
            <div className="flex items-center justify-between py-4"><span className="text-sm text-zinc-700">NOTAM Map</span><strong className="text-2xl font-semibold tabular-nums text-zinc-950">{today?.notam_map ?? "—"}</strong></div>
          </div>
          <Link href="/admin/analytics" className="mt-6 inline-block text-sm font-semibold text-zinc-950 underline underline-offset-4">Ver histórico e métricas</Link>
        </div>
      </section>
    </main>
  );
}
