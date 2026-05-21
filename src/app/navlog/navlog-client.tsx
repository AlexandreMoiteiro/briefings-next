"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadAllNavlogData } from "@/lib/navlog-data";
import { buildNavlogFormPdf } from "@/lib/pdf/navlog-form-pdf";
import {
  buildNavlogCalculation,
  formatDuration,
  makeWaypointFromPoint,
  navlogSummary,
  parseRouteText,
  routeItem15,
} from "@/lib/navlog-engine";
import {
  createSupabasePerfectRoute,
  deleteSupabasePerfectRoute,
  loadSupabasePerfectRoutes,
  perfectRouteToWaypoints,
  routeToText,
  updateSupabasePerfectRoute,
  type PerfectRoute,
} from "@/lib/navlog-saved-routes";
import {
  applyAircraftProfile,
  getAircraftTypeFromRegistration,
  navlogAircraftProfiles,
  navlogDefaultSetup,
  navlogReferenceLayers,
  piperRegistrations,
  tecnamRegistrations,
  type NavlogAircraftType,
  type NavlogDataBundle,
  type NavlogPoint,
  type NavlogReferenceLayer,
  type NavlogRouteWaypoint,
  type NavlogSetupForm,
} from "@/lib/navlog";

const NavlogMap = dynamic(
  () => import("./navlog-map").then((module) => module.NavlogMap),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[720px] rounded-3xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-500">A carregar mapa...</p>
      </div>
    ),
  }
);

type BottomMode = "waypoints" | "navlog";
type SidebarMode = "routes" | "search" | "layers";

const emptyNavlogData: NavlogDataBundle = {
  points: [],
  vors: [],
  airways: [],
  procedures: [],
};

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
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
      />
    </label>
  );
}

