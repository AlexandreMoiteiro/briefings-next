"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSavedArea,
  deleteSavedArea,
  loadSavedAreas,
  updateSavedArea,
  type AreaMapPoint,
  type SavedArea,
} from "@/lib/area-map-saved-areas";
import { parseCoordinateAreaInput } from "@/lib/coordinate-area-parser";
import {
  buildAreaMapPdf,
  type AreaMapPdfSource,
} from "@/lib/pdf/area-map-pdf";
import { logUsageEvent } from "@/lib/usage-events";

const CoordinateLeafletMap = dynamic(
  () =>
    import("./coordinate-leaflet-map").then(
      (module) => module.CoordinateLeafletMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[640px] items-center justify-center rounded-3xl border border-zinc-200 bg-zinc-100 text-sm text-zinc-500">
        Loading map...
      </div>
    ),
  }
);

export type ParsedCoordinatePoint = AreaMapPoint;

export type CoordinateMapArea = {
  id: string;
  name: string;
  points: ParsedCoordinatePoint[];
  isDraft?: boolean;
  isSelected?: boolean;
};

function closePolygon(points: ParsedCoordinatePoint[]) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];

  if (
    Math.abs(first.lat - last.lat) < 0.000001 &&
    Math.abs(first.lon - last.lon) < 0.000001
  ) {
    return points;
  }

  return [...points, first];
}

