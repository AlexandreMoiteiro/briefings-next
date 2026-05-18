"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadAllNavlogData } from "@/lib/navlog-data";
import {
  buildNavlogCalculation,
  formatDuration,
  makeVorRadialDistanceFix,
  makeWaypointFromPoint,
  navlogLegsToCsv,
  navlogSummary,
  parseRouteText,
  routeItem15,
} from "@/lib/navlog-engine";
import {
  applyAircraftProfile,
  getAircraftTypeFromRegistration,
  navlogAircraftProfiles,
  navlogDefaultSetup,
  piperRegistrations,
  tecnamRegistrations,
  type NavlogAircraftType,
  type NavlogDataBundle,
  type NavlogPoint,
  type NavlogRouteWaypoint,
  type NavlogSetupForm,
} from "@/lib/navlog";

const NavlogMap = dynamic(
  () => import("./navlog-map").then((module) => module.NavlogMap),
  {
    ssr: false,
    loading: () => (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-500">A carregar mapa...</p>
      </section>
    ),
  }
);

type ActiveTab = "route" | "map" | "navlog";

function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
      />
    </label>
  );
}

function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export function NavlogClient() {
  const [setup, setSetup] = useState<NavlogSetupForm>(navlogDefaultSetup);
  const [navlogData, setNavlogData] = useState<NavlogDataBundle | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("route");
  const [routeText, setRouteText] = useState("");
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [pointSearch, setPointSearch] = useState("");
  const [addAltitude, setAddAltitude] = useState(navlogDefaultSetup.defaultAltitude);
  const [fixInput, setFixInput] = useState("");
  const [routeWaypoints, setRouteWaypoints] = useState<NavlogRouteWaypoint[]>([]);

  const aircraftOptions = Object.keys(
    navlogAircraftProfiles
  ) as NavlogAircraftType[];

  const calculation = useMemo(
    () => buildNavlogCalculation(setup, routeWaypoints, navlogData),
    [setup, routeWaypoints, navlogData]
  );

  const summary = useMemo(
    () => navlogSummary(calculation.legs),
    [calculation.legs]
  );

  const pointResults = useMemo(() => {
    if (!navlogData) return [];

    const query = pointSearch.trim().toUpperCase();

    if (!query) return navlogData.points.slice(0, 10);

    return navlogData.points
      .filter((point) => {
        return (
          point.code.includes(query) ||
          point.name.toUpperCase().includes(query) ||
          point.src.includes(query) ||
          point.routes.toUpperCase().includes(query)
        );
      })
      .slice(0, 14);
  }, [navlogData, pointSearch]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoadingData(true);
      setDataError(null);

      try {
        const data = await loadAllNavlogData();

        if (!cancelled) {
          setNavlogData(data);
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setDataError("Não foi possível carregar os dados do NavLog.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateSetup<K extends keyof NavlogSetupForm>(
    key: K,
    value: NavlogSetupForm[K]
  ) {
    setSetup((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleAircraftChange(aircraftType: NavlogAircraftType) {
    setSetup((current) => applyAircraftProfile(current, aircraftType));
  }

  function handleRegistrationChange(registration: string) {
    const aircraftType = getAircraftTypeFromRegistration(registration);

    setSetup((current) => ({
      ...applyAircraftProfile(current, aircraftType),
      registration,
    }));
  }

  function addPoint(point: NavlogPoint) {
    setRouteWaypoints((current) => [
      ...current,
      makeWaypointFromPoint(point, setup, addAltitude),
    ]);
  }

  function addMapPoint(lat: number, lon: number) {
    const point: NavlogPoint = {
      code: `MAP${routeWaypoints.length + 1}`,
      name: "Map point",
      lat,
      lon,
      alt: addAltitude,
      src: "VFR",
      routes: "",
      remarks: "Added from map",
    };

    addPoint(point);
  }


  function replaceRouteFromText() {
    if (!navlogData) return;

    const result = parseRouteText(routeText, navlogData, setup, addAltitude);

    setRouteWaypoints(result.waypoints);
    setRouteWarnings(result.warnings);
  }

  function appendRouteFromText() {
    if (!navlogData) return;

    const result = parseRouteText(routeText, navlogData, setup, addAltitude);

    setRouteWaypoints((current) => [...current, ...result.waypoints]);
    setRouteWarnings(result.warnings);
  }

  function addVorFix() {
    if (!navlogData) return;

    const fix = makeVorRadialDistanceFix(
      fixInput,
      navlogData,
      setup,
      addAltitude
    );

    if (!fix) {
      setRouteWarnings([
        "Fix VOR inválido. Usa formato tipo CAS/R180/D12.",
      ]);
      return;
    }

    setRouteWaypoints((current) => [...current, fix]);
    setFixInput("");
    setRouteWarnings([]);
  }

  function updateWaypoint(
    id: string,
    patch: Partial<Omit<NavlogRouteWaypoint, "id" | "point">>
  ) {
    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === id
          ? {
              ...waypoint,
              ...patch,
            }
          : waypoint
      )
    );
  }

  function removeWaypoint(id: string) {
    setRouteWaypoints((current) =>
      current.filter((waypoint) => waypoint.id !== id)
    );
  }

  function moveWaypoint(id: string, direction: "up" | "down") {
    setRouteWaypoints((current) => {
      const index = current.findIndex((waypoint) => waypoint.id === id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const currentWaypoint = next[index];
      const swapWaypoint = next[nextIndex];

      next[index] = swapWaypoint;
      next[nextIndex] = currentWaypoint;

      return next;
    });
  }

  function clearRoute() {
    setRouteWaypoints([]);
    setRouteWarnings([]);
  }

  function exportCsv() {
    downloadTextFile(
      navlogLegsToCsv(calculation.legs),
      "navlog.csv",
      "text/csv;charset=utf-8"
    );
  }

  return (
    <div className="space-y-8">
      <section className="border-b border-zinc-200 pb-8">
        <p className="mb-3 text-sm font-medium text-zinc-500">
          VFR / IFR Low
        </p>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              NavLog
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
              Agora começamos a portar o motor real do teste.py: rota por texto,
              pontos, VOR fixes, TOC/TOD automático, vento, headings, GS, ETE,
              fuel e EFOB.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">ETE</p>
              <p className="font-semibold text-zinc-950">
                {formatDuration(summary.timeSec)}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">Dist</p>
              <p className="font-semibold text-zinc-950">
                {summary.distNm.toFixed(1)} NM
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">Fuel</p>
              <p className="font-semibold text-zinc-950">
                {summary.burnL.toFixed(0)} L
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">EFOB</p>
              <p className="font-semibold text-zinc-950">
                {summary.finalEfob.toFixed(0)} L
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-zinc-700">Aeronave</span>
            <select
              value={setup.aircraftType}
              onChange={(event) =>
                handleAircraftChange(event.target.value as NavlogAircraftType)
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            >
              {aircraftOptions.map((aircraft) => (
                <option key={aircraft} value={aircraft}>
                  {aircraft}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-zinc-700">Matrícula</span>
            <select
              value={setup.registration}
              onChange={(event) => handleRegistrationChange(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            >
              <optgroup label="Piper PA-28">
                {piperRegistrations.map((registration) => (
                  <option key={registration} value={registration}>
                    {registration}
                  </option>
                ))}
              </optgroup>

              <optgroup label="Tecnam P2008">
                {tecnamRegistrations.map((registration) => (
                  <option key={registration} value={registration}>
                    {registration}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <NumberInput
            label="EFOB inicial L"
            value={setup.startEfob}
            min={0}
            max={300}
            onChange={(value) => updateSetup("startEfob", value)}
          />

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-zinc-700">
              Hora off-blocks
            </span>
            <input
              type="time"
              value={setup.startClock}
              onChange={(event) =>
                updateSetup("startClock", event.target.value)
              }
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-6">
          <NumberInput
            label="Climb TAS"
            value={setup.climbTas}
            onChange={(value) => updateSetup("climbTas", value)}
          />

          <NumberInput
            label="Cruise TAS"
            value={setup.cruiseTas}
            onChange={(value) => updateSetup("cruiseTas", value)}
          />

          <NumberInput
            label="Descent TAS"
            value={setup.descentTas}
            onChange={(value) => updateSetup("descentTas", value)}
          />

          <NumberInput
            label="Fuel L/h"
            value={setup.fuelFlowLh}
            onChange={(value) => updateSetup("fuelFlowLh", value)}
          />

          <NumberInput
            label="ROC"
            value={setup.rocFpm}
            step={50}
            onChange={(value) => updateSetup("rocFpm", value)}
          />

          <NumberInput
            label="ROD"
            value={setup.rodFpm}
            step={50}
            onChange={(value) => updateSetup("rodFpm", value)}
          />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-5">
          <NumberInput
            label="Altitude default"
            value={setup.defaultAltitude}
            step={100}
            onChange={(value) => {
              updateSetup("defaultAltitude", value);
              setAddAltitude(value);
            }}
          />

          <NumberInput
            label="Wind from"
            value={setup.windFrom}
            min={0}
            max={360}
            step={10}
            onChange={(value) => updateSetup("windFrom", value)}
          />

          <NumberInput
            label="Wind kt"
            value={setup.windKt}
            min={0}
            max={100}
            onChange={(value) => updateSetup("windKt", value)}
          />

          <NumberInput
            label="Mag var"
            value={setup.magVar}
            min={0}
            max={30}
            step={0.1}
            onChange={(value) => updateSetup("magVar", value)}
          />

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-zinc-700">Mag dir</span>
            <select
              value={setup.magDirection}
              onChange={(event) =>
                updateSetup("magDirection", event.target.value as "E" | "W")
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            >
              <option value="W">W</option>
              <option value="E">E</option>
            </select>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          ["route", "1 · Rota"],
          ["map", "2 · Mapa"],
          ["navlog", "3 · Navlog / PDF"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as ActiveTab)}
            className={[
              "rounded-xl px-4 py-2 text-sm font-medium transition",
              activeTab === id
                ? "bg-zinc-950 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "route" ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <main className="space-y-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                Rota por texto
              </h2>

              <textarea
                value={routeText}
                onChange={(event) => setRouteText(event.target.value)}
                placeholder="LPSO NSA MAGUM PORCA TRAMA SALTE MENDA"
                className="mt-4 h-24 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
              />

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={replaceRouteFromText}
                  disabled={!navlogData}
                  className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  Substituir rota
                </button>

                <button
                  type="button"
                  onClick={appendRouteFromText}
                  disabled={!navlogData}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
                >
                  Acrescentar
                </button>

                <button
                  type="button"
                  onClick={clearRoute}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-zinc-50"
                >
                  Limpar
                </button>
              </div>

              {routeWarnings.length > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  {routeWarnings.map((warning) => (
                    <p key={warning} className="text-sm text-amber-800">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                Fix VOR radial/distância
              </h2>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px]">
                <input
                  value={fixInput}
                  onChange={(event) => setFixInput(event.target.value)}
                  placeholder="CAS/R180/D12"
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                />

                <button
                  type="button"
                  onClick={addVorFix}
                  disabled={!navlogData}
                  className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  Adicionar fix
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                    Waypoints
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    A ordem desta tabela é a ordem usada no cálculo.
                  </p>
                </div>

                <p className="text-sm font-medium text-zinc-500">
                  Item 15: {routeItem15(routeWaypoints) || "—"}
                </p>
              </div>

              {routeWaypoints.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
                  Ainda não há waypoints.
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-left text-sm">
                      <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Point</th>
                          <th className="px-4 py-3">Alt</th>
                          <th className="px-4 py-3">Stop</th>
                          <th className="px-4 py-3">Wind</th>
                          <th className="px-4 py-3">VOR</th>
                          <th className="px-4 py-3">Note</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {routeWaypoints.map((waypoint, index) => (
                          <tr key={waypoint.id}>
                            <td className="px-4 py-3 align-top text-zinc-500">
                              {index + 1}
                            </td>

                            <td className="px-4 py-3 align-top">
                              <p className="font-semibold text-zinc-950">
                                {waypoint.point.code}
                              </p>
                              <p className="mt-0.5 max-w-48 truncate text-xs text-zinc-500">
                                {waypoint.point.name}
                              </p>
                              <p className="mt-0.5 text-xs text-zinc-400">
                                {waypoint.point.src}
                              </p>
                            </td>

                            <td className="px-4 py-3 align-top">
                              <input
                                type="number"
                                value={waypoint.altitudeFt}
                                step={100}
                                onChange={(event) =>
                                  updateWaypoint(waypoint.id, {
                                    altitudeFt: Number(event.target.value),
                                  })
                                }
                                className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5 outline-none focus:border-zinc-400"
                              />
                            </td>

                            <td className="px-4 py-3 align-top">
                              <input
                                type="number"
                                value={waypoint.stopMin}
                                min={0}
                                step={1}
                                onChange={(event) =>
                                  updateWaypoint(waypoint.id, {
                                    stopMin: Number(event.target.value),
                                  })
                                }
                                className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 outline-none focus:border-zinc-400"
                              />
                            </td>

                            <td className="px-4 py-3 align-top">
                              <label className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                                <input
                                  type="checkbox"
                                  checked={waypoint.useGlobalWind}
                                  onChange={(event) =>
                                    updateWaypoint(waypoint.id, {
                                      useGlobalWind: event.target.checked,
                                    })
                                  }
                                />
                                Global
                              </label>

                              {waypoint.useGlobalWind ? (
                                <p className="text-sm text-zinc-600">
                                  {String(setup.windFrom).padStart(3, "0")}/
                                  {setup.windKt}
                                </p>
                              ) : (
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={waypoint.windFrom}
                                    className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5 outline-none focus:border-zinc-400"
                                    onChange={(event) =>
                                      updateWaypoint(waypoint.id, {
                                        windFrom: Number(event.target.value),
                                      })
                                    }
                                  />

                                  <input
                                    type="number"
                                    value={waypoint.windKt}
                                    className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5 outline-none focus:border-zinc-400"
                                    onChange={(event) =>
                                      updateWaypoint(waypoint.id, {
                                        windKt: Number(event.target.value),
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 align-top">
                              <select
                                value={waypoint.vorPref}
                                onChange={(event) =>
                                  updateWaypoint(waypoint.id, {
                                    vorPref: event.target.value as
                                      | "AUTO"
                                      | "FIXED",
                                  })
                                }
                                className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 outline-none focus:border-zinc-400"
                              >
                                <option value="AUTO">AUTO</option>
                                <option value="FIXED">FIXED</option>
                              </select>

                              {waypoint.vorPref === "FIXED" ? (
                                <input
                                  value={waypoint.vorIdent}
                                  onChange={(event) =>
                                    updateWaypoint(waypoint.id, {
                                      vorIdent: event.target.value.toUpperCase(),
                                    })
                                  }
                                  placeholder="CAS"
                                  className="mt-2 w-24 rounded-lg border border-zinc-200 px-2 py-1.5 outline-none focus:border-zinc-400"
                                />
                              ) : null}
                            </td>

                            <td className="px-4 py-3 align-top">
                              <input
                                value={waypoint.note}
                                onChange={(event) =>
                                  updateWaypoint(waypoint.id, {
                                    note: event.target.value,
                                  })
                                }
                                placeholder="NAVLOG text"
                                className="w-40 rounded-lg border border-zinc-200 px-2 py-1.5 outline-none focus:border-zinc-400"
                              />
                            </td>

                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => moveWaypoint(waypoint.id, "up")}
                                  disabled={index === 0}
                                  className="rounded-lg border border-zinc-200 px-2 py-1 text-xs disabled:opacity-40"
                                >
                                  ↑
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    moveWaypoint(waypoint.id, "down")
                                  }
                                  disabled={index === routeWaypoints.length - 1}
                                  className="rounded-lg border border-zinc-200 px-2 py-1 text-xs disabled:opacity-40"
                                >
                                  ↓
                                </button>

                                <button
                                  type="button"
                                  onClick={() => removeWaypoint(waypoint.id)}
                                  className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-zinc-50"
                                >
                                  Remover
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                Pesquisa
              </h2>

              <NumberInput
                label="Altitude ao adicionar"
                value={addAltitude}
                step={100}
                onChange={setAddAltitude}
              />

              <input
                value={pointSearch}
                onChange={(event) => setPointSearch(event.target.value)}
                placeholder="LPSO, ESP, MAGUM..."
                className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
              />

              <div className="mt-4 max-h-[540px] space-y-2 overflow-auto pr-1">
                {isLoadingData ? (
                  <p className="text-sm text-zinc-500">A carregar dados...</p>
                ) : dataError ? (
                  <p className="text-sm text-red-600">{dataError}</p>
                ) : (
                  pointResults.map((point) => (
                    <div
                      key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
                      className="rounded-xl border border-zinc-100 bg-zinc-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-950">
                            {point.code}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {point.name}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {point.src} · {point.lat.toFixed(5)},{" "}
                            {point.lon.toFixed(5)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => addPoint(point)}
                          className="rounded-lg bg-zinc-950 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

          </aside>
        </section>
      ) : null}

      {activeTab === "map" && navlogData ? (
        <NavlogMap
          points={navlogData.points}
          routeWaypoints={routeWaypoints}
          calculatedNodes={calculation.nodes}
          searchQuery={pointSearch}
          onAddPoint={addPoint}
          onAddMapPoint={addMapPoint}
        />
      ) : null}

      {activeTab === "navlog" ? (
        <section className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Navlog calculado
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Cálculo automático de TC/TH/MH/GS/ETE/Fuel/EFOB.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={calculation.legs.length === 0}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
                >
                  Export CSV
                </button>

                <button
                  type="button"
                  disabled
                  className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-500"
                >
                  PDF NAVLOG em breve
                </button>
              </div>
            </div>

            {calculation.legs.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
                Cria uma rota com pelo menos dois waypoints para ver o navlog.
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-left text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-3">Leg</th>
                        <th className="px-3 py-3">From</th>
                        <th className="px-3 py-3">To</th>
                        <th className="px-3 py-3">Profile</th>
                        <th className="px-3 py-3">TC</th>
                        <th className="px-3 py-3">TH</th>
                        <th className="px-3 py-3">MH</th>
                        <th className="px-3 py-3">TAS</th>
                        <th className="px-3 py-3">GS</th>
                        <th className="px-3 py-3">Dist</th>
                        <th className="px-3 py-3">ETE</th>
                        <th className="px-3 py-3">Fuel</th>
                        <th className="px-3 py-3">EFOB</th>
                        <th className="px-3 py-3">Clock</th>
                        <th className="px-3 py-3">Tracking</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-zinc-100">
                      {calculation.legs.map((leg) => (
                        <tr key={leg.i}>
                          <td className="px-3 py-3">{leg.i}</td>
                          <td className="px-3 py-3 font-medium">
                            {leg.from.code}
                          </td>
                          <td className="px-3 py-3 font-medium">
                            {leg.to.code}
                          </td>
                          <td className="px-3 py-3">{leg.profile}</td>
                          <td className="px-3 py-3">{leg.tc.toFixed(0)}</td>
                          <td className="px-3 py-3">{leg.th.toFixed(0)}</td>
                          <td className="px-3 py-3">{leg.mh.toFixed(0)}</td>
                          <td className="px-3 py-3">{leg.tas.toFixed(0)}</td>
                          <td className="px-3 py-3">{leg.gs.toFixed(0)}</td>
                          <td className="px-3 py-3">
                            {leg.distNm.toFixed(1)}
                          </td>
                          <td className="px-3 py-3">
                            {formatDuration(leg.eteSec)}
                          </td>
                          <td className="px-3 py-3">
                            {leg.burnL.toFixed(0)}
                          </td>
                          <td className="px-3 py-3">
                            {leg.efobEndL.toFixed(0)}
                          </td>
                          <td className="px-3 py-3">
                            {leg.clockStart} → {leg.clockArrive}
                          </td>
                          <td className="max-w-48 whitespace-pre-line px-3 py-3 text-zinc-600">
                            {leg.tracking || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </section>
      ) : null}
    </div>
  );
}
