"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type RouteRow = { id: string; is_default: boolean; category: "VFR" | "IFR" | null };
type AccountRow = { user_id: string; email_confirmed_at: string | null; route_count: number };
type UsageRow = { id: string; created_at: string; title: string | null; module: string; event_type: string };
type PageOpen = { day: string; meteorology: number; notam_map: number };
type MessageRow = { id: string; status: string };
type Summary = { routes: RouteRow[]; accounts: AccountRow[]; feedback: MessageRow[]; unblock: MessageRow[]; events: UsageRow[]; pageOpens: PageOpen[] };

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AdminOverview() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [routesResponse, accountsResponse, messagesResponse, activityResponse] = await Promise.all([
        fetch("/api/admin/navlog-routes", { cache: "no-store" }),
        fetch("/api/admin/accounts", { cache: "no-store" }),
        fetch("/api/admin/messages", { cache: "no-store" }),
        fetch("/api/admin/session", { cache: "no-store" }),
      ]);
      if ([routesResponse, accountsResponse, messagesResponse, activityResponse].some((response) => !response.ok)) {
        throw new Error("Não foi possível carregar todos os dados. Verifica a sessão e tenta atualizar.");
      }
      const [routeData, accountData, messageData, activityData] = await Promise.all([
        routesResponse.json() as Promise<{ routes: RouteRow[] }>,
        accountsResponse.json() as Promise<{ accounts: AccountRow[] }>,
        messagesResponse.json() as Promise<{ feedback: MessageRow[]; unblock: MessageRow[] }>,
        activityResponse.json() as Promise<{ rows: UsageRow[]; pageOpens: PageOpen[] }>,
      ]);
      setData({ routes: routeData.routes ?? [], accounts: accountData.accounts ?? [], feedback: messageData.feedback ?? [], unblock: messageData.unblock ?? [], events: activityData.rows ?? [], pageOpens: activityData.pageOpens ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const publicRoutes = data?.routes ?? [];
  const pilots = data?.accounts ?? [];
  const featured = publicRoutes.filter((route) => route.is_default).length;
  const pendingRoutes = publicRoutes.length - featured;
  const pendingEmails = pilots.filter((account) => !account.email_confirmed_at).length;
  const pendingMessages = (data?.feedback ?? []).filter((message) => message.status === "open").length + (data?.unblock ?? []).filter((message) => message.status === "open").length;
  const privateRoutes = pilots.reduce((sum, pilot) => sum + (Number(pilot.route_count) || 0), 0);
  const recent = (data?.events ?? []).filter((event) => !["meteorology_open", "notam_map_open"].includes(event.event_type)).slice(0, 5);
  const today = data?.pageOpens?.[0];

  const metrics = [
    { label: "Rotas públicas", value: publicRoutes.length, detail: `${featured} selecionadas para o NavLog` },
    { label: "Contas de pilotos", value: pilots.length, detail: `${pendingEmails} a confirmar o e-mail` },
    { label: "Rotas privadas", value: privateRoutes, detail: "Guardadas pelos pilotos" },
    { label: "Pedidos por tratar", value: pendingMessages, detail: "Mensagens e desbloqueios" },
  ];

  const tasks = [
    { href: "/admin/navlog-routes", title: "Biblioteca de rotas", detail: "Editar, selecionar e eliminar rotas públicas. Consultar os trajetos no mapa.", count: `${pendingRoutes} por rever`, action: "Gerir rotas" },
    { href: "/admin/accounts", title: "Contas de pilotos", detail: "Gerir usernames, consultar rotas pessoais e eliminar contas ou rotas específicas.", count: `${pilots.length} pilotos`, action: "Gerir contas" },
    { href: "/admin/messages", title: "Mensagens e pedidos", detail: "Uma única caixa de entrada para questões, sugestões e pedidos de desbloqueio.", count: `${pendingMessages} pendentes`, action: "Abrir caixa de entrada" },
    { href: "/admin/ip-bans", title: "Acessos e bloqueios", detail: "Consultar acessos de exportação e gerir bloqueios por dispositivo ou rede.", count: "Permissões", action: "Gerir acessos" },
  ];

  return (
    <main className="mx-auto max-w-[1360px] space-y-7 px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Administração do Briefings</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Visão geral</h1><p className="mt-2 text-sm text-zinc-600">Resumo real dos registos e acesso às tarefas de gestão.</p></div>
        <button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">{loading ? "A atualizar…" : "Atualizar dados"}</button>
      </header>

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => <div key={metric.label} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5"><p className="text-xs font-medium text-zinc-500">{metric.label}</p><p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-zinc-950">{loading && !data ? "—" : metric.value}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{metric.detail}</p></div>)}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-950">Gestão</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map((task) => <Link key={task.href} href={task.href} className="group flex min-h-40 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 hover:bg-zinc-50">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-semibold text-zinc-950">{task.title}</h3><p className="mt-2 max-w-md text-sm leading-6 text-zinc-600">{task.detail}</p></div><span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-600">{loading && !data ? "…" : task.count}</span></div>
            <span className="mt-5 text-sm font-semibold text-zinc-950 group-hover:underline">{task.action} →</span>
          </Link>)}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-zinc-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-zinc-950">Atividade recente</h2><Link href="/admin/analytics" className="text-xs font-semibold text-zinc-700 underline underline-offset-4">Ver tudo</Link></div>
          {recent.length ? <div className="mt-3 divide-y divide-zinc-100">{recent.map((row) => <div key={row.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-900">{row.title || row.event_type}</p><p className="mt-1 text-xs text-zinc-500">{row.module}</p></div><time className="shrink-0 text-xs text-zinc-500">{formatDate(row.created_at)}</time></div>)}</div> : <p className="py-9 text-sm text-zinc-500">{loading ? "A carregar…" : "Sem atividade recente."}</p>}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="text-base font-semibold text-zinc-950">Aberturas de páginas hoje</h2><p className="mt-1 text-xs text-zinc-500">Não representam visitantes únicos.</p><div className="mt-5 divide-y divide-zinc-100"><div className="flex justify-between py-4 text-sm"><span>Meteorologia</span><strong className="tabular-nums">{today?.meteorology ?? "—"}</strong></div><div className="flex justify-between py-4 text-sm"><span>NOTAM Map</span><strong className="tabular-nums">{today?.notam_map ?? "—"}</strong></div></div><Link href="/admin/analytics" className="mt-4 inline-block text-sm font-semibold text-zinc-700 underline underline-offset-4">Analisar atividade</Link></div>
      </section>
    </main>
  );
}
