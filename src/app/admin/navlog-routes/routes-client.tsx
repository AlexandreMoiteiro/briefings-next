"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { NavlogPointPicker } from "@/components/navlog-point-picker";
import { loadAllNavlogData } from "@/lib/navlog-data";
import { gcDistanceNm, makeWaypointFromPoint, parseRouteText } from "@/lib/navlog-engine";
import { displayRouteCategory } from "@/lib/navlog-route-category";
import { navlogDefaultSetup, type NavlogDataBundle, type NavlogPoint } from "@/lib/navlog";
import { routeWaypointsToPerfectRouteRaw, type PerfectRouteWaypointRaw } from "@/lib/navlog-saved-routes";
import { AdminWaypointInspector } from "./admin-waypoint-inspector";

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

const AdminRouteMap = dynamic(
  () => import("./admin-route-map").then((module) => module.AdminRouteMap),
  { ssr: false, loading: () => <div className="flex h-[310px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">A carregar mapa…</div> }
);

export function AdminNavlogRoutes() {
  const [routes, setRoutes] = useState<ManagedRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ManagedRoute | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "default" | "other">("default");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "VFR" | "IFR" | "none">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [navlogData, setNavlogData] = useState<NavlogDataBundle | null>(null);
  const [catalogueError, setCatalogueError] = useState("");
  const [routeInput, setRouteInput] = useState("");
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [addAltitude, setAddAltitude] = useState(3000);
  const [mapAddEnabled, setMapAddEnabled] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeWaypointIndex, setActiveWaypointIndex] = useState(0);

  async function loadRoutes(selected?: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/navlog-routes", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar as rotas. Volta a iniciar sessão no Admin.");
      const result = await response.json() as { routes: ManagedRoute[] };
      setRoutes(result.routes);
      const nextId = selected ?? selectedId;
      const next = result.routes.find((route) => route.id === nextId) ?? result.routes[0];
      if (next) { setSelectedId(next.id); setDraft(duplicateRoute(next)); }
      else { setSelectedId(null); setDraft(null); }
      setDeleteOpen(false);
      setDeleteConfirmation("");
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
        if (active) {
          setRoutes(result.routes);
          if (result.routes.length > 0) {
            setSelectedId(result.routes[0].id);
            setDraft(duplicateRoute(result.routes[0]));
          }
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Erro ao carregar rotas.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void loadAllNavlogData()
      .then((data) => { if (active) setNavlogData(data); })
      .catch(() => { if (active) setCatalogueError("A pesquisa de pontos está indisponível. Ainda podes editar manualmente."); });
    return () => { active = false; };
  }, []);

  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return routes.filter((route) =>
      (filter === "all" || (filter === "default") === route.is_default) &&
      (categoryFilter === "all" || (categoryFilter === "none" ? !route.category : route.category === categoryFilter)) &&
      (!needle || [route.name, route.route_text, route.description].some((part) => part?.toLocaleLowerCase().includes(needle)))
    );
  }, [routes, search, filter, categoryFilter]);
  const draftWaypoints = draft?.waypoints;
  const legDistances = useMemo(() => draftWaypoints?.map((point, index) => {
    const previous = draftWaypoints[index - 1];
    if (!previous || ![point.lat, point.lon, previous.lat, previous.lon].every(Number.isFinite)) return 0;
    return gcDistanceNm(previous.lat, previous.lon, point.lat, point.lon);
  }) ?? [], [draftWaypoints]);
  const routeDistanceNm = legDistances.reduce((sum, value) => sum + value, 0);
  const totalDefaults = routes.filter((route) => route.is_default).length;
  const countVfr = routes.filter((route) => route.category === "VFR").length;
  const countIfr = routes.filter((route) => route.category === "IFR").length;
  const unclassifiedDefaults = routes.filter((route) => route.is_default && !route.category).length;
  const isDirty = draft && JSON.stringify(draft) !== JSON.stringify(routes.find((route) => route.id === selectedId));

  function chooseRoute(route: ManagedRoute) {
    if (isDirty && !window.confirm("Existem alterações por guardar. Queres descartá-las?")) return;
    setSelectedId(route.id);
    setDraft(duplicateRoute(route));
    setNotice("");
    setError("");
    setDeleteOpen(false);
    setDeleteConfirmation("");
    setActiveWaypointIndex(0);
    setRouteInput("");
    setRouteWarnings([]);
    setMapAddEnabled(false);
    setInsertAt(null);
    setDraggedIndex(null);
  }

  function discardChanges() {
    const original = routes.find((route) => route.id === selectedId);
    if (!original) return;
    setDraft(duplicateRoute(original));
    setError("");
    setNotice("Alterações locais descartadas.");
  }

  function refreshList() {
    if (isDirty && !window.confirm("Atualizar a lista e descartar as alterações que ainda não guardaste?")) return;
    void loadRoutes(selectedId ?? undefined);
  }

  async function deleteRoute() {
    const original = routes.find((route) => route.id === selectedId);
    if (!original || deleteConfirmation !== original.name || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/navlog-routes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: original.id, confirm_name: deleteConfirmation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível eliminar a rota.");
      const remaining = routes.filter((route) => route.id !== original.id);
      setRoutes(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setDraft(remaining[0] ? duplicateRoute(remaining[0]) : null);
      setDeleteOpen(false);
      setDeleteConfirmation("");
      setNotice(`A rota «${original.name}» foi eliminada da biblioteca.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível eliminar esta rota.");
    } finally {
      setSaving(false);
    }
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
    setActiveWaypointIndex(index + direction);
  }

  function reorderWaypoint(from: number, to: number) {
    if (from === to) return;
    setDraft((current) => {
      if (!current || from < 0 || to < 0 || from >= current.waypoints.length || to >= current.waypoints.length) return current;
      const waypoints = [...current.waypoints];
      const [moving] = waypoints.splice(from, 1);
      waypoints.splice(to, 0, moving);
      return { ...current, waypoints };
    });
    setActiveWaypointIndex((index) => index === from ? to : from < to && index > from && index <= to ? index - 1 : from > to && index >= to && index < from ? index + 1 : index);
  }

  function removeWaypoint(index: number) {
    if (!draft || draft.waypoints.length <= 2) return;
    setDraft({ ...draft, waypoints: draft.waypoints.filter((_, i) => i !== index) });
    setActiveWaypointIndex((current) => Math.min(current > index ? current - 1 : current, draft.waypoints.length - 2));
  }

  function movePointOnMap(index: number, lat: number, lon: number) {
    changeWaypoint(index, { lat, lon });
    setNotice("Coordenadas atualizadas no rascunho. Confirma e guarda antes de sair.");
  }

  function addPoint(point: NavlogPoint) {
    if (!draft || draft.waypoints.length >= 120) {
      setError("O percurso pode ter no máximo 120 pontos.");
      return;
    }
    const [raw] = routeWaypointsToPerfectRouteRaw([makeWaypointFromPoint(point, navlogDefaultSetup, addAltitude)]);
    const at = insertAt === null ? draft.waypoints.length : Math.min(insertAt, draft.waypoints.length);
    const waypoints = [...draft.waypoints];
    waypoints.splice(at, 0, raw);
    setDraft({ ...draft, waypoints });
    setActiveWaypointIndex(at);
    if (insertAt !== null) setInsertAt(at + 1);
    setError("");
    setNotice(`${point.code} adicionado ao percurso. Guarda para publicar a alteração.`);
  }

  function addMapPoint(lat: number, lon: number) {
    if (!draft) return;
    const index = draft.waypoints.length + 1;
    addPoint({ code: `MAP${String(index).padStart(2, "0")}`, name: "Ponto no mapa", lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), alt: addAltitude, src: "VFR", routes: "", remarks: "Adicionado no Admin" });
  }

  function applyRouteInput(mode: "replace" | "append") {
    if (!draft || !navlogData || !routeInput.trim()) return;
    const result = parseRouteText(routeInput, navlogData, navlogDefaultSetup, addAltitude);
    const warnings = result.warnings.map((warning) => warning.replace("Could not find point for:", "Ponto não encontrado:"));
    setRouteWarnings(warnings);
    if (warnings.length > 0 || result.waypoints.length === 0) {
      setError("Corrige os pontos não reconhecidos antes de aplicar a rota. Nada foi alterado.");
      return;
    }
    const incoming = routeWaypointsToPerfectRouteRaw(result.waypoints);
    const next = [...draft.waypoints];
    if (mode === "replace") next.splice(0, next.length, ...incoming);
    else next.splice(insertAt === null ? next.length : Math.min(insertAt, next.length), 0, ...incoming);
    if (next.length < 2 || next.length > 120) {
      setError("O percurso tem de ter entre 2 e 120 pontos.");
      return;
    }
    setDraft({ ...draft, waypoints: next });
    setActiveWaypointIndex(mode === "replace" ? 0 : Math.min(next.length - 1, insertAt ?? draft.waypoints.length));
    setInsertAt(null);
    setRouteInput("");
    setRouteWarnings([]);
    setError("");
    setNotice(`${incoming.length} pontos ${mode === "replace" ? "colocados no novo percurso" : "adicionados ao percurso"}. Guarda para publicar.`);
  }

  async function toggleDefault(route: ManagedRoute) {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/navlog-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...route, is_default: !route.is_default, waypoints: null, description: route.description ?? "" }),
      });
      if (!response.ok) throw new Error("Não foi possível alterar a classificação.");
      setRoutes((current) => current.map((item) => item.id === route.id ? { ...item, is_default: !route.is_default } : item));
      if (draft?.id === route.id) setDraft((current) => current ? { ...current, is_default: !route.is_default } : current);
      setNotice(`«${route.name}» ${route.is_default ? "removida das" : "adicionada às"} rotas por defeito.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a rota.");
    } finally {
      setSaving(false);
    }
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

  const selectedWaypointIndex = Math.min(activeWaypointIndex, Math.max(0, (draft?.waypoints.length ?? 1) - 1));

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">NavLog / Biblioteca</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Gestão de rotas</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              Constrói e atualiza os percursos das Default routes. Só ficam públicos depois de guardares.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={loading || saving} onClick={refreshList} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">{loading ? "A carregar…" : "Atualizar biblioteca"}</button>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([
            ["Rotas públicas", routes.length],
            ["Default routes", totalDefaults],
            ["VFR", countVfr],
            ["IFR", countIfr],
          ] as const).map(([label, count]) => (
            <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm shadow-zinc-200/30">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-950">{loading && !routes.length ? "—" : count}</p>
            </div>
          ))}
        </div>
        {unclassifiedDefaults > 0 ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <strong>{unclassifiedDefaults} Default routes sem categoria guardada.</strong> No NavLog, os títulos podem sugerir VFR/IFR para apresentação; aqui seleciona a classificação correta em cada rota e guarda-a para a fixar definitivamente.
        </p> : null}
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-xs leading-5 text-zinc-600">
          Seleciona uma rota, altera o percurso como no NavLog e confirma o resultado no mapa antes de guardar. As alterações guardadas são partilhadas com o website.
        </div>
        {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">{notice}</p> : null}
        <div className="grid grid-cols-1 items-start gap-5">
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/30 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-zinc-950">Biblioteca</h2>
              <span className="text-xs tabular-nums text-zinc-500">{shown.length} de {routes.length}</span>
            </div>
            <label htmlFor="route-search" className="sr-only">Encontrar rota</label>
            <input id="route-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar rota ou waypoint…" className={`${textInput} max-w-lg`} />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {([ ["all", "Todas"], ["default", "Por defeito"], ["other", "Outras"] ] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
                  className={`rounded-lg px-3 py-2 ${filter === value ? "bg-zinc-950 text-white" : "border border-zinc-200 text-zinc-600"}`}>{label}</button>
              ))}
            </div>
            <label className="mt-3 flex max-w-xs items-center justify-between gap-2 text-xs font-medium text-zinc-600">
              Tipo de voo
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)} className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-800">
                <option value="all">Todos</option><option value="VFR">VFR</option><option value="IFR">IFR</option><option value="none">Por classificar</option>
              </select>
            </label>
            <div className="mt-3 grid max-h-[285px] gap-2 overflow-y-auto border-t border-zinc-100 pt-3 sm:grid-cols-2 xl:grid-cols-3">
              {loading ? <p className="p-3 text-sm text-zinc-500">A carregar…</p> : shown.length === 0 ? <p className="p-3 text-sm text-zinc-500">Sem resultados.</p> : shown.map((route) => (
                <div key={route.id} className={`flex items-center gap-1 rounded-xl border pr-2 ${selectedId === route.id ? "border-sky-300 bg-sky-50" : "border-zinc-200 bg-white"}`}>
                  <button type="button" onClick={() => chooseRoute(route)} aria-pressed={selectedId === route.id}
                    className="min-w-0 flex-1 px-3 py-3 text-left hover:bg-zinc-50">
                    <span className="block truncate text-sm font-bold text-zinc-900">{route.name}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">{route.waypoints.length} pontos {route.category ? `· ${route.category}` : "· Sem tipo"} · {route.waypoints[0]?.code ?? "?"} → {route.waypoints.at(-1)?.code ?? "?"}</span>
                  </button>
                  <button type="button" onClick={() => void toggleDefault(route)} disabled={saving}
                    title={route.is_default ? "Remover das Default routes" : "Marcar como Default route"}
                    aria-label={`${route.is_default ? "Desmarcar" : "Marcar"} ${route.name} como Default route`}
                    aria-pressed={route.is_default}
                    className={`shrink-0 rounded-lg px-2.5 py-2 text-lg disabled:opacity-30 ${route.is_default ? "text-zinc-950" : "text-zinc-300 hover:text-zinc-700"}`}>
                    {route.is_default ? "★" : "☆"}
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">★ Default route · ☆ Fora da seleção por defeito</p>
          </section>
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/30 sm:p-6">
            {!draft ? <p className="py-12 text-center text-sm text-zinc-500">Seleciona uma rota para veres o percurso num mapa e editares os dados.</p> : (
              <div className="space-y-5">
                <div className="sticky top-2 z-20 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
                  <div className="min-w-56 flex-1">
                    <label htmlFor="admin-edit-route-name" className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Nome da rota</label>
                    <input id="admin-edit-route-name" value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      className="mt-1 w-full rounded-md border border-transparent bg-zinc-50 px-2 py-1.5 text-lg font-bold text-zinc-950 outline-none focus:border-sky-500" />
                    <p className="mt-1 text-xs text-zinc-500">{draft.category ?? "Por classificar"} · {draft.is_default ? "Default route" : "Fora das defaults"} · {isDirty ? "● Rascunho por guardar" : "Sem alterações"}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {isDirty ? <button type="button" onClick={discardChanges} disabled={saving} className="rounded-lg border border-zinc-300 px-3 py-2.5 text-xs font-semibold text-zinc-700 disabled:opacity-40">Descartar</button> : null}
                    <button type="button" onClick={() => { setDeleteOpen((open) => !open); setDeleteConfirmation(""); }} className="rounded-lg border border-zinc-300 px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:border-red-300 hover:text-red-700">{deleteOpen ? "Cancelar" : "Eliminar…"}</button>
                    <button type="button" disabled={!isDirty || saving} onClick={() => void save()} className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? "A guardar…" : "Guardar"}</button>
                  </div>
                </div>
                {deleteOpen ? <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-900">Eliminar esta rota pública</p>
                  <p className="mt-1 text-xs leading-5 text-red-800">Esta ação é permanente e não afeta rotas privadas. Para continuar, escreve exatamente <strong>{routes.find((route) => route.id === selectedId)?.name}</strong>.</p>
                  <label className="mt-3 block text-xs font-medium text-red-900">Nome da rota
                    <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" className={`${textInput} mt-1.5 border-red-200`} placeholder="Nome exato da rota" />
                  </label>
                  <button type="button" disabled={saving || deleteConfirmation !== routes.find((route) => route.id === selectedId)?.name} onClick={() => void deleteRoute()} className="mt-3 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? "A eliminar…" : "Eliminar definitivamente"}</button>
                </div> : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  {([
                    ["Distância total", `${routeDistanceNm.toFixed(1)} NM`],
                    ["Pontos do percurso", String(draft.waypoints.length)],
                    ["Destino previsto", draft.waypoints.find((point) => point.alternate_marker)?.code ?? draft.waypoints.at(-1)?.code ?? "—"],
                  ] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-zinc-950">{value}</p></div>)}
                </div>
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
                <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-950">Construir o percurso</h3>
                      <p className="mt-1 text-xs text-zinc-600">Pesquisa pontos aeronáuticos ou escreve uma rota, tal como no NavLog.</p>
                    </div>
                    <label className="text-xs font-medium text-zinc-600">Altitude dos novos pontos (ft)
                      <input type="number" min={0} max={60000} step={100} value={addAltitude} onChange={(event) => setAddAltitude(Number(event.target.value))}
                        className={`${textInput} mt-1 w-32`} />
                    </label>
                  </div>
                  <div>
                    <label htmlFor="admin-insert-at" className="text-xs font-semibold text-zinc-700">Posição dos novos pontos</label>
                    <select id="admin-insert-at" value={insertAt === null ? "end" : String(insertAt)} onChange={(event) => setInsertAt(event.target.value === "end" ? null : Number(event.target.value))}
                      className={`${textInput} mt-1.5`}>
                      <option value="end">Adicionar no fim do percurso</option>
                      {draft.waypoints.map((point, i) => <option key={`${draft.id}-${i}`} value={i + 1}>Depois de {i + 1}. {point.code || point.name || "WP"}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-zinc-700">Pesquisar e adicionar ponto</p>
                    <NavlogPointPicker points={navlogData?.points ?? []} onAdd={addPoint} language="pt"
                      placeholder={navlogData ? "ICAO, VOR, fix ou nome…" : "A carregar pontos aeronáuticos…"}
                      disabled={!navlogData || saving || draft.waypoints.length >= 120} />
                    {catalogueError ? <p className="mt-2 text-xs text-amber-800">{catalogueError}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="admin-route-input" className="text-xs font-semibold text-zinc-700">Introduzir percurso por códigos</label>
                    <textarea id="admin-route-input" value={routeInput} onChange={(event) => setRouteInput(event.target.value)}
                      placeholder="LPSO NSA MAGUM PORCA…" rows={2} className={`${textInput} mt-1.5 resize-y`} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => applyRouteInput("replace")} disabled={!navlogData || !routeInput.trim() || saving}
                        className="rounded-lg bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">Usar como novo percurso</button>
                      <button type="button" onClick={() => applyRouteInput("append")} disabled={!navlogData || !routeInput.trim() || saving}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-xs font-semibold text-zinc-800 disabled:opacity-40">Adicionar ao percurso atual</button>
                    </div>
                    {routeWarnings.map((warning) => <p key={warning} className="mt-1 text-xs text-red-700">{warning}</p>)}
                  </div>
                </section>
                <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="text-base font-bold text-zinc-950">Mapa interativo</h3><p className="mt-1 text-xs text-zinc-500">Clica num marcador para o editar. Arrasta para mover.</p></div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-800">
                      <input type="checkbox" checked={mapAddEnabled} onChange={(event) => setMapAddEnabled(event.target.checked)} className="size-4 accent-zinc-900" />
                      + Adicionar no mapa
                    </label>
                  </div>
                  <AdminRouteMap routeId={draft.id} points={draft.waypoints} selectedIndex={selectedWaypointIndex}
                    onSelectPoint={setActiveWaypointIndex} onAddPoint={mapAddEnabled && !saving ? addMapPoint : undefined} onMovePoint={!saving ? movePointOnMap : undefined} />
                </section>
                </div>
                <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-zinc-950">Identificação e classificação</h3>
                  <label className="block text-sm font-medium text-zinc-700">Descrição
                    <textarea value={draft.description ?? ""} maxLength={1000} rows={2} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${textInput} mt-1`} />
                  </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-zinc-700">Tipo de voo
                    <select value={draft.category ?? ""} onChange={(event) => setDraft({ ...draft, category: (event.target.value || null) as Category })} className={`${textInput} mt-1`}>
                      <option value="">Por classificar</option><option value="VFR">VFR</option><option value="IFR">IFR</option>
                    </select>
                    {!draft.category && displayRouteCategory(draft) ? <span className="mt-1.5 block text-xs font-medium text-amber-800">O nome sugere {displayRouteCategory(draft)}. Seleciona a categoria e guarda para confirmar.</span> : null}
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm font-medium text-zinc-800">
                    <input type="checkbox" checked={draft.is_default} onChange={(event) => setDraft({ ...draft, is_default: event.target.checked })} className="size-4 accent-zinc-900" />
                    Default route
                  </label>
                </div>
                  <p className="text-xs leading-5 text-zinc-500">Marca «por defeito» apenas nas rotas que queres apresentar aos utilizadores. A categoria VFR ou IFR determina o grupo em que a rota aparece no NavLog.</p>
                </section>
                <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div><h3 className="text-lg font-bold text-zinc-950">Percurso e pontos</h3><p className="mt-1 text-xs text-zinc-600">Seleciona um ponto na lista ou no mapa. Edita-o no painel sem perder o percurso de vista.</p></div>
                    <button type="button" disabled={saving || draft.waypoints.length >= 120}
                      onClick={() => { const last = draft.waypoints.at(-1); addPoint({ code: `WP${String(draft.waypoints.length + 1).padStart(2, "0")}`, name: "Novo ponto", lat: last?.lat ?? 38, lon: last?.lon ?? -8, alt: addAltitude, src: "VFR", routes: "", remarks: "" }); }}
                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-bold text-zinc-800 disabled:opacity-40">+ Novo ponto manual</button>
                  </div>
                  <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.28fr)]">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2 px-1">
                        <h4 className="text-sm font-bold text-zinc-950">Ordem dos pontos</h4><span className="text-xs tabular-nums text-zinc-500">{draft.waypoints.length} WP</span>
                      </div>
                      <div className="max-h-[75vh] space-y-1.5 overflow-y-auto pr-1" aria-label="Lista ordenada de pontos">
                        {draft.waypoints.map((point, index) => (
                          <div key={`${draft.id}-${index}`} onDragOver={(event) => { if (draggedIndex !== null) event.preventDefault(); }}
                            onDrop={(event) => { event.preventDefault(); if (draggedIndex !== null) reorderWaypoint(draggedIndex, index); setDraggedIndex(null); }}
                            className={`flex items-center gap-1 rounded-xl border p-1.5 transition-colors ${selectedWaypointIndex === index ? "border-sky-500 bg-sky-50" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
                            <button type="button" draggable onDragStart={(event) => { setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedIndex(null)}
                              title="Arrastar para reordenar" aria-label={`Arrastar ponto ${index + 1}`} className="shrink-0 cursor-grab rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 active:cursor-grabbing">↕</button>
                            <button type="button" onClick={() => setActiveWaypointIndex(index)} aria-pressed={selectedWaypointIndex === index}
                              className="flex min-w-0 flex-1 items-center gap-2 p-1.5 text-left">
                              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selectedWaypointIndex === index ? "bg-sky-600 text-white" : "bg-zinc-100 text-zinc-700"}`}>{index + 1}</span>
                              <span className="min-w-0"><strong className="block truncate text-sm font-bold text-zinc-900">{point.code || "Novo ponto"}{point.alternate_marker ? " · ALT" : ""}</strong>
                                <span className="block truncate text-[11px] text-zinc-500">{index === 0 ? "Origem" : `${legDistances[index].toFixed(1)} NM desde anterior`} · {point.alt ?? 0} ft</span></span>
                            </button>
                            <div className="flex shrink-0 flex-col gap-0.5">
                              <button type="button" disabled={index === 0} onClick={() => moveWaypoint(index, -1)} title="Subir ponto" aria-label={`Subir ponto ${index + 1}`} className="rounded px-1.5 py-0.5 text-xs text-zinc-700 disabled:opacity-20">↑</button>
                              <button type="button" disabled={index === draft.waypoints.length - 1} onClick={() => moveWaypoint(index, 1)} title="Descer ponto" aria-label={`Descer ponto ${index + 1}`} className="rounded px-1.5 py-0.5 text-xs text-zinc-700 disabled:opacity-20">↓</button>
                            </div>
                            <button type="button" disabled={saving || draft.waypoints.length <= 2} onClick={() => removeWaypoint(index)} title="Remover ponto" aria-label={`Remover ponto ${index + 1}`} className="shrink-0 rounded-md px-1.5 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-20">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    {draft.waypoints[selectedWaypointIndex] ? <AdminWaypointInspector waypoint={draft.waypoints[selectedWaypointIndex]} index={selectedWaypointIndex}
                      onChange={(changes) => changeWaypoint(selectedWaypointIndex, changes)}
                      onAlternateChange={(checked) => setDraft({ ...draft, waypoints: draft.waypoints.map((point, index) => ({ ...point, alternate_marker: checked && index === selectedWaypointIndex })) })} /> : null}
                  </div>
                </section>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-600">{isDirty ? "● Tens alterações por guardar nesta rota." : "✓ Rota sem alterações pendentes."}</p>
                  <button type="button" disabled={!isDirty || saving} onClick={() => void save()} className="rounded-xl bg-zinc-950 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">{saving ? "A guardar…" : "Guardar alterações"}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
