"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PerfectRouteWaypointRaw } from "@/lib/navlog-saved-routes";

type Category = "VFR" | "IFR" | null;
type ManagedRoute = {
  id: string;
  name: string;
  description: string | null;
  route_text: string | null;
  waypoints: PerfectRouteWaypointRaw[];
  tags: string[] | null;
  source: string | null;
  category: Category;
  is_default: boolean;
};

function duplicateRoute(route: ManagedRoute): ManagedRoute {
  return { ...route, waypoints: route.waypoints.map((point) => ({ ...point })) };
}

const textInput = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 focus:border-zinc-900 focus:outline-none";

export function AdminNavlogRoutes() {
  const [routes, setRoutes] = useState<ManagedRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ManagedRoute | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "default" | "other">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadRoutes(selected?: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/navlog-routes", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar as rotas. Volta a iniciar sessão no Admin.");
      const result = await response.json() as { routes: ManagedRoute[] };
      setRoutes(result.routes);
      const nextId = selected ?? selectedId;
      const next = result.routes.find((route) => route.id === nextId);
      if (next) setDraft(duplicateRoute(next));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar rotas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/navlog-routes", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as rotas. Volta a iniciar sessão no Admin.");
        const result = await response.json() as { routes: ManagedRoute[] };
        if (active) setRoutes(result.routes);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Erro ao carregar rotas.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return routes.filter((route) =>
      (filter === "all" || (filter === "default") === route.is_default) &&
      (!needle || [route.name, route.route_text, route.description].some((part) => part?.toLocaleLowerCase().includes(needle)))
    );
  }, [routes, search, filter]);
  const totalDefaults = routes.filter((route) => route.is_default).length;
  const isDirty = draft && JSON.stringify(draft) !== JSON.stringify(routes.find((route) => route.id === selectedId));

  function chooseRoute(route: ManagedRoute) {
    if (isDirty && !window.confirm("Existem alterações por guardar. Queres descartá-las?")) return;
    setSelectedId(route.id);
    setDraft(duplicateRoute(route));
    setNotice("");
    setError("");
  }

  function changeWaypoint(index: number, changes: Partial<PerfectRouteWaypointRaw>) {
    setDraft((current) => current ? ({ ...current, waypoints: current.waypoints.map((point, i) => i === index ? { ...point, ...changes } : point) }) : current);
  }

  function moveWaypoint(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.waypoints];
      const other = index + direction;
      if (other < 0 || other >= next.length) return current;
      [next[index], next[other]] = [next[other], next[index]];
      return { ...current, waypoints: next };
    });
  }

  async function save() {
    if (!draft || saving) return;
    setNotice("");
    setError("");
    const original = routes.find((route) => route.id === draft.id);
    const waypointsChanged = JSON.stringify(draft.waypoints) !== JSON.stringify(original?.waypoints);
    if (!draft.name.trim() || draft.waypoints.length < 2 || draft.waypoints.length > 120 ||
        (waypointsChanged && draft.waypoints.some((point) => !/^[A-Za-z0-9]{1,16}$/.test(point.code ?? "") ||
          !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
          Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180))) {
      setError("Confirma o nome e os pontos da rota (códigos, latitudes e longitudes válidos).");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/navlog-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, waypoints: waypointsChanged ? draft.waypoints : null }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Falha ao guardar.");
      }
      await loadRoutes(draft.id);
      setNotice("Rota atualizada. A classificação já está disponível no NavLog.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin · NavLog</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">Gestão de rotas</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              Escolhe as rotas oficiais do Briefings, classifica-as em VFR ou IFR e corrige o percurso quando necessário.
            </p>
          </div>
          <nav aria-label="Admin" className="flex gap-2 text-sm">
            <Link href="/admin" className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100">Visão geral</Link>
            <span aria-current="page" className="rounded-lg bg-zinc-950 px-4 py-2 font-medium text-white">Rotas</span>
          </nav>
        </header>
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-700">
          <strong>{totalDefaults}</strong> rotas por defeito de <strong>{routes.length}</strong> públicas.
          Nenhuma das rotas antigas é atribuída a ti automaticamente: ativa a opção apenas nas que verificaste.
        </p>
        {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">{notice}</p> : null}
        <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <label htmlFor="route-search" className="block text-sm font-medium text-zinc-900">Encontrar rota</label>
            <input id="route-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, origem ou percurso" className={`${textInput} mt-2`} />
            <div className="mt-3 flex gap-2 text-xs">
              {([ ["all", "Todas"], ["default", "Por defeito"], ["other", "Outras"] ] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
                  className={`rounded-lg px-3 py-2 ${filter === value ? "bg-zinc-950 text-white" : "border border-zinc-200 text-zinc-600"}`}>{label}</button>
              ))}
            </div>
            <div className="mt-3 max-h-[65vh] overflow-y-auto border-t border-zinc-100">
              {loading ? <p className="p-3 text-sm text-zinc-500">A carregar…</p> : shown.length === 0 ? <p className="p-3 text-sm text-zinc-500">Sem resultados.</p> : shown.map((route) => (
                <button key={route.id} type="button" onClick={() => chooseRoute(route)} aria-pressed={selectedId === route.id}
                  className={`block w-full border-b border-zinc-100 px-3 py-3 text-left hover:bg-zinc-50 ${selectedId === route.id ? "bg-zinc-100" : ""}`}>
                  <span className="block truncate text-sm font-medium text-zinc-900">{route.name}</span>
                  <span className="mt-1 block text-xs text-zinc-500">{route.waypoints.length} pontos {route.category ? `· ${route.category}` : ""}{route.is_default ? " · Por defeito" : ""}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
            {!draft ? <p className="py-12 text-center text-sm text-zinc-500">Seleciona uma rota à esquerda para a editar.</p> : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="text-lg font-semibold text-zinc-950">Editar rota</h2><p className="mt-1 text-xs text-zinc-500">As alterações só são aplicadas quando guardares.</p></div>
                  <button type="button" disabled={!isDirty || saving} onClick={() => void save()} className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? "A guardar…" : "Guardar"}</button>
                </div>
                <label className="block text-sm font-medium text-zinc-700">Nome
                  <input value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`${textInput} mt-1`} />
                </label>
                <label className="block text-sm font-medium text-zinc-700">Descrição
                  <textarea value={draft.description ?? ""} maxLength={1000} rows={2} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${textInput} mt-1`} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-zinc-700">Tipo de voo
                    <select value={draft.category ?? ""} onChange={(event) => setDraft({ ...draft, category: (event.target.value || null) as Category })} className={`${textInput} mt-1`}>
                      <option value="">Por classificar</option><option value="VFR">VFR</option><option value="IFR">IFR</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm font-medium text-zinc-800">
                    <input type="checkbox" checked={draft.is_default} onChange={(event) => setDraft({ ...draft, is_default: event.target.checked })} className="size-4 accent-zinc-900" />
                    Rota por defeito do Briefings
                  </label>
                </div>
                <p className="text-xs leading-5 text-zinc-500">Marca «por defeito» apenas nas rotas que reconheces e queres recomendar aos utilizadores. Uma rota selecionada nunca substitui a verificação operacional antes do voo.</p>
                <details className="rounded-xl border border-zinc-200 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Editar percurso ({draft.waypoints.length} pontos)</summary>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">Mantém a ordem correta dos pontos e as coordenadas em graus decimais. O sistema conserva os restantes dados técnicos. Algumas rotas antigas não têm códigos dos pontos: preenche-os apenas se alterares o percurso.</p>
                  <div className="mt-4 space-y-3">
                    {draft.waypoints.map((point, index) => (
                      <div key={`${draft.id}-${index}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-zinc-500">Ponto {index + 1}</span>
                          <div className="flex gap-1">
                            <button type="button" disabled={index === 0} onClick={() => moveWaypoint(index, -1)} aria-label={`Subir ponto ${index + 1}`} className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs disabled:opacity-30">↑</button>
                            <button type="button" disabled={index === draft.waypoints.length - 1} onClick={() => moveWaypoint(index, 1)} aria-label={`Descer ponto ${index + 1}`} className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs disabled:opacity-30">↓</button>
                            <button type="button" disabled={draft.waypoints.length <= 2} onClick={() => setDraft({ ...draft, waypoints: draft.waypoints.filter((_, i) => i !== index) })} className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs disabled:opacity-30">Remover</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <label className="text-xs text-zinc-600">Código<input value={point.code ?? ""} maxLength={16} onChange={(event) => changeWaypoint(index, { code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className={`${textInput} mt-1`} /></label>
                          <label className="text-xs text-zinc-600">Nome<input value={point.name ?? ""} onChange={(event) => changeWaypoint(index, { name: event.target.value })} className={`${textInput} mt-1`} /></label>
                          <label className="text-xs text-zinc-600">Latitude<input type="number" step="any" min={-90} max={90} value={point.lat} onChange={(event) => changeWaypoint(index, { lat: event.target.value === "" ? NaN : Number(event.target.value) })} className={`${textInput} mt-1`} /></label>
                          <label className="text-xs text-zinc-600">Longitude<input type="number" step="any" min={-180} max={180} value={point.lon} onChange={(event) => changeWaypoint(index, { lon: event.target.value === "" ? NaN : Number(event.target.value) })} className={`${textInput} mt-1`} /></label>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <label className="text-xs text-zinc-600">Altitude (ft)<input type="number" value={point.alt ?? ""} onChange={(event) => changeWaypoint(index, { alt: event.target.value === "" ? undefined : Number(event.target.value) })} className={`${textInput} mt-1`} /></label>
                          <label className="text-xs text-zinc-600">Tipo<select value={point.src ?? "VFR"} onChange={(event) => changeWaypoint(index, { src: event.target.value })} className={`${textInput} mt-1`}><option value="VFR">VFR</option><option value="IFR">IFR</option><option value="AD">Aeródromo</option><option value="VOR">VOR</option><option value="PROC">Procedimento</option></select></label>
                          <label className="text-xs text-zinc-600">Notas<input value={point.remarks ?? ""} onChange={(event) => changeWaypoint(index, { remarks: event.target.value })} className={`${textInput} mt-1`} /></label>
                        </div>
                      </div>
                    ))}
                    <button type="button" disabled={draft.waypoints.length >= 120} onClick={() => setDraft({ ...draft, waypoints: [...draft.waypoints, { code: "WP", name: "Waypoint", lat: 0, lon: 0, src: "VFR" }] })} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-30">Adicionar ponto</button>
                  </div>
                </details>
                <button type="button" disabled={!isDirty || saving} onClick={() => void save()} className="w-full rounded-lg bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "A guardar…" : "Guardar alterações"}</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
