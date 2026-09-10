"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { logUsageEvent } from "@/lib/usage-events";
import {
  createSavedArea,
  deleteSavedArea,
  loadSavedAreas,
  updateSavedArea,
  type SavedArea,
} from "@/lib/area-map-saved-areas";
import type {
  CoordinateMapArea,
  ParsedCoordinatePoint,
} from "./area-map-client";

const CoordinateLeafletMap = dynamic(
  () =>
    import("./coordinate-leaflet-map").then(
      (module) => module.CoordinateLeafletMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[640px] items-center justify-center rounded-3xl border border-zinc-200 bg-zinc-100 text-sm text-zinc-500">
        Loading map…
      </div>
    ),
  }
);

type ParseResult = {
  points: ParsedCoordinatePoint[];
  warnings: string[];
  errors: string[];
};

function dmsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  direction: string
) {
  const value = degrees + minutes / 60 + seconds / 3600;
  return direction === "S" || direction === "W" ? -value : value;
}

function parseLatitude(raw: string, warnings: string[]) {
  const clean = raw.replace(/\s+/g, "").toUpperCase();
  const direction = clean.slice(-1);
  let digits = clean.slice(0, -1);

  if (!["N", "S"].includes(direction)) {
    throw new Error(`Invalid latitude: ${raw}`);
  }

  if (digits.length === 5) {
    const fixed = `3${digits}`;
    warnings.push(`${clean} interpreted as ${fixed}${direction}.`);
    digits = fixed;
  }

  if (digits.length !== 6) {
    throw new Error(`Invalid latitude: ${raw}`);
  }

  const degrees = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  const seconds = Number(digits.slice(4, 6));

  if (degrees > 90 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid latitude: ${raw}`);
  }

  return dmsToDecimal(degrees, minutes, seconds, direction);
}

function parseLongitude(raw: string, warnings: string[]) {
  const clean = raw.replace(/\s+/g, "").toUpperCase();
  const direction = clean.slice(-1);
  let digits = clean.slice(0, -1);

  if (!["E", "W"].includes(direction)) {
    throw new Error(`Invalid longitude: ${raw}`);
  }

  if (digits.length === 6) {
    const fixed = `0${digits}`;
    warnings.push(`${clean} interpreted as ${fixed}${direction}.`);
    digits = fixed;
  }

  if (digits.length !== 7) {
    throw new Error(`Invalid longitude: ${raw}`);
  }

  const degrees = Number(digits.slice(0, 3));
  const minutes = Number(digits.slice(3, 5));
  const seconds = Number(digits.slice(5, 7));

  if (degrees > 180 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid longitude: ${raw}`);
  }

  return dmsToDecimal(degrees, minutes, seconds, direction);
}

function parseCoordinateInput(input: string): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const points: ParsedCoordinatePoint[] = [];

  const cleaned = input
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/,/g, " ");

  const regex = /(\d{5,6}\s*[NS])\s*(\d{6,7}\s*[EW])/gi;
  const matches = Array.from(cleaned.matchAll(regex));

  if (!matches.length && input.trim()) {
    errors.push("No valid coordinates found. Use DDMMSSN DDDMMSSW format.");
  }

  matches.forEach((match, index) => {
    const latRaw = match[1];
    const lonRaw = match[2];

    try {
      const lat = parseLatitude(latRaw, warnings);
      const lon = parseLongitude(lonRaw, warnings);

      points.push({
        lat,
        lon,
        label: `P${index + 1}`,
        raw: `${latRaw.replace(/\s+/g, "")} ${lonRaw.replace(/\s+/g, "")}`,
      });
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Invalid coordinate."
      );
    }
  });

  return { points, warnings, errors };
}

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

export function AreaMapClientV2() {
  const [input, setInput] = useState("");
  const [areaName, setAreaName] = useState("");
  const [savedAreas, setSavedAreas] = useState<SavedArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [areasStatus, setAreasStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseCoordinateInput(input), [input]);
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
      setAreasStatus("Area saved.");

      void logUsageEvent({
        eventType: "area_map_save",
        module: "area-map",
        title: areaName,
        summary: { name: areaName, points: parsed.points.length },
        payload: { name: areaName, input, points: parsed.points },
      });
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
      setAreasStatus("Area updated.");

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
    const confirmed = window.confirm(
      `Delete area${area ? ` \"${area.name}\"` : ""}?`
    );

    if (!confirmed) return;

    setBusy(true);
    setAreasStatus("");

    try {
      await deleteSavedArea(selectedAreaId);
      setSavedAreas((current) =>
        current.filter((item) => item.id !== selectedAreaId)
      );
      newArea();
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

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-500">
              Utility · NOTAM areas
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              Area Map
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
              Paste DMS coordinates from a NOTAM, inspect the affected area immediately and save it for later review.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600">
              {savedAreas.length} saved
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600">
              {parsed.points.length} points
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Map preview
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
              Affected area
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-500">
            The map is the primary workspace. Editing controls stay below instead of forcing the map into a narrow side column.
          </p>
        </div>

        <CoordinateLeafletMap
          areas={mapAreas}
          selectedAreaId={selectedAreaId || "draft-area"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Coordinates
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
                  Paste NOTAM geometry
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  Use DDMMSSN DDDMMSSW. A polygon is drawn automatically from three or more points.
                </p>
              </div>
              <button
                type="button"
                onClick={newArea}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                New area
              </button>
            </div>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={9}
              className="mt-4 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm leading-6 outline-none transition focus:border-zinc-400 focus:bg-white"
              placeholder="384221N 0090058W - 384226N 0090052W - ..."
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copyGeoJson}
                disabled={!geoJson}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:text-zinc-300"
              >
                Copy GeoJSON
              </button>
              {copyStatus ? (
                <span className="text-sm font-medium text-emerald-700">
                  {copyStatus}
                </span>
              ) : null}
            </div>

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
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Parsed geometry
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
                  Points
                </h2>
              </div>
              <span className="text-sm font-medium text-zinc-500">
                {parsed.points.length} found
              </span>
            </div>

            {parsed.points.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Point</th>
                      <th className="px-3 py-2">Latitude</th>
                      <th className="px-3 py-2">Longitude</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.points.map((point) => (
                      <tr
                        key={`${point.label}-${point.raw}`}
                        className="border-t border-zinc-100"
                      >
                        <td className="px-3 py-2 font-semibold text-zinc-950">
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
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                Paste coordinates above to draw an area on the map.
              </p>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Saved areas
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
              Library
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Load an existing NOTAM area or save the geometry currently shown on the map.
            </p>

            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Saved area
                </span>
                <select
                  value={selectedAreaId}
                  onChange={(event) => selectSavedArea(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
                >
                  <option value="">New area</option>
                  {savedAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Area name
                </span>
                <input
                  value={areaName}
                  onChange={(event) => setAreaName(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
                  placeholder="Example: TRA Lisbon South"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={saveNewArea}
                  disabled={!canSave || busy}
                  className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  Save new
                </button>
                <button
                  type="button"
                  onClick={updateSelectedArea}
                  disabled={!selectedAreaId || !canSave || busy}
                  className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:text-zinc-300"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedArea}
                  disabled={!selectedAreaId || busy}
                  className="col-span-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:text-zinc-300"
                >
                  Delete selected area
                </button>
              </div>

              {areasStatus ? (
                <p className="rounded-xl bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-600">
                  {areasStatus}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <p className="font-semibold">Operational note</p>
            <p className="mt-1">
              This map is a visual aid for interpreting coordinate-defined NOTAM areas. Always use the published NOTAM text as the operational source.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
