"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadAllNavlogData } from "@/lib/navlog-data";
import type { NavlogDataBundle, NavlogPoint } from "@/lib/navlog";

type AviationLayer = "AD" | "VFR" | "IFR" | "VOR";
type MapSourceMode = "standard" | "vfr-chart";

const hasVfrChartOverlay = Boolean(
  (process.env.NEXT_PUBLIC_VFR_CHART_TILES_URL ?? "").trim() ||
    (process.env.NEXT_PUBLIC_VFR_CHART_MANIFEST_URL ?? "").trim()
);

const AviationMapLeaflet = dynamic(
  () =>
    import("./aviation-map-leaflet").then(
      (module) => module.AviationMapLeaflet
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[780px] rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-500">Loading map...</p>
      </div>
    ),
  }
);

const layerOptions: {
  id: AviationLayer;
  label: string;
  description: string;
}[] = [
  {
    id: "AD",
    label: "Aerodromes",
    description: "AD / HEL / ULM",
  },
  {
    id: "VFR",
    label: "VFR points",
    description: "Localidades e pontos VFR",
  },
  {
    id: "IFR",
    label: "IFR points",
    description: "Fixes IFR low",
  },
  {
    id: "VOR",
    label: "VOR/NAVAID",
    description: "VOR with frequency",
  },
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

        if (!cancelled) {
          setData(loaded);
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setDataError("Could not load map data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim();

    if (!query) return [];

    return data.points
      .map((point) => ({
        point,
        score: pointScore(point, query),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map((item) => item.point);
  }, [data.points, searchQuery]);

  const counts = useMemo(() => {
    return {
      AD: data.points.filter((point) => point.src === "AD").length,
      VFR: data.points.filter((point) => point.src === "VFR").length,
      IFR: data.points.filter((point) => point.src === "IFR").length,
      VOR: data.points.filter((point) => point.src === "VOR").length,
    };
  }, [data.points]);

  function toggleLayer(layer: AviationLayer, checked: boolean) {
    setActiveLayers((current) => {
      if (checked) {
        return Array.from(new Set([...current, layer]));
      }

      return current.filter((item) => item !== layer);
    });
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 pb-6">
        <p className="mb-3 text-sm font-medium text-zinc-500">
          Portugal aviation data
        </p>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              Aviation Map
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
              General overview of Portuguese aviation data: airspace context, aerodromes, VFR points, IFR fixes, VOR/NAVAIDs, OpenAIP or the ANC Portugal VFR chart.
            </p>

            <div className="mt-5 max-w-4xl rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
              <strong>Purpose:</strong> use this map for situational awareness in Portugal before route planning, not as a substitute for current charts, NOTAMs or AIP validation.
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">AD</p>
              <p className="font-semibold text-zinc-950">{counts.AD}</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">VFR</p>
              <p className="font-semibold text-zinc-950">{counts.VFR}</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">IFR</p>
              <p className="font-semibold text-zinc-950">{counts.IFR}</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">VOR</p>
              <p className="font-semibold text-zinc-950">{counts.VOR}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-950">Search</h2>

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="LPSO, ESP, MAGUM, NSA..."
              className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            />

            {dataError ? (
              <p className="mt-3 text-sm text-red-600">{dataError}</p>
            ) : null}

            {loading ? (
              <p className="mt-3 text-sm text-zinc-500">
                Loading data...
              </p>
            ) : null}

            <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
              {searchQuery.trim() && searchResults.length === 0 ? (
                <p className="text-sm text-zinc-500">No results.</p>
              ) : null}

              {searchResults.map((point) => {
                const selected =
                  selectedPoint &&
                  selectedPoint.code === point.code &&
                  selectedPoint.lat === point.lat &&
                  selectedPoint.lon === point.lon &&
                  selectedPoint.src === point.src;

                return (
                  <button
                    key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
                    type="button"
                    onClick={() => setSelectedPoint(point)}
                    className={[
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      selected
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-white",
                    ].join(" ")}
                  >
                    <span className="block text-sm font-semibold">
                      {point.code}
                    </span>
                    <span
                      className={[
                        "mt-1 block truncate text-xs",
                        selected ? "text-zinc-300" : "text-zinc-500",
                      ].join(" ")}
                    >
                      {point.name}
                    </span>
                    <span
                      className={[
                        "mt-1 block text-xs",
                        selected ? "text-zinc-400" : "text-zinc-400",
                      ].join(" ")}
                    >
                      {point.src} · {point.lat.toFixed(5)},{" "}
                      {point.lon.toFixed(5)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-950">Map source</h2>

            <div className="mt-4 space-y-2">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <span>
                  <span className="block font-medium text-zinc-700">
                    OpenTopoMap + OpenAIP
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Terrain base with OpenAIP overlay.
                  </span>
                </span>

                <input
                  type="radio"
                  name="aviation-map-source"
                  checked={mapSourceMode === "standard"}
                  onChange={() => setMapSourceMode("standard")}
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <span>
                  <span className="block font-medium text-zinc-700">
                    ANC Portugal 500k
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Carta VFR only, without OpenTopoMap or OpenAIP.
                  </span>
                </span>

                <input
                  type="radio"
                  name="aviation-map-source"
                  disabled={!hasVfrChartOverlay}
                  checked={mapSourceMode === "vfr-chart"}
                  onChange={() => setMapSourceMode("vfr-chart")}
                />
              </label>
            </div>

            {!hasVfrChartOverlay ? (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Configure NEXT_PUBLIC_VFR_CHART_TILES_URL or NEXT_PUBLIC_VFR_CHART_MANIFEST_URL after converting the GeoTIFF/KMZ into web assets.
              </p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-950">Layers</h2>

            <div className="mt-4 space-y-2">
              {layerOptions.map((layer) => (
                <label
                  key={layer.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm"
                >
                  <span>
                    <span className="block font-medium text-zinc-700">
                      {layer.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {layer.description}
                    </span>
                  </span>

                  <input
                    type="checkbox"
                    checked={activeLayers.includes(layer.id)}
                    onChange={(event) =>
                      toggleLayer(layer.id, event.target.checked)
                    }
                  />
                </label>
              ))}
            </div>

          </section>
        </aside>

        <main>
          <AviationMapLeaflet
            points={data.points}
            activeLayers={activeLayers}
            searchQuery={searchQuery}
            selectedPoint={selectedPoint}
            mapSourceMode={mapSourceMode}
          />
        </main>
      </section>
    </div>
  );
}
