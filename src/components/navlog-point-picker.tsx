"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { NavlogPoint } from "@/lib/navlog";

type IndexedPoint = {
  point: NavlogPoint;
  code: string;
  name: string;
  source: string;
  routes: string;
  remarks: string;
  priority: number;
};

const MAX_RESULTS = 18;

function searchPoints(index: IndexedPoint[], query: string) {
  const matches: { item: IndexedPoint; score: number }[] = [];
  for (const item of index) {
    if (!item.code.includes(query) && !item.name.includes(query) && !item.source.includes(query) &&
        !item.routes.includes(query) && !item.remarks.includes(query)) continue;
    const score = (item.code === query ? 1000 : 0) +
      (item.code.startsWith(query) ? 300 : 0) +
      (item.name.includes(query) ? 100 : 0) +
      (item.routes.includes(query) ? 80 : 0) + item.priority;
    matches.push({ item, score });
    // Keep the sorting workload bounded instead of sorting every matching point.
    if (matches.length >= MAX_RESULTS * 3) {
      matches.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code));
      matches.length = MAX_RESULTS;
    }
  }
  matches.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code));
  return matches.slice(0, MAX_RESULTS).map(({ item }) => item.point);
}

export function NavlogPointPicker({ points, onAdd, onLocate, disabled = false, placeholder = "E.g. LPSO, MAGUM, VOR…", language = "en" }: {
  points: NavlogPoint[];
  onAdd: (point: NavlogPoint) => void;
  onLocate?: (point: NavlogPoint) => void;
  disabled?: boolean;
  placeholder?: string;
  language?: "en" | "pt";
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toUpperCase());
  const index = useMemo<IndexedPoint[]>(() => points.map((point) => ({
    point,
    code: point.code.toUpperCase(),
    name: point.name.toUpperCase(),
    source: point.src.toUpperCase(),
    routes: point.routes.toUpperCase(),
    remarks: point.remarks.toUpperCase(),
    priority: point.routes.toUpperCase().includes("LPFR") || point.remarks.toUpperCase().includes("AIRAC 005-26") ? 500 : 0,
  })), [points]);
  const results = useMemo(() => deferredQuery.length < 2 ? [] : searchPoints(index, deferredQuery), [index, deferredQuery]);
  const pending = deferredQuery !== query.trim().toUpperCase();

  return (
    <div>
      <label htmlFor={language === "pt" ? "admin-point-search" : "navlog-point-search"} className="sr-only">
        {language === "pt" ? "Pesquisar ponto aeronáutico" : "Find a navigation point"}
      </label>
      <input id={language === "pt" ? "admin-point-search" : "navlog-point-search"} value={query} onChange={(event) => setQuery(event.target.value)}
        disabled={disabled} placeholder={placeholder} autoComplete="off"
        className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950 disabled:opacity-50" />
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto" aria-live="polite" aria-busy={pending}>
        {query.trim().length < 2 ? <p className="py-2 text-xs text-zinc-500">{language === "pt" ? "Escreve pelo menos 2 caracteres do ICAO, código ou nome." : "Type at least 2 characters of a code or name."}</p> : null}
        {query.trim().length >= 2 && !pending && results.length === 0 ? <p className="py-2 text-sm text-zinc-500">{language === "pt" ? "Sem pontos correspondentes." : "No matching points."}</p> : null}
        {results.map((point) => (
          <div key={`${point.src}-${point.code}-${point.lat}-${point.lon}`} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-50">
            <button type="button" onClick={() => { onAdd(point); setQuery(""); }} disabled={disabled}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-1 py-1.5 text-left disabled:opacity-50">
              <span className="min-w-0"><strong className="block text-sm font-semibold text-zinc-950">{point.code || "CUSTOM"}</strong><span className="block truncate text-xs text-zinc-500">{point.name} · {point.src}</span></span>
              <span className="shrink-0 text-xs font-semibold text-zinc-800">{language === "pt" ? "+ Adicionar" : "+ Add"}</span>
            </button>
            {onLocate ? <button type="button" onClick={() => onLocate(point)} title={language === "pt" ? "Localizar no mapa" : "Locate on map"}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs font-medium text-zinc-600 hover:border-sky-300 hover:text-sky-800">
              {language === "pt" ? "Mapa" : "Map"}
            </button> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
