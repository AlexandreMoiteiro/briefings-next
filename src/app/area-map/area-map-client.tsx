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

const CoordinateLeafletMap = dynamic(
  () =>
    import("./coordinate-leaflet-map").then(
      (module) => module.CoordinateLeafletMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[640px] items-center justify-center rounded-3xl border border-zinc-200 bg-zinc-100 text-sm text-zinc-500">
        A carregar mapa...
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
    throw new Error(`Latitude inválida: ${raw}`);
  }

  if (digits.length === 5) {
    const fixed = `3${digits}`;
    warnings.push(`${clean} interpretado como ${fixed}${direction}.`);
    digits = fixed;
  }

  if (digits.length !== 6) {
    throw new Error(`Latitude inválida: ${raw}`);
  }

  const degrees = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  const seconds = Number(digits.slice(4, 6));

  if (degrees > 90 || minutes > 59 || seconds > 59) {
    throw new Error(`Latitude inválida: ${raw}`);
  }

  return dmsToDecimal(degrees, minutes, seconds, direction);
}

function parseLongitude(raw: string, warnings: string[]) {
  const clean = raw.replace(/\s+/g, "").toUpperCase();
  const direction = clean.slice(-1);
  let digits = clean.slice(0, -1);

  if (!["E", "W"].includes(direction)) {
    throw new Error(`Longitude inválida: ${raw}`);
  }

  if (digits.length === 6) {
    const fixed = `0${digits}`;
    warnings.push(`${clean} interpretado como ${fixed}${direction}.`);
    digits = fixed;
  }

  if (digits.length !== 7) {
    throw new Error(`Longitude inválida: ${raw}`);
  }

  const degrees = Number(digits.slice(0, 3));
  const minutes = Number(digits.slice(3, 5));
  const seconds = Number(digits.slice(5, 7));

  if (degrees > 180 || minutes > 59 || seconds > 59) {
    throw new Error(`Longitude inválida: ${raw}`);
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
    errors.push(
      "Não encontrei coordenadas válidas. Usa formato DDMMSSN DDDMMSSW."
    );
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
        error instanceof Error ? error.message : "Coordenada inválida."
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

export function AreaMapClient() {
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
        name: areaName.trim() || "Nova área",
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
      setAreasStatus("Não consegui carregar áreas guardadas.");
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
      setAreasStatus("Área guardada.");
    } catch (error) {
      console.error(error);
      setAreasStatus("Não consegui guardar a área.");
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
      setAreasStatus("Área atualizada.");
    } catch (error) {
      console.error(error);
      setAreasStatus("Não consegui atualizar a área.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedArea() {
    if (!selectedAreaId) return;

    const area = savedAreas.find((item) => item.id === selectedAreaId);
    const ok = window.confirm(
      `Eliminar área${area ? ` "${area.name}"` : ""}?`
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
      setAreasStatus("Área eliminada.");
    } catch (error) {
      console.error(error);
      setAreasStatus("Não consegui eliminar a área.");
    } finally {
      setBusy(false);
    }
  }

  async function copyGeoJson() {
    if (!geoJson) return;

    await navigator.clipboard.writeText(geoJson);
    setCopyStatus("GeoJSON copiado.");
    setTimeout(() => setCopyStatus(""), 1600);
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 pb-6">
        <p className="mb-3 text-sm font-medium text-zinc-500">Area Map</p>

        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
          Coordinate area map
        </h1>

        <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
          Cola coordenadas em formato DMS, desenha áreas no mapa e guarda-as.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Áreas guardadas
            </h2>

            <div className="mt-4 space-y-4">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Escolher área
                </span>
                <select
                  value={selectedAreaId}
                  onChange={(event) => selectSavedArea(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Nova área</option>
                  {savedAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Nome
                </span>
                <input
                  value={areaName}
                  onChange={(event) => setAreaName(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Nome da área"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={saveNewArea}
                  disabled={!canSave || busy}
                  className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  Guardar nova
                </button>

                <button
                  type="button"
                  onClick={updateSelectedArea}
                  disabled={!selectedAreaId || !canSave || busy}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:text-zinc-300"
                >
                  Atualizar
                </button>

                <button
                  type="button"
                  onClick={deleteSelectedArea}
                  disabled={!selectedAreaId || busy}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:text-zinc-300"
                >
                  Eliminar
                </button>

                <button
                  type="button"
                  onClick={newArea}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50"
                >
                  Limpar
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
                Coordenadas
              </span>

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={8}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 font-mono text-sm leading-6 outline-none transition focus:border-zinc-400"
                placeholder="384221N 0090058W - 384226N 0090052W - ..."
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyGeoJson}
                disabled={!geoJson}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                Copiar GeoJSON
              </button>
            </div>

            {copyStatus ? (
              <p className="mt-3 text-sm font-medium text-zinc-600">
                {copyStatus}
              </p>
            ) : null}
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Pontos
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {parsed.points.length} ponto(s) encontrado(s).
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
                      <th className="px-3 py-2">Ponto</th>
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