function downloadBinaryFile(bytes: Uint8Array, filename: string, mime: string) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  const blob = new Blob([arrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

const LITERS_PER_US_GALLON = 3.785411784;

function formatFuelDisplay(liters: number) {
  const roundedLiters = Math.max(0, Math.round(liters || 0));
  const roundedGallons = Math.max(
    0,
    Math.round(roundedLiters / LITERS_PER_US_GALLON)
  );

  return `${roundedLiters}(${roundedGallons})`;
}

function manualPointCode(index: number) {
  return `MAP${String(index + 1).padStart(2, "0")}`;
}

function SidebarTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-zinc-950 text-white"
          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function NavlogClient() {
  const [hasMounted, setHasMounted] = useState(false);
  const [setup, setSetup] = useState<NavlogSetupForm>(navlogDefaultSetup);
  const [navlogData, setNavlogData] = useState<NavlogDataBundle | null>(null);
  const [perfectRoutes, setPerfectRoutes] = useState<PerfectRoute[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [pointSearch, setPointSearch] = useState("");
  const [routeText, setRouteText] = useState("");
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [routeSaveName, setRouteSaveName] = useState("");
  const [routeSaveStatus, setRouteSaveStatus] = useState("");
  const [routeSaveBusy, setRouteSaveBusy] = useState(false);
  const [addAltitude, setAddAltitude] = useState(
    navlogDefaultSetup.defaultAltitude
  );
  const [routeWaypoints, setRouteWaypoints] = useState<NavlogRouteWaypoint[]>(
    []
  );
  const [bottomMode, setBottomMode] = useState<BottomMode>("waypoints");
  const [showPerformancePanel, setShowPerformancePanel] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("routes");
  const [manualMapClickEnabled, setManualMapClickEnabled] = useState(false);

  const aircraftOptions = Object.keys(
    navlogAircraftProfiles
  ) as NavlogAircraftType[];

  const registrationOptions =
    setup.aircraftType === "Piper PA-28"
      ? piperRegistrations
      : tecnamRegistrations;

  const calculation = useMemo(
    () => buildNavlogCalculation(setup, routeWaypoints, navlogData),
    [setup, routeWaypoints, navlogData]
  );

  const summary = useMemo(
    () => navlogSummary(calculation.legs),
    [calculation.legs]
  );

  const calculatedOnBlockClock = calculation.legs.at(-1)?.clockEnd ?? "";

  const pointResults = useMemo(() => {
    if (!navlogData) return [];

    const query = pointSearch.trim().toUpperCase();
    if (!query) return [];

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

  const filteredPerfectRoutes = useMemo(() => {
    const query = routeSearch.trim().toUpperCase();

    if (!query) return perfectRoutes;

    return perfectRoutes.filter((route) =>
      route.name.toUpperCase().includes(query)
    );
  }, [perfectRoutes, routeSearch]);

  const selectedPerfectRoute = perfectRoutes.find(
    (route) => route.id === selectedRouteId
  );

  const vorOptions = useMemo(() => {
    if (!navlogData) return [];

    return Array.from(
      new Set(
        navlogData.points
          .filter((point) => point.src === "VOR")
          .map((point) => point.code)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [navlogData]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNavigationData() {
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
      }
    }

    async function loadRoutes() {
      try {
        const routes = await loadSupabasePerfectRoutes();

        if (!cancelled) {
          setPerfectRoutes(routes);
          setSelectedRouteId(routes[0]?.id ?? "");
          setRouteSaveName(routes[0]?.name ?? "");
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setPerfectRoutes([]);
        }
      }
    }

    loadNavigationData();
    loadRoutes();

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

  function toggleReferenceLayer(layer: NavlogReferenceLayer, checked: boolean) {
    setSetup((current) => {
      const nextLayers = checked
        ? Array.from(new Set([...current.referenceLayers, layer]))
        : current.referenceLayers.filter((item) => item !== layer);

      return {
        ...current,
        referenceLayers: nextLayers,
      };
    });
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
      makeWaypointFromPoint(point, setup, addAltitude, 0),
    ]);

    setBottomMode("waypoints");
  }

  function addMapPoint(lat: number, lon: number) {
    const point: NavlogPoint = {
      code: manualPointCode(routeWaypoints.length),
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

  function loadPerfectRoute(route: PerfectRoute) {
    setSelectedRouteId(route.id);
    setRouteSaveName(route.name);
    setRouteWaypoints(perfectRouteToWaypoints(route, setup));
    setRouteText(routeToText(route));
    setRouteWarnings([]);
    setRouteSaveStatus("");
    setBottomMode("waypoints");
  }

  function replaceRouteFromText() {
    if (!navlogData) return;

    const result = parseRouteText(routeText, navlogData, setup, addAltitude);

    setRouteWaypoints(result.waypoints);
    setRouteWarnings(result.warnings);
    setBottomMode("waypoints");
  }

  function appendRouteFromText() {
    if (!navlogData) return;

    const result = parseRouteText(routeText, navlogData, setup, addAltitude);

    setRouteWaypoints((current) => [...current, ...result.waypoints]);
    setRouteWarnings(result.warnings);
    setBottomMode("waypoints");
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

  function updateWaypointPoint(
    id: string,
    patch: Partial<NavlogPoint>
  ) {
    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === id
          ? {
              ...waypoint,
              point: {
                ...waypoint.point,
                ...patch,
              },
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
    setRouteSaveStatus("");
    setBottomMode("waypoints");
  }

  async function createSavedRoute() {
    if (!routeSaveName.trim()) {
      setRouteSaveStatus("Dá um nome à rota.");
      return;
    }

    if (routeWaypoints.length < 2) {
      setRouteSaveStatus("A rota precisa de pelo menos dois pontos.");
      return;
    }

    setRouteSaveBusy(true);
    setRouteSaveStatus("");

    try {
      const created = await createSupabasePerfectRoute(
        routeSaveName,
        routeWaypoints
      );

      setPerfectRoutes((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setSelectedRouteId(created.id);
      setRouteSaveName(created.name);
      setRouteSaveStatus("Rota criada.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Não consegui criar a rota.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function updateSavedRoute() {
    const selected = perfectRoutes.find((route) => route.id === selectedRouteId);

    if (!selected) {
      setRouteSaveStatus("Seleciona uma rota para atualizar.");
      return;
    }

    if (!routeSaveName.trim()) {
      setRouteSaveStatus("Dá um nome à rota.");
      return;
    }

    if (routeWaypoints.length < 2) {
      setRouteSaveStatus("A rota precisa de pelo menos dois pontos.");
      return;
    }

    setRouteSaveBusy(true);
    setRouteSaveStatus("");

    try {
      const updated = await updateSupabasePerfectRoute(
        selected.id,
        routeSaveName,
        routeWaypoints
      );

      setPerfectRoutes((current) =>
        current
          .map((route) => (route.id === updated.id ? updated : route))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setSelectedRouteId(updated.id);
      setRouteSaveName(updated.name);
      setRouteSaveStatus("Rota atualizada.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Não consegui atualizar a rota.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function deleteSavedRoute() {
    const selected = perfectRoutes.find((route) => route.id === selectedRouteId);

    if (!selected) {
      setRouteSaveStatus("Seleciona uma rota para apagar.");
      return;
    }

    const confirmed = window.confirm(`Apagar a rota "${selected.name}"?`);

    if (!confirmed) return;

    setRouteSaveBusy(true);
    setRouteSaveStatus("");

    try {
      await deleteSupabasePerfectRoute(selected.id);

      setPerfectRoutes((current) =>
        current.filter((route) => route.id !== selected.id)
      );

      const nextRoute = perfectRoutes.find((route) => route.id !== selected.id);

      setSelectedRouteId(nextRoute?.id ?? "");
      setRouteSaveName(nextRoute?.name ?? "");
      setRouteSaveStatus("Rota apagada.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Não consegui apagar a rota.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function exportNavlogPdf() {
    const bytes = await buildNavlogFormPdf({
      setup,
      waypoints: routeWaypoints,
      calculation,
      navlogData,
    });

    downloadBinaryFile(
      bytes,
      `NAVLOG_${setup.registration}_${new Date().toISOString().slice(0, 10)}.pdf`,
      "application/pdf"
    );
  }

  if (!hasMounted) {
    return (
      <div className="space-y-6">
        <section className="border-b border-zinc-200 pb-6">
          <p className="mb-3 text-sm font-medium text-zinc-500">
            VFR / IFR Low
          </p>

          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
            NavLog
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
            A preparar o NavLog...
          </p>
        </section>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-500">A carregar interface...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-500">
              VFR / IFR Low
            </p>

            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              NavLog
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
              Planeamento centrado no mapa: escolhe uma route, ajusta setup,
              edita pontos e valida o NavLog calculado.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">ETE</p>
              <p className="font-semibold text-orange-600">
                {formatDuration(summary.timeSec)}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">Dist</p>
              <p className="font-semibold text-zinc-950">
                {summary.distNm.toFixed(1)} NM
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">Fuel</p>
              <p className="font-semibold text-zinc-950">
                {formatFuelDisplay(summary.burnL)}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <p className="text-zinc-500">EFOB</p>
              <p className="font-semibold text-zinc-950">
                {formatFuelDisplay(summary.finalEfob)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Aeronave
            </span>
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
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Matrícula
            </span>
            <select
              value={setup.registration}
              onChange={(event) => handleRegistrationChange(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            >
              {registrationOptions.map((registration) => (
                <option key={registration} value={registration}>
                  {registration}
                </option>
              ))}
            </select>
          </label>

          <NumberInput
            label="EFOB L"
            value={setup.startEfob}
            min={0}
            max={300}
            onChange={(value) => updateSetup("startEfob", value)}
          />

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Off-blocks
            </span>
            <input
              type="time"
              value={setup.startClock}
              onChange={(event) => updateSetup("startClock", event.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              On-blocks
            </span>
            <div className="flex gap-2">
              <input
                type="time"
                value={setup.onBlockClock}
                onChange={(event) =>
                  updateSetup("onBlockClock", event.target.value)
                }
                className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
              />

              <button
                type="button"
                disabled={!setup.startClock || !calculatedOnBlockClock}
                onClick={() => updateSetup("onBlockClock", calculatedOnBlockClock)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
                title="Calcular on-block estimado a partir do NavLog"
              >
                Auto
              </button>
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Lesson
            </span>
            <input
              value={setup.lesson}
              onChange={(event) => updateSetup("lesson", event.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Instructor
            </span>
            <input
              value={setup.instructor}
              onChange={(event) => updateSetup("instructor", event.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Student
            </span>
            <input
              value={setup.student}
              onChange={(event) => updateSetup("student", event.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            />
          </label>

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
            label="Alt add"
            value={addAltitude}
            min={0}
            max={20000}
            step={100}
            onChange={setAddAltitude}
          />

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setShowPerformancePanel((current) => !current)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              {showPerformancePanel ? "Esconder performance" : "Performance"}
            </button>
          </div>
        </div>

        {showPerformancePanel ? (
          <div className="mt-5 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-zinc-950">
                Performance e cálculo
              </h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Valores usados no cálculo das pernas, TOC/TOD, fuel e EFOB.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
              <NumberInput
                label="Climb TAS"
                value={setup.climbTas}
                min={30}
                max={250}
                onChange={(value) => updateSetup("climbTas", value)}
              />

              <NumberInput
                label="Cruise TAS"
                value={setup.cruiseTas}
                min={30}
                max={300}
                onChange={(value) => updateSetup("cruiseTas", value)}
              />

              <NumberInput
                label="Descent TAS"
                value={setup.descentTas}
                min={30}
                max={250}
                onChange={(value) => updateSetup("descentTas", value)}
              />

              <NumberInput
                label="Fuel L/h"
                value={setup.fuelFlowLh}
                min={0}
                max={120}
                onChange={(value) => updateSetup("fuelFlowLh", value)}
              />

              <NumberInput
                label="Taxi time"
                value={setup.taxiMin}
                min={0}
                max={120}
                step={5}
                onChange={(value) => updateSetup("taxiMin", value)}
              />

              <NumberInput
                label="Taxi FF"
                value={setup.taxiFuelFlowLh}
                min={0}
                max={40}
                step={0.5}
                onChange={(value) => updateSetup("taxiFuelFlowLh", value)}
              />

              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Taxi fuel
                </span>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                  {((setup.taxiFuelFlowLh * setup.taxiMin) / 60).toFixed(1)} L
                </div>
              </div>

              <NumberInput
                label="ROC"
                value={setup.rocFpm}
                min={100}
                max={2000}
                step={50}
                onChange={(value) => updateSetup("rocFpm", value)}
              />

              <NumberInput
                label="ROD"
                value={setup.rodFpm}
                min={100}
                max={2000}
                step={50}
                onChange={(value) => updateSetup("rodFpm", value)}
              />

              <NumberInput
                label="Default alt"
                value={setup.defaultAltitude}
                min={0}
                max={20000}
                step={100}
                onChange={(value) => {
                  updateSetup("defaultAltitude", value);
                  setAddAltitude(value);
                }}
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
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Mag dir
                </span>
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
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <SidebarTabButton
                active={sidebarMode === "routes"}
                label="Routes"
                onClick={() => setSidebarMode("routes")}
              />
              <SidebarTabButton
                active={sidebarMode === "search"}
                label="Search"
                onClick={() => setSidebarMode("search")}
              />
              <SidebarTabButton
                active={sidebarMode === "layers"}
                label="Layers"
                onClick={() => setSidebarMode("layers")}
              />
            </div>

            {sidebarMode === "routes" ? (
              <div className="mt-4 space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">
                    Perfect routes
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Rotas carregadas diretamente do Supabase.
                  </p>

                  <input
                    value={routeSearch}
                    onChange={(event) => setRouteSearch(event.target.value)}
                    placeholder="Pesquisar rota..."
                    className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />

                  <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
                    {filteredPerfectRoutes.map((route) => (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => {
                          setSelectedRouteId(route.id);
                          setRouteSaveName(route.name);
                          setRouteSaveStatus("");
                        }}
                        className={[
                          "w-full rounded-2xl border px-3 py-3 text-left transition",
                          selectedRouteId === route.id
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-white",
                        ].join(" ")}
                      >
                        <span className="block text-sm font-semibold">
                          {route.name}
                        </span>
                        <span
                          className={[
                            "mt-1 block text-xs",
                            selectedRouteId === route.id
                              ? "text-zinc-300"
                              : "text-zinc-500",
                          ].join(" ")}
                        >
                          {route.waypoints.length} waypoints
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      selectedPerfectRoute
                        ? loadPerfectRoute(selectedPerfectRoute)
                        : undefined
                    }
                    disabled={!selectedPerfectRoute}
                    className="mt-4 w-full rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                  >
                    Carregar rota
                  </button>
                </div>

                <div className="border-t border-zinc-200 pt-5">
                  <h2 className="text-sm font-semibold text-zinc-950">
                    Guardar rota
                  </h2>

                  <input
                    value={routeSaveName}
                    onChange={(event) => setRouteSaveName(event.target.value)}
                    placeholder="Nome da rota..."
                    className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={createSavedRoute}
                      disabled={routeSaveBusy || routeWaypoints.length < 2}
                      className="rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                    >
                      Nova
                    </button>

                    <button
                      type="button"
                      onClick={updateSavedRoute}
                      disabled={
                        routeSaveBusy ||
                        !selectedRouteId ||
                        routeWaypoints.length < 2
                      }
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
                    >
                      Atualizar
                    </button>

                    <button
                      type="button"
                      onClick={deleteSavedRoute}
                      disabled={routeSaveBusy || !selectedRouteId}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                    >
                      Apagar
                    </button>
                  </div>

                  {routeSaveStatus ? (
                    <p className="mt-3 text-sm text-zinc-500">
                      {routeSaveStatus}
                    </p>
                  ) : null}
                </div>

                <div className="border-t border-zinc-200 pt-5">
                  <h2 className="text-sm font-semibold text-zinc-950">
                    Rota por texto
                  </h2>

                  <textarea
                    value={routeText}
                    onChange={(event) => setRouteText(event.target.value)}
                    placeholder="LPSO NSA MAGUM PORCA..."
                    className="mt-4 h-28 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={replaceRouteFromText}
                      disabled={!navlogData}
                      className="rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                    >
                      Substituir
                    </button>

                    <button
                      type="button"
                      onClick={appendRouteFromText}
                      disabled={!navlogData}
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
                    >
                      Acrescentar
                    </button>
                  </div>

                  {routeWarnings.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      {routeWarnings.map((warning) => (
                        <p key={warning} className="text-sm text-amber-800">
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {sidebarMode === "search" ? (
              <div className="mt-4 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">
                    Pesquisa rápida
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Pesquisa por code, nome, tipo ou route.
                  </p>

                  <input
                    value={pointSearch}
                    onChange={(event) => setPointSearch(event.target.value)}
                    placeholder="LPSO, ESP, MAGUM..."
                    className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />
                </div>

                <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                  {dataError ? (
                    <p className="text-sm text-red-600">{dataError}</p>
                  ) : pointSearch.trim() === "" ? (
                    <p className="text-sm text-zinc-500">
                      Escreve um ponto para procurar.
                    </p>
                  ) : pointResults.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      Sem resultados para a pesquisa atual.
                    </p>
                  ) : (
                    pointResults.map((point) => (
                      <div
                        key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
                        className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"
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
              </div>
            ) : null}

            {sidebarMode === "layers" ? (
              <div className="mt-4 space-y-4">
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <span>
                    <span className="block font-medium text-zinc-700">
                      Click manual
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      Clicar no mapa cria waypoint livre
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={manualMapClickEnabled}
                    onChange={(event) =>
                      setManualMapClickEnabled(event.target.checked)
                    }
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <span className="font-medium text-zinc-700">
                    Reference points
                  </span>
                  <input
                    type="checkbox"
                    checked={setup.showReferencePoints}
                    onChange={(event) =>
                      updateSetup("showReferencePoints", event.target.checked)
                    }
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {navlogReferenceLayers.map((layer) => (
                    <label
                      key={layer}
                      className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
                    >
                      <input
                        type="checkbox"
                        checked={setup.referenceLayers.includes(layer)}
                        onChange={(event) =>
                          toggleReferenceLayer(layer, event.target.checked)
                        }
                      />
                      {layer}
                    </label>
                  ))}
                </div>

              </div>
            ) : null}
          </section>
        </aside>

        <main>
          <NavlogMap
            points={(navlogData ?? emptyNavlogData).points}
            routeWaypoints={routeWaypoints}
            calculatedNodes={calculation.nodes}
            searchQuery={pointSearch}
            showReferencePoints={setup.showReferencePoints}
            referenceLayers={setup.referenceLayers}
            manualMapClickEnabled={manualMapClickEnabled}
            onAddPoint={addPoint}
            onAddMapPoint={addMapPoint}
          />
        </main>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Plano da rota
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Item 15: {routeItem15(routeWaypoints) || "—"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBottomMode("waypoints")}
              className={[
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                bottomMode === "waypoints"
                  ? "bg-zinc-950 text-white"
                  : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
            >
              Waypoints
            </button>

            <button
              type="button"
              onClick={() => setBottomMode("navlog")}
              className={[
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                bottomMode === "navlog"
                  ? "bg-zinc-950 text-white"
                  : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
            >
              NavLog
            </button>

            <button
              type="button"
              onClick={clearRoute}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-zinc-50"
            >
              Limpar
            </button>

            <button
              type="button"
              onClick={exportNavlogPdf}
              disabled={calculation.legs.length === 0}
              className="rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              Export NAVLOG PDF
            </button>

          </div>
        </div>

        {bottomMode === "waypoints" ? (
          <div className="overflow-hidden">
            {routeWaypoints.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">
                Carrega uma route, pesquisa pontos ou clica no mapa para começar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
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

                  <tbody className="divide-y divide-zinc-100">
                    {routeWaypoints.map((waypoint, index) => (
                      <tr key={waypoint.id}>
                        <td className="px-4 py-3 align-top text-zinc-500">
                          {index + 1}
                        </td>

                        <td className="px-4 py-3 align-top">
                          <div className="space-y-2">
                            <input
                              value={waypoint.point.code}
                              onChange={(event) =>
                                updateWaypointPoint(waypoint.id, {
                                  code: event.target.value
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9]/g, ""),
                                })
                              }
                              className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-semibold text-zinc-950 outline-none focus:border-zinc-400"
                            />

                            <input
                              value={waypoint.point.name}
                              onChange={(event) =>
                                updateWaypointPoint(waypoint.id, {
                                  name: event.target.value,
                                })
                              }
                              className="w-44 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600 outline-none focus:border-zinc-400"
                            />

                            <p className="text-xs text-zinc-400">
                              {waypoint.point.src}
                            </p>
                          </div>
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
                            <select
                              value={waypoint.vorIdent}
                              onChange={(event) =>
                                updateWaypoint(waypoint.id, {
                                  vorIdent: event.target.value,
                                })
                              }
                              className="mt-2 w-28 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 outline-none focus:border-zinc-400"
                            >
                              <option value="">Selecionar</option>
                              {vorOptions.map((vor) => (
                                <option key={vor} value={vor}>
                                  {vor}
                                </option>
                              ))}
                            </select>
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
                            className="w-44 rounded-lg border border-zinc-200 px-2 py-1.5 outline-none focus:border-zinc-400"
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
                              onClick={() => moveWaypoint(waypoint.id, "down")}
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
            )}
          </div>
        ) : null}

        {bottomMode === "navlog" ? (
          <div className="overflow-hidden">
            {calculation.legs.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">
                Cria uma rota com pelo menos dois pontos.
              </div>
            ) : (
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
                        <td className="px-3 py-3 font-medium">{leg.to.code}</td>
                        <td className="px-3 py-3">{leg.profile}</td>
                        <td className="px-3 py-3">{leg.tc.toFixed(0)}</td>
                        <td className="px-3 py-3">{leg.th.toFixed(0)}</td>
                        <td className="px-3 py-3">{leg.mh.toFixed(0)}</td>
                        <td className="px-3 py-3">{leg.tas.toFixed(0)}</td>
                        <td className="px-3 py-3">{leg.gs.toFixed(0)}</td>
                        <td className="px-3 py-3">{leg.distNm.toFixed(1)}</td>
                        <td className="px-3 py-3 font-semibold text-orange-600">
                          {formatDuration(leg.eteSec)}
                        </td>
                        <td className="px-3 py-3">{formatFuelDisplay(leg.burnL)}</td>
                        <td className="px-3 py-3">
                          {formatFuelDisplay(leg.efobEndL)}
                        </td>
                        <td className="px-3 py-3">
                          {leg.clockStart} → {leg.clockArrive}
                        </td>
                        <td className="max-w-56 whitespace-pre-line px-3 py-3 text-zinc-600">
                          {leg.tracking || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
