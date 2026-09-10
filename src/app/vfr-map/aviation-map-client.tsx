"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadAllNavlogData } from "@/lib/navlog-data";
import type { NavlogDataBundle, NavlogPoint } from "@/lib/navlog";

type AviationLayer = "AD" | "VFR" | "IFR" | "VOR";
type MapSourceMode = "standard" | "vfr-chart";

const hasVfrChartOverlay = true;

const AviationMapLeaflet = dynamic(
  () =>
    import("./aviation-map-leaflet").then(
      (module) => module.AviationMapLeaflet
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[720px] items-center justify-center rounded-3xl border border-zinc-200 bg-white text-sm text-zinc-500 shadow-sm">
        Loading map...
      </div>
    ),
  }
);

const layerOptions: Array<{
  id: AviationLayer;
  label: string;
  description: string;
}> = [
  { id: "AD", label: "Aerodromes", description: "AD / HEL / ULM" },
  { id: "VFR", label: "VFR points", description: "Visual reporting points" },
  { id: "IFR", label: "IFR points", description: "IFR low fixes" },
  { id: "VOR", label: "VOR / NAVAID", description: "Navaids and frequencies" },
];

function emptyNavlogData(): NavlogDataBundle {
  return {
    points: [],
    vors: [],
    airways: [],
    procedures: [],
  };
}

function pointScore(point: NavlogPoint, query: string) {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return 0;
  if (point.code.toUpperCase() === normalized) return 100;
  if (point.code.toUpperCase().startsWith(normalized)) return 80;
  if (point.name.toUpperCase().startsWith(normalized)) return 60;
  if (point.code.toUpperCase().includes(normalized)) return 45;
  if (point.name.toUpperCase().includes(normalized)) return 35;
  if (point.routes.toUpperCase().includes(normalized)) return 25;
  if (point.remarks.toUpperCase().includes(normalized)) return 15;
  return 0;
}

export function AviationMapClient() {
  const [data, setData] = useState<NavlogDataBundle>(() => emptyNavlogData());
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mapSourceMode, setMapSourceMode] = useState<MapSourceMode>(
    hasVfrChartOverlay ? "vfr-chart" : "standard"
  );
  const [activeLayers, setActiveLayers] = useState<AviationLayer[]>([
    "AD",
    "VFR",
    "IFR",
    "VOR",
  ]);
  const [selectedPoint, setSelectedPoint] = useState<NavlogPoint | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setDataError("");
      try {
        const loaded = await loadAllNavlogData();
        if (!cancelled) setData(loaded);
      } catch (error) {
        console.error(error);
        if (!cancelled) setDataError("Could not load map data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return [];

    return data.points
      .map((point) => ({ point, score: pointScore(point, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map((item) => item.point);
  }, [data.points, searchQuery]);

  const counts = useMemo(
    () => ({
      AD: data.points.filter((point) => point.src === "AD").length,
      VFR: data.points.filter((point) => point.src === "VFR").length,
      IFR: data.points.filter((point) => point.src === "IFR").length,
      VOR: data.points.filter((point) => point.src === "VOR").length,
    }),
    [data.points]
  );

  function toggleLayer(layer: AviationLayer, checked: boolean) {
    setActiveLayers((current) =>
      checked
        ? Array.from(new Set([...current, layer]))
        : current.filter((item) => item !== layer)
    );
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Portugal
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          Aviation Map
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Search aviation points and choose the chart and layers you want to see.
        </p>
      </header>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Search
              </span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="LPSO, ESP, MAGUM, NSA…"
                className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-500"
              />
            </label>

            {dataError ? (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {dataError}
              </p>
            ) : null}
            {loading ? (
              <p className="mt-3 text-sm text-zinc-500">Loading aviation data…</p>
            ) : null}

            {searchQuery.trim() ? (
              <div className="mt-3 max-h-80 space-y-1.5 overflow-auto pr-1">
                {!loading && searchResults.length === 0 ? (
                  <p className="rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                    No results.
                  </p>
                ) : null}

                {searchResults.map((point) => {
                  const selected =
                    selectedPoint?.code === point.code &&
                    selectedPoint?.lat === point.lat &&
                    selectedPoint?.lon === point.lon &&
                    selectedPoint?.src === point.src;

                  return (
                    <button
                      key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
                      type="button"
                      onClick={() => setSelectedPoint(point)}
                      className={[
                        "w-full rounded-xl border px-3 py-2.5 text-left transition",
                        selected
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <strong className="text-sm">{point.code}</strong>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            selected ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-500",
                          ].join(" ")}
                        >
                          {point.src}
                        </span>
                      </span>
                      <span
                        className={[
                          "mt-1 block truncate text-xs",
                          selected ? "text-zinc-300" : "text-zinc-500",
                        ].join(" ")}
                      >
                        {point.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Map
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setMapSourceMode("vfr-chart")}
                disabled={!hasVfrChartOverlay}
                className={[
                  "rounded-lg px-3 py-2 text-xs font-semibold transition",
                  mapSourceMode === "vfr-chart"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-950",
                ].join(" ")}
              >
                VFR chart
              </button>
              <button
                type="button"
                onClick={() => setMapSourceMode("standard")}
                className={[
                  "rounded-lg px-3 py-2 text-xs font-semibold transition",
                  mapSourceMode === "standard"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-950",
                ].join(" ")}
              >
                Topo + OpenAIP
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Layers
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveLayers(["AD", "VFR", "IFR", "VOR"])}
                  className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayers([])}
                  className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  None
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {layerOptions.map((layer) => {
                const active = activeLayers.includes(layer.id);
                return (
                  <label
                    key={layer.id}
                    className={[
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                      active
                        ? "border-zinc-400 bg-zinc-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(event) => toggleLayer(layer.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-800">
                        {layer.label}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {layer.description}
                      </span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-zinc-500 shadow-sm">
                      {counts[layer.id]}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {selectedPoint ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Selected
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                    {selectedPoint.code}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">{selectedPoint.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPoint(null)}
                  className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Clear
                </button>
              </div>
              <p className="mt-3 font-mono text-xs text-zinc-500">
                {selectedPoint.lat.toFixed(5)}, {selectedPoint.lon.toFixed(5)}
              </p>
            </section>
          ) : null}
        </aside>

        <main className="min-w-0">
          <div className="sticky top-28">
            <AviationMapLeaflet
              points={data.points}
              activeLayers={activeLayers}
              searchQuery={searchQuery}
              selectedPoint={selectedPoint}
              mapSourceMode={mapSourceMode}
            />
          </div>
        </main>
      </section>
    </div>
  );
}
