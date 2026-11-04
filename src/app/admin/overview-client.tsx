"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type RouteRow = { id: string; is_default: boolean; category: "VFR" | "IFR" | null };
type AccountRow = { user_id: string; email_confirmed_at: string | null };
type UsageRow = { id: string; created_at: string; title: string | null; module: string; event_type: string };
type PageOpen = { day: string; meteorology: number; notam_map: number };
type OverviewData = { routes: RouteRow[]; accounts: AccountRow[]; events: UsageRow[]; pageOpens: PageOpen[] };

const destinations = [
  { number: "01", title: "Biblioteca NavLog", body: "Rever os percursos, editar pontos, organizar rotas VFR/IFR e eliminar rotas públicas.", href: "/admin/navlog-routes", action: "Gerir rotas" },
  { number: "02", title: "Contas de pilotos", body: "Pesquisar pilotos, confirmar registos, atualizar usernames e gerir a eliminação de contas.", href: "/admin/accounts", action: "Gerir contas" },
  { number: "03", title: "Mensagens", body: "Ler o feedback, questões e sugestões recebidos através do Briefings.", href: "/admin/messages", action: "Abrir mensagens" },
  { number: "04", title: "Pedidos de acesso", body: "Analisar e responder a pedidos de desbloqueio dos visitantes.", href: "/admin/unblock-requests", action: "Ver pedidos" },
] as const;

function dateTime(value: string) {
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
      if (responses.some((response) => !response.ok)) throw new Error("Não foi possível atualizar o painel. Verifica a sessão do Admin e tenta novamente.");
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
    const handle = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  const routes = data?.routes ?? [];
  const accounts = data?.accounts ?? [];
  const featured = routes.filter((route) => route.is_default).length;
  const verified = accounts.filter((account) => Boolean(account.email_confirmed_at)).length;
  const recent = (data?.events ?? []).filter((row) => !["meteorology_open", "notam_map_open"].includes(row.event_type)).slice(0, 5);
  const today = data?.pageOpens?.[0];
  const stats = [
    { title: "Rotas na biblioteca", value: routes.length, foot: `${featured} selecionadas`, accent: "text-[#176b4b]" },
    { title: "Pilotos registados", value: accounts.length, foot: `${verified} e-mails confirmados`, accent: "text-zinc-950" },
    { title: "Rotas a rever", value: Math.max(0, routes.length - featured), foot: "Aguardam seleção", accent: "text-zinc-950" },
    { title: "Visitas hoje", value: today ? today.meteorology + today.notam_map : 0, foot: "Meteorologia + NOTAM Map", accent: "text-zinc-950" },
  ];

  return (
    <main className="mx-auto max-w-[1360px] space-y-8 px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Briefings / Administração</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Centro de controlo</h1></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50">{loading ? "A sincronizar…" : "↻ Atualizar dados"}</button>
      </header>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}

      <section className="relative overflow-hidden rounded-3xl bg-[#17392a] px-6 py-8 text-white sm:px-9 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 size-80 rounded-full border-[45px] border-emerald-300/10" />
        <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Workspace privado</p><h2 className="mt-4 max-w-lg text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">O teu Briefings, organizado num só lugar.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/70">Consulta o estado da plataforma e acede diretamente às operações que precisam da tua atenção.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/admin/navlog-routes" className="rounded-xl bg-[#d6f4de] px-5 py-3 text-sm font-bold text-[#17392a] hover:bg-white">Gerir rotas ↗</Link><Link href="/admin/accounts" className="rounded-xl border border-emerald-200/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20">Gerir pilotos</Link></div>
        </div>
      </section>

      <section aria-label="Indicadores da plataforma" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((stat) => <div key={stat.title} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/30"><p className="text-xs font-medium text-zinc-500">{stat.title}</p><p className={`mt-3 text-4xl font-semibold tabular-nums tracking-tight ${stat.accent}`}>{loading && !data ? "—" : stat.value}</p><p className="mt-2 text-xs text-zinc-500">{stat.foot}</p></div>)}
      </section>

      {data && featured === 0 && routes.length > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4"><div><p className="text-sm font-semibold text-amber-950">As rotas Briefings ainda precisam de seleção</p><p className="mt-1 text-xs text-amber-800">Existem {routes.length} rotas públicas e nenhuma está marcada para destaque.</p></div><Link href="/admin/navlog-routes" className="rounded-lg bg-amber-950 px-4 py-2.5 text-sm font-semibold text-white">Rever biblioteca</Link></div> : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Acesso rápido</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">O que queres gerir?</h2></div><span className="hidden text-xs text-zinc-500 sm:block">As operações principais da consola</span></div>
        <div className="grid gap-3 md:grid-cols-2">
          {destinations.map((item) => <Link key={item.href} href={item.href} className="group flex min-h-44 flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-950/5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold text-zinc-950">{item.title}</h3><p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{item.body}</p></div><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-800">{item.number}</span></div><span className="mt-5 text-sm font-semibold text-[#176b4b] group-hover:underline">{item.action} ↗</span></Link>)}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold text-zinc-950">Atividade recente</h2><Link href="/admin/analytics" className="text-xs font-semibold text-emerald-700 hover:underline">Histórico completo ↗</Link></div>{recent.length ? <div className="divide-y divide-zinc-100">{recent.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 py-3.5"><div className="flex min-w-0 items-center gap-3"><span className="size-2 shrink-0 rounded-full bg-emerald-500" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-900">{row.title || row.event_type}</p><p className="mt-0.5 text-xs text-zinc-500">{row.module}</p></div></div><time className="shrink-0 text-xs text-zinc-500">{dateTime(row.created_at)}</time></div>)}</div> : <p className="py-10 text-sm text-zinc-500">{loading ? "A carregar atividade…" : "Ainda não há atividade registada."}</p>}</div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-zinc-950">Tráfego de hoje</h2><p className="mt-1 text-xs text-zinc-500">Aberturas de página, não visitantes únicos.</p><div className="mt-6 divide-y divide-zinc-100"><div className="flex items-center justify-between py-4"><span className="text-sm text-zinc-700">Meteorologia</span><strong className="text-2xl tabular-nums text-zinc-950">{today?.meteorology ?? "—"}</strong></div><div className="flex items-center justify-between py-4"><span className="text-sm text-zinc-700">NOTAM Map</span><strong className="text-2xl tabular-nums text-zinc-950">{today?.notam_map ?? "—"}</strong></div></div><Link href="/admin/analytics" className="mt-6 inline-block text-sm font-semibold text-emerald-700 hover:underline">Ver estatísticas ↗</Link></div>
      </section>
    </main>
  );
}