function buildGeoJson(points: ParsedCoordinatePoint[]) {
  if (points.length < 2) return "";

  if (points.length >= 3) {
    const closed = closePolygon(points);
    return JSON.stringify(
      {
        type: "Feature",
        properties: { name: "Area" },
        geometry: {
          type: "Polygon",
          coordinates: [closed.map((point) => [point.lon, point.lat])],
        },
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      type: "Feature",
      properties: { name: "Line" },
      geometry: {
        type: "LineString",
        coordinates: points.map((point) => [point.lon, point.lat]),
      },
    },
    null,
    2
  );
}

function safeFilename(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "area-map"
  );
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AreaMapClient() {
  const visibilityInitialized = useRef(false);
  const [input, setInput] = useState("");
  const [areaName, setAreaName] = useState("");
  const [savedAreas, setSavedAreas] = useState<SavedArea[]>([]);
  const [visibleAreaIds, setVisibleAreaIds] = useState<string[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [areasStatus, setAreasStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfSource, setPdfSource] = useState<AreaMapPdfSource>("vfr-chart");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const parsed = useMemo(() => parseCoordinateAreaInput(input), [input]);
  const geoJson = useMemo(() => buildGeoJson(parsed.points), [parsed.points]);

  const canSave =
    areaName.trim().length > 0 &&
    parsed.points.length > 0 &&
    parsed.errors.length === 0;

  const mapAreas = useMemo<CoordinateMapArea[]>(() => {
    const visible = new Set(visibleAreaIds);
    const areas: CoordinateMapArea[] = savedAreas
      .filter((area) => visible.has(area.id))
      .map((area) => ({
        id: area.id,
        name: area.id === selectedAreaId ? areaName.trim() || area.name : area.name,
        points:
          area.id === selectedAreaId &&
          parsed.errors.length === 0 &&
          parsed.points.length
            ? parsed.points
            : area.points,
        isSelected: area.id === selectedAreaId,
      }))
      .filter((area) => area.points.length > 0);

    if (!selectedAreaId && parsed.errors.length === 0 && parsed.points.length) {
      areas.push({
        id: "draft-area",
        name: areaName.trim() || "New area",
        points: parsed.points,
        isDraft: true,
        isSelected: true,
      });
    }

    return areas;
  }, [areaName, parsed.errors.length, parsed.points, savedAreas, selectedAreaId, visibleAreaIds]);

  useEffect(() => {
    void refreshSavedAreas();
  }, []);

  async function refreshSavedAreas() {
    setBusy(true);
    setAreasStatus("");
    try {
      const loaded = await loadSavedAreas();
      setSavedAreas(loaded);
      setVisibleAreaIds((current) => {
        const validIds = new Set(loaded.map((area) => area.id));
        if (!visibilityInitialized.current) {
          visibilityInitialized.current = true;
          return loaded.map((area) => area.id);
        }
        return current.filter((id) => validIds.has(id));
      });
    } catch (error) {
      console.error(error);
      setAreasStatus("Could not load saved areas.");
    } finally {
      setBusy(false);
    }
  }

  function toggleAreaVisibility(id: string, checked: boolean) {
    setVisibleAreaIds((current) =>
      checked
        ? Array.from(new Set([...current, id]))
        : current.filter((currentId) => currentId !== id)
    );
  }

  function selectSavedArea(id: string) {
    setSelectedAreaId(id);
    setAreasStatus("");
    setPdfStatus("");

    if (!id) {
      setAreaName("");
      setInput("");
      return;
    }

    const area = savedAreas.find((item) => item.id === id);
    if (!area) return;
    setAreaName(area.name);
    setInput(area.input);
    setVisibleAreaIds((current) =>
      current.includes(id) ? current : [...current, id]
    );
  }

  function newArea() {
    setSelectedAreaId("");
    setAreaName("");
    setInput("");
    setAreasStatus("");
    setPdfStatus("");
  }

  async function saveNewArea() {
    if (!canSave) return;
    setBusy(true);
    setAreasStatus("");

    try {
      const saved = await createSavedArea(areaName, input, parsed.points);
      setSavedAreas((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setSelectedAreaId(saved.id);
      setVisibleAreaIds((current) => Array.from(new Set([...current, saved.id])));
      void logUsageEvent({
        eventType: "area_map_save",
        module: "area-map",
        title: areaName,
        summary: { name: areaName, points: parsed.points.length },
        payload: { name: areaName, input, points: parsed.points },
      });
      setAreasStatus("Area saved.");
    } catch (error) {
      console.error(error);
      setAreasStatus("Could not save the area.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSelectedArea() {
    if (!canSave || !selectedAreaId) return;
    setBusy(true);
    setAreasStatus("");

    try {
      const saved = await updateSavedArea(
        selectedAreaId,
        areaName,
        input,
        parsed.points
      );
      setSavedAreas((current) =>
        current.map((item) => (item.id === saved.id ? saved : item))
      );
      void logUsageEvent({
        eventType: "area_map_update",
        module: "area-map",
        title: areaName,
        summary: { name: areaName, points: parsed.points.length },
        payload: {
          id: selectedAreaId,
          name: areaName,
          input,
          points: parsed.points,
        },
      });
      setAreasStatus("Area updated.");
    } catch (error) {
      console.error(error);
      setAreasStatus("Could not update the area.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedArea() {
    if (!selectedAreaId) return;
    const area = savedAreas.find((item) => item.id === selectedAreaId);
    if (!window.confirm(`Delete area${area ? ` "${area.name}"` : ""}?`)) return;

    setBusy(true);
    setAreasStatus("");
    try {
      await deleteSavedArea(selectedAreaId);
      setSavedAreas((current) =>
        current.filter((item) => item.id !== selectedAreaId)
      );
      setVisibleAreaIds((current) =>
        current.filter((id) => id !== selectedAreaId)
      );
      setSelectedAreaId("");
      setAreaName("");
      setInput("");
      setAreasStatus("Area deleted.");
    } catch (error) {
      console.error(error);
      setAreasStatus("Could not delete the area.");
    } finally {
      setBusy(false);
    }
  }

  async function copyGeoJson() {
    if (!geoJson) return;
    await navigator.clipboard.writeText(geoJson);
    setCopyStatus("GeoJSON copied.");
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  async function exportPdf() {
    if (!mapAreas.length || pdfBusy) return;
    setPdfBusy(true);
    setPdfStatus("Preparing PDF...");

    try {
      const bytes = await buildAreaMapPdf({
        areas: mapAreas,
        source: pdfSource,
        title: areaName.trim() || "Coordinate areas",
      });
      const date = new Date().toISOString().slice(0, 10);
      const baseName =
        mapAreas.length === 1
          ? safeFilename(mapAreas[0].name)
          : `area-map-${date}`;

      downloadPdf(bytes, `${baseName}.pdf`);
      setPdfStatus("PDF downloaded.");

      void logUsageEvent({
        eventType: "area_map_pdf_export",
        module: "area-map",
        title: areaName.trim() || "Area Map PDF",
        summary: {
          areas: mapAreas.length,
          points: mapAreas.reduce((total, area) => total + area.points.length, 0),
          mapSource: pdfSource,
        },
        payload: {
          areas: mapAreas.map((area) => ({
            id: area.id,
            name: area.name,
            points: area.points,
          })),
          mapSource: pdfSource,
        },
      });
    } catch (error) {
      console.error(error);
      setPdfStatus(
        error instanceof Error ? error.message : "Could not generate the PDF."
      );
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          NOTAM / GAMET
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          Area Map
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Paste an area description, check it on the map and save or export it.
        </p>
      </header>

      <section className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Area
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                  Edit area
                </h2>
              </div>
              <button
                type="button"
                onClick={newArea}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                New
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Saved area
                </span>
                <select
                  value={selectedAreaId}
                  onChange={(event) => selectSavedArea(event.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">New area</option>
                  {savedAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Name
                </span>
                <input
                  value={areaName}
                  onChange={(event) => setAreaName(event.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                  placeholder="Area name"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={saveNewArea}
                  disabled={!canSave || busy}
                  className="rounded-xl bg-zinc-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  Save new
                </button>
                <button
                  type="button"
                  onClick={updateSelectedArea}
                  disabled={!selectedAreaId || !canSave || busy}
                  className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:text-zinc-300"
                >
                  Update
                </button>
              </div>

              {selectedAreaId ? (
                <button
                  type="button"
                  onClick={deleteSelectedArea}
                  disabled={busy}
                  className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete saved area
                </button>
              ) : null}

              {areasStatus ? (
                <p className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  {areasStatus}
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Map visibility
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                  Shown areas
                </h2>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                {visibleAreaIds.length}/{savedAreas.length}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setVisibleAreaIds(savedAreas.map((area) => area.id))}
                disabled={!savedAreas.length}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => setVisibleAreaIds([])}
                disabled={!savedAreas.length}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
              >
                Hide all
              </button>
            </div>

            <div className="mt-3 max-h-56 space-y-1.5 overflow-auto pr-1">
              {savedAreas.length ? (
                savedAreas.map((area) => (
                  <label
                    key={area.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={visibleAreaIds.includes(area.id)}
                      onChange={(event) =>
                        toggleAreaVisibility(area.id, event.target.checked)
                      }
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">
                      {area.name}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {area.points.length} pt
                    </span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No saved areas yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Coordinates / area description
              </span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={8}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 font-mono text-sm leading-6 outline-none focus:border-zinc-500"
                placeholder={'S OF N3845 AND W OF W00815\nN3842 W00900 - N3900 W00830\n384221N 0090058W - 384226N 0090052W'}
              />
            </label>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <span
                className={
                  parsed.errors.length
                    ? "font-semibold text-red-700"
                    : "font-semibold text-emerald-700"
                }
              >
                {parsed.errors.length
                  ? `${parsed.errors.length} issue${parsed.errors.length === 1 ? "" : "s"}`
                  : `${parsed.points.length} point${parsed.points.length === 1 ? "" : "s"} found`}
              </span>
              <details className="text-zinc-500">
                <summary className="cursor-pointer font-semibold">Accepted formats</summary>
                <div className="mt-2 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
                  DMS, ICAO degrees/minutes, decimal coordinates and GAMET directional sectors such as S OF N3845 AND W OF W00815.
                </div>
              </details>
            </div>

            {parsed.errors.length ? (
              <div className="mt-3 space-y-2">
                {parsed.errors.map((error) => (
                  <p key={error} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                ))}
              </div>
            ) : null}

            {parsed.warnings.length ? (
              <div className="mt-3 space-y-2">
                {parsed.warnings.map((warning) => (
                  <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Export
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  PDF background
                </span>
                <select
                  value={pdfSource}
                  onChange={(event) =>
                    setPdfSource(event.target.value as AreaMapPdfSource)
                  }
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="vfr-chart">VFR chart</option>
                  <option value="standard">OpenTopoMap</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-1">
                <button
                  type="button"
                  onClick={copyGeoJson}
                  disabled={!geoJson}
                  className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:text-zinc-300"
                >
                  Copy GeoJSON
                </button>
                <button
                  type="button"
                  onClick={exportPdf}
                  disabled={!mapAreas.length || pdfBusy}
                  className="rounded-xl bg-zinc-950 px-3 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  {pdfBusy ? "Generating…" : "Download PDF"}
                </button>
              </div>
            </div>
            {copyStatus || pdfStatus ? (
              <p className="mt-3 text-sm font-medium text-zinc-600">
                {copyStatus || pdfStatus}
              </p>
            ) : null}
          </section>
        </aside>

        <main className="min-w-0">
          <div className="sticky top-28">
            <CoordinateLeafletMap
              areas={mapAreas}
              selectedAreaId={selectedAreaId || "draft-area"}
            />
          </div>
        </main>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Parsed coordinates
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">Points</h2>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
            {parsed.points.length}
          </span>
        </div>

        {parsed.points.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Point</th>
                  <th className="px-3 py-2">Latitude</th>
                  <th className="px-3 py-2">Longitude</th>
                  <th className="px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {parsed.points.map((point) => (
                  <tr key={`${point.label}-${point.raw}`} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-medium text-zinc-950">{point.label}</td>
                    <td className="px-3 py-2 font-mono text-zinc-600">{point.lat.toFixed(6)}</td>
                    <td className="px-3 py-2 font-mono text-zinc-600">{point.lon.toFixed(6)}</td>
                    <td className="max-w-sm truncate px-3 py-2 text-xs text-zinc-500">{point.raw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">Paste an area description to see its parsed points.</p>
        )}
      </section>
    </div>
  );
}
