"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function AreaMapClient() {
  const [input, setInput] = useState("");
  const [areaName, setAreaName] = useState("");
  const [savedAreas, setSavedAreas] = useState<SavedArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [areasStatus, setAreasStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfSource, setPdfSource] = useState<AreaMapPdfSource>("standard");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const parsed = useMemo(() => parseCoordinateAreaInput(input), [input]);
  const geoJson = useMemo(() => buildGeoJson(parsed.points), [parsed.points]);

  const canSave =
    areaName.trim().length > 0 &&
    parsed.points.length > 0 &&
    parsed.errors.length === 0;

  const mapAreas = useMemo<CoordinateMapArea[]>(() => {
    const selectedSavedArea = savedAreas.find(
      (area) => area.id === selectedAreaId
    );

    const areas: CoordinateMapArea[] = savedAreas
      .map((area) => {
        if (area.id !== selectedAreaId) {
          return {
            id: area.id,
            name: area.name,
            points: area.points,
          };
        }

        return {
          id: area.id,
          name: areaName.trim() || area.name,
          points:
            parsed.errors.length === 0 && parsed.points.length
              ? parsed.points
              : area.points,
          isSelected: true,
        };
      })
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

    if (
      selectedAreaId &&
      selectedSavedArea &&
      !areas.some((area) => area.id === selectedAreaId)
    ) {
      areas.push({
        id: selectedSavedArea.id,
        name: selectedSavedArea.name,
        points: selectedSavedArea.points,
        isSelected: true,
      });
    }

    return areas;
  }, [areaName, parsed.errors.length, parsed.points, savedAreas, selectedAreaId]);

  useEffect(() => {
    void refreshSavedAreas();
  }, []);

  async function refreshSavedAreas() {
    setBusy(true);
    setAreasStatus("");

    try {
      const areas = await loadSavedAreas();
      setSavedAreas(areas);
    } catch (error) {
      console.error(error);
      setAreasStatus("Could not load saved areas.");
    } finally {
      setBusy(false);
    }
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

      void logUsageEvent({
        eventType: "area_map_save",
        module: "area-map",
        title: areaName,
        summary: {
          name: areaName,
          points: parsed.points.length,
        },
        payload: {
          name: areaName,
          input,
          points: parsed.points,
        },
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
        summary: {
          name: areaName,
          points: parsed.points.length,
        },
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
    const ok = window.confirm(
      `Delete area${area ? ` "${area.name}"` : ""}?`
    );

    if (!ok) return;

    setBusy(true);
    setAreasStatus("");

    try {
      await deleteSavedArea(selectedAreaId);
      setSavedAreas((current) =>
        current.filter((item) => item.id !== selectedAreaId)
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
    window.setTimeout(() => setCopyStatus(""), 1_600);
  }

  async function exportPdf() {
    if (!mapAreas.length || pdfBusy) return;

    setPdfBusy(true);
    setPdfStatus("Preparing PDF and map tiles...");

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
      <section className="border-b border-zinc-200 pb-6">
        <p className="mb-3 text-sm font-medium text-zinc-500">Area Map</p>

        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
          Coordinate area map
        </h1>

        <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
          Paste coordinates from NOTAM, GAMET or SIGMET messages, plot the
          affected areas, and export the complete map to PDF.
        </p>

        <div className="mt-5 max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <strong>Accepted formats:</strong> compact DMS (384221N 0090058W),
          ICAO degrees/minutes (3842N 00900W or N3842 W00900), DMS with
          symbols/spaces, decimal hemispheres, and signed decimal pairs.
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Saved areas
            </h2>

            <div className="mt-4 space-y-4">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Select area
                </span>
                <select
                  value={selectedAreaId}
                  onChange={(event) => selectSavedArea(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">New area</option>
                  {savedAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Name
                </span>
                <input
                  value={areaName}
                  onChange={(event) => setAreaName(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Area name"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={saveNewArea}
                  disabled={!canSave || busy}
                  className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  Save new
                </button>

                <button
                  type="button"
                  onClick={updateSelectedArea}
                  disabled={!selectedAreaId || !canSave || busy}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:text-zinc-300"
                >
                  Update
                </button>

                <button
                  type="button"
                  onClick={deleteSelectedArea}
                  disabled={!selectedAreaId || busy}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:text-zinc-300"
                >
                  Delete
                </button>

                <button
                  type="button"
                  onClick={newArea}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50"
                >
                  Clear
                </button>
              </div>

              {areasStatus ? (
                <p className="text-sm font-medium text-zinc-600">
                  {areasStatus}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Coordinates
              </span>

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={9}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 font-mono text-sm leading-6 outline-none transition focus:border-zinc-400"
                placeholder={
                  "SIGMET polygon examples:\nN3842 W00900 - N3900 W00830\n384221N 0090058W - 384226N 0090052W"
                }
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={copyGeoJson}
                disabled={!geoJson}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:text-zinc-300"
              >
                Copy GeoJSON
              </button>

              <button
                type="button"
                onClick={exportPdf}
                disabled={!mapAreas.length || pdfBusy}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                {pdfBusy ? "Generating PDF..." : "Download PDF"}
              </button>
            </div>

            <label className="mt-3 block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                PDF background
              </span>
              <select
                value={pdfSource}
                onChange={(event) =>
                  setPdfSource(event.target.value as AreaMapPdfSource)
                }
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="standard">OpenTopoMap</option>
                <option value="vfr-chart">VFR chart</option>
              </select>
            </label>

            {copyStatus || pdfStatus ? (
              <div className="mt-3 space-y-1 text-sm font-medium text-zinc-600">
                {copyStatus ? <p>{copyStatus}</p> : null}
                {pdfStatus ? <p>{pdfStatus}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Points
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {parsed.points.length} point(s) found.
            </p>

            {parsed.errors.length ? (
              <div className="mt-4 space-y-2">
                {parsed.errors.map((error) => (
                  <p
                    key={error}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  >
                    {error}
                  </p>
                ))}
              </div>
            ) : null}

            {parsed.warnings.length ? (
              <div className="mt-4 space-y-2">
                {parsed.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            {parsed.points.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Point</th>
                      <th className="px-3 py-2">Lat</th>
                      <th className="px-3 py-2">Lon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.points.map((point) => (
                      <tr
                        key={`${point.label}-${point.raw}`}
                        className="border-t border-zinc-100"
                      >
                        <td className="px-3 py-2 font-medium text-zinc-950">
                          {point.label}
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-600">
                          {point.lat.toFixed(6)}
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-600">
                          {point.lon.toFixed(6)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </aside>

        <CoordinateLeafletMap
          areas={mapAreas}
          selectedAreaId={selectedAreaId || "draft-area"}
        />
      </section>
    </div>
  );
}
