"use client";

import { logUsageEvent } from "@/lib/usage-events";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { WorkflowChecklist, type WorkflowStep } from "@/components/workflow-checklist";
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
  CUSTOM_AIRCRAFT_TYPE,
  getAircraftTypeFromRegistration,
  getRegistrationsForAircraft,
  navlogAircraftOptions,
  navlogDefaultSetup,
  navlogReferenceLayers,
  type NavlogAircraftType,
  type NavlogDataBundle,
  type NavlogPoint,
  type NavlogReferenceLayer,
  type NavlogRouteWaypoint,
  type NavlogRouteNode,
  type NavlogSetupForm,
} from "@/lib/navlog";

const NavlogMap = dynamic(
  () => import("./navlog-map").then((module) => module.NavlogMap),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[720px] rounded-3xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-500">Loading map...</p>
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
  title,
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
  title?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
        {title ? (
          <span
            className="group relative inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[11px] font-bold text-zinc-700 outline-none"
            tabIndex={0}
            aria-label={title}
          >
            ?
            <span className="pointer-events-none absolute left-0 top-6 z-[9999] hidden w-72 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs font-medium normal-case leading-5 tracking-normal text-white shadow-xl group-hover:block group-focus:block">
              {title}
            </span>
          </span>
        ) : null}
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
  const [routeBuildMode, setRouteBuildMode] = useState<"text" | "search">("text");
  const [savedRoutesMode, setSavedRoutesMode] = useState<"load" | "manage">("load");
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
  const [windConfirmed, setWindConfirmed] = useState(false);
  const aircraftOptions = navlogAircraftOptions;
  const isCustomAircraft = setup.aircraftType === CUSTOM_AIRCRAFT_TYPE;
  const registrationOptions = getRegistrationsForAircraft(setup.aircraftType);
  const aircraftPerformanceValuesReady =
    setup.climbTas > 0 &&
    setup.cruiseTas > 0 &&
    setup.descentTas > 0 &&
    setup.fuelFlowLh > 0 &&
    setup.taxiFuelFlowLh >= 0 &&
    setup.startEfob > 0 &&
    setup.rocFpm > 0 &&
    setup.rodFpm > 0;

  const calculation = useMemo(
    () => buildNavlogCalculation(setup, routeWaypoints, navlogData),
    [setup, routeWaypoints, navlogData]
  );

  const summary = useMemo(
    () => navlogSummary(calculation.legs),
    [calculation.legs]
  );

  const calculatedOnBlockClock = calculation.legs.at(-1)?.clockEnd ?? "";

  const waypointTableRows = useMemo(() => {
    const waypointById = new Map(
      routeWaypoints.map((waypoint, index) => [waypoint.id, { waypoint, index }])
    );

    const activeMarkersByPreviousWaypoint = new Map<
      string,
      Array<{
        kind: "marker";
        node: NavlogRouteNode;
        previousWaypointId: string;
        previousWaypointCode: string;
        nextWaypointCode: string;
      }>
    >();

    let previousWaypoint: NavlogRouteWaypoint | null = null;

    calculation.nodes.forEach((node, nodeIndex) => {
      const matchingWaypoint = waypointById.get(node.id);

      if (matchingWaypoint) {
        previousWaypoint = matchingWaypoint.waypoint;
        return;
      }

      if ((node.code !== "TOC" && node.code !== "TOD") || !previousWaypoint) {
        return;
      }

      const nextUserNode = calculation.nodes
        .slice(nodeIndex + 1)
        .find((candidate) => waypointById.has(candidate.id));

      const previousWaypointCode =
        previousWaypoint.point.code || previousWaypoint.point.name || "WP";
      const previousMarkers =
        activeMarkersByPreviousWaypoint.get(previousWaypoint.id) ?? [];

      previousMarkers.push({
        kind: "marker",
        node,
        previousWaypointId: previousWaypoint.id,
        previousWaypointCode,
        nextWaypointCode: nextUserNode?.code || nextUserNode?.name || "WP",
      });

      activeMarkersByPreviousWaypoint.set(previousWaypoint.id, previousMarkers);
    });

    return routeWaypoints.flatMap((waypoint, index) => {
      const nextWaypoint = routeWaypoints[index + 1];
      const rows: Array<
        | {
            kind: "waypoint";
            waypoint: NavlogRouteWaypoint;
            index: number;
          }
        | {
            kind: "marker";
            node: NavlogRouteNode;
            previousWaypointId: string;
            previousWaypointCode: string;
            nextWaypointCode: string;
          }
        | {
            kind: "removed-marker";
            previousWaypointId: string;
            markerCode: "TOC" | "TOD" | "TOC/TOD";
            previousWaypointCode: string;
            nextWaypointCode: string;
            fromAlt: number;
            toAlt: number;
          }
      > = [
        {
          kind: "waypoint",
          waypoint,
          index,
        },
      ];

      rows.push(...(activeMarkersByPreviousWaypoint.get(waypoint.id) ?? []));

      if (
        waypoint.suppressAutoVertical &&
        nextWaypoint &&
        Math.abs(nextWaypoint.altitudeFt - waypoint.altitudeFt) > 1
      ) {
        rows.push({
          kind: "removed-marker",
          previousWaypointId: waypoint.id,
          markerCode:
            nextWaypoint.altitudeFt > waypoint.altitudeFt
              ? "TOC"
              : nextWaypoint.altitudeFt < waypoint.altitudeFt
                ? "TOD"
                : "TOC/TOD",
          previousWaypointCode: waypoint.point.code || waypoint.point.name || "WP",
          nextWaypointCode:
            nextWaypoint.point.code || nextWaypoint.point.name || "WP",
          fromAlt: waypoint.altitudeFt,
          toAlt: nextWaypoint.altitudeFt,
        });
      }

      return rows;
    });
  }, [calculation.nodes, routeWaypoints]);

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

  const hasWorkingRoute = routeWaypoints.length >= 2;

  const navlogWorkflow = useMemo<WorkflowStep[]>(
    () => [
      {
        label: "Aircraft & timing",
        description: `${setup.aircraftType} · ${setup.registration || "no registration"} · off-block ${setup.startClock || "not set"}`,
        complete: Boolean(setup.registration && setup.startClock),
      },
      {
        label: "Wind checked",
        description: windConfirmed
          ? `${String(setup.windFrom).padStart(3, "0")}/${setup.windKt} kt confirmed`
          : "Enter the forecast wind and tick the confirmation box.",
        complete: windConfirmed,
        attention: !windConfirmed,
      },
      {
        label: "Route built",
        description: hasWorkingRoute
          ? `${routeWaypoints.length} waypoints · ${summary.distNm.toFixed(1)} NM`
          : "Load, paste, search or click waypoints.",
        complete: hasWorkingRoute,
      },
      {
        label: "Review NavLog",
        description: calculation.legs.length > 0
          ? `${formatDuration(summary.timeSec)} · EFOB ${formatFuelDisplay(summary.finalEfob)}`
          : "Open the NavLog tab and check headings, times and fuel.",
        complete: calculation.legs.length > 0 && windConfirmed,
      },
      {
        label: "Export",
        description: "Generate the official NavLog PDF after review.",
        complete: calculation.legs.length > 0 && windConfirmed,
      },
    ],
    [
      calculation.legs.length,
      hasWorkingRoute,
      routeWaypoints.length,
      setup.aircraftType,
      setup.registration,
      setup.startClock,
      setup.windFrom,
      setup.windKt,
      summary.distNm,
      summary.finalEfob,
      summary.timeSec,
      windConfirmed,
    ]
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
          setDataError("Could not load NavLog data.");
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

  function updateWind<K extends "windFrom" | "windKt">(
    key: K,
    value: NavlogSetupForm[K]
  ) {
    setWindConfirmed(false);
    updateSetup(key, value);
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
    const nextSetup = applyAircraftProfile(setup, aircraftType);

    setSetup(nextSetup);
    setAddAltitude(nextSetup.defaultAltitude);

    if (aircraftType === CUSTOM_AIRCRAFT_TYPE) {
      setShowPerformancePanel(true);
    }
  }

  function handleRegistrationChange(registration: string) {
    if (isCustomAircraft) {
      updateSetup("registration", registration);
      return;
    }

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

  function suppressVerticalMarker(previousWaypointId: string | null) {
    if (!previousWaypointId) return;

    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === previousWaypointId
          ? {
              ...waypoint,
              suppressAutoVertical: true,
            }
          : waypoint
      )
    );
  }

  function restoreVerticalMarker(previousWaypointId: string) {
    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === previousWaypointId
          ? {
              ...waypoint,
              suppressAutoVertical: false,
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

  function clearWorkingRoute() {
    if (routeWaypoints.length > 0) {
      const confirmed = window.confirm(
        "Clear only the current working route from the map and table? Saved Supabase routes will not be deleted."
      );

      if (!confirmed) return;
    }

    setRouteWaypoints([]);
    setRouteWarnings([]);
    setRouteSaveStatus("");
    setBottomMode("waypoints");
  }

  async function createSavedRoute() {
    if (!routeSaveName.trim()) {
      setRouteSaveStatus("Enter a route name.");
      return;
    }

    if (routeWaypoints.length < 2) {
      setRouteSaveStatus("The route needs at least two points.");
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
      setRouteSaveStatus("Saved route created.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Could not create the saved route.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function updateSavedRoute() {
    const selected = perfectRoutes.find((route) => route.id === selectedRouteId);

    if (!selected) {
      setRouteSaveStatus("Select a saved route to update.");
      return;
    }

    if (!routeSaveName.trim()) {
      setRouteSaveStatus("Enter a route name.");
      return;
    }

    if (routeWaypoints.length < 2) {
      setRouteSaveStatus("The route needs at least two points.");
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
      setRouteSaveStatus("Saved route updated.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Could not update the saved route.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function deleteSavedRoute() {
    const selected = perfectRoutes.find((route) => route.id === selectedRouteId);

    if (!selected) {
      setRouteSaveStatus("Select a saved route to delete.");
      return;
    }

    const confirmed = window.prompt(
      `This permanently deletes the saved route "${selected.name}" from Supabase. It does not only clear the map. Type DELETE to continue.`
    );

    if (confirmed !== "DELETE") return;

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
      setRouteSaveStatus("Saved route deleted from the database.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Could not delete the saved route.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function exportNavlogPdf() {
    if (isCustomAircraft && !aircraftPerformanceValuesReady) {
      window.alert(
        "Custom aircraft performance values are incomplete. Fill TAS, fuel flow, EFOB, ROC and ROD before exporting."
      );
      return;
    }

    if (!windConfirmed) {
      const confirmed = window.confirm(
        "The route wind has not been confirmed. Continue exporting anyway?"
      );

      if (!confirmed) return;
    }

    const pdfCalculation = buildNavlogCalculation(
      setup,
      routeWaypoints,
      navlogData
    );

    const bytes = await buildNavlogFormPdf({
      setup,
      waypoints: routeWaypoints,
      calculation: pdfCalculation,
      navlogData,
    });

    downloadBinaryFile(
      bytes,
      `NAVLOG_${setup.registration}_${new Date().toISOString().slice(0, 10)}.pdf`,
      "application/pdf"
    );

    void logUsageEvent({
      eventType: "navlog_export",
      module: "navlog",
      title: `NavLog ${setup.registration || "unknown registration"}`,
      aircraftType: setup.aircraftType,
      registration: setup.registration,
      summary: {
        aircraftType: setup.aircraftType,
        registration: setup.registration,
        waypoints: routeWaypoints.length,
        legs: calculation.legs.length,
        distanceNm: summary.distNm,
        timeSec: summary.timeSec,
        finalEfobL: summary.finalEfob,
        windFrom: setup.windFrom,
        windKt: setup.windKt,
        windConfirmed,
      },
      payload: {
        setup: {
          aircraftType: setup.aircraftType,
          registration: setup.registration,
          climbTas: setup.climbTas,
          cruiseTas: setup.cruiseTas,
          descentTas: setup.descentTas,
          fuelFlowLh: setup.fuelFlowLh,
          taxiFuelL: setup.taxiFuelL,
          taxiFuelFlowLh: setup.taxiFuelFlowLh,
          taxiMin: setup.taxiMin,
          startEfob: setup.startEfob,
          rocFpm: setup.rocFpm,
          rodFpm: setup.rodFpm,
          defaultAltitude: setup.defaultAltitude,
          windFrom: setup.windFrom,
          windKt: setup.windKt,
          magVar: setup.magVar,
          magDirection: setup.magDirection,
        },
        route: routeWaypoints.map((waypoint) => ({
          code: waypoint.point.code,
          name: waypoint.point.name,
          src: waypoint.point.src,
          lat: waypoint.point.lat,
          lon: waypoint.point.lon,
          altitudeFt: waypoint.altitudeFt,
          stopMin: waypoint.stopMin,
          useGlobalWind: waypoint.useGlobalWind,
          windFrom: waypoint.windFrom,
          windKt: waypoint.windKt,
          vorPref: waypoint.vorPref,
          vorIdent: waypoint.vorIdent,
          note: waypoint.note,
          suppressAutoVertical: waypoint.suppressAutoVertical ?? false,
        })),
        legs: calculation.legs.map((leg) => ({
          from: leg.from.code || leg.from.name,
          to: leg.to.code || leg.to.name,
          profile: leg.profile,
          distNm: leg.distNm,
          eteSec: leg.eteSec,
          burnL: leg.burnL,
          efobEndL: leg.efobEndL,
          clockStart: leg.clockStart,
          clockArrive: leg.clockArrive,
          clockEnd: leg.clockEnd,
          tracking: leg.tracking,
        })),
      },
    });
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
            Preparing the NavLog...
          </p>
        </section>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-500">Loading interface...</p>
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
              Map-centred planning: set aircraft and wind, build the working route, review the calculated NavLog, then export.
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

      <WorkflowChecklist steps={navlogWorkflow} />

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Step 01
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Flight setup and weather
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Set the aircraft, registration, times, fuel and route wind before building the route.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 md:col-span-4 xl:col-span-8">
            <strong>Confirm the aircraft first.</strong>{" "}
            {isCustomAircraft
              ? "Custom aircraft mode starts with blank performance values. Enter the registration and all performance assumptions before using the NavLog."
              : "Tecnam/Piper profiles load generic starting values, including 20 min ground/taxi time and default climb/descent rates. Review TAS, ROC/ROD, fuel flow, EFOB and ground/taxi time for the actual aircraft, mission and conditions."}
          </div>


          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Aircraft
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
              Registration
            </span>
            {isCustomAircraft ? (
              <input
                value={setup.registration}
                onChange={(event) =>
                  handleRegistrationChange(event.target.value.toUpperCase())
                }
                placeholder="Enter registration"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
              />
            ) : (
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
            )}
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
                title="Calculate estimated on-blocks from the NavLog"
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
            onChange={(value) => updateWind("windFrom", value)}
          />

          <NumberInput
            label="Wind kt"
            value={setup.windKt}
            min={0}
            max={100}
            onChange={(value) => updateWind("windKt", value)}
          />

          <NumberInput
            label="Alt add"
            title="Altitude assigned to newly added route points from search, route text or map clicks. It does not change existing waypoints."
            value={addAltitude}
            min={0}
            max={20000}
            step={100}
            onChange={setAddAltitude}
          />

          <label
            className={[
              "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm xl:col-span-2",
              windConfirmed
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={windConfirmed}
              onChange={(event) => setWindConfirmed(event.target.checked)}
            />
            <span>
              <span className="block font-semibold">Wind checked</span>
              <span className="block text-xs">
                Confirm the wind before reviewing headings, groundspeed and EFOB.
              </span>
            </span>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setShowPerformancePanel((current) => !current)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              {showPerformancePanel ? "Hide performance" : "Performance"}
            </button>
          </div>
        </div>

        {showPerformancePanel ? (
          <div className="mt-5 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-zinc-950">
                Performance assumptions
              </h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Values used for leg calculations, TOC/TOD, fuel and EFOB.
              </p>
              <p className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-900">
                Ground/taxi time is included in block time and taxi fuel. The Tecnam/Piper default is 20 minutes, but this is only a starting point. Set it to 0 if you only want airborne NavLog time, or adjust it to your own operation.
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
                label="Ground/taxi time"
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

      <section className="space-y-4">
        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Map workspace
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                Build and check the route around the map
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <SidebarTabButton
                active={sidebarMode === "routes"}
                label="Route workflow"
                onClick={() => setSidebarMode("routes")}
              />
              <SidebarTabButton
                active={sidebarMode === "layers"}
                label="Layers"
                onClick={() => setSidebarMode("layers")}
              />
            </div>
          </div>
        </section>

        {sidebarMode === "layers" ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <span>
                  <span className="block font-medium text-zinc-700">
                    Manual map click
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Clicking the map creates a custom waypoint.
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
                <span>
                  <span className="block font-medium text-zinc-700">
                    Reference points
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Show/hide all reference point layers.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={setup.showReferencePoints}
                  onChange={(event) =>
                    updateSetup("showReferencePoints", event.target.checked)
                  }
                />
              </label>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Reference layers
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {navlogReferenceLayers.map((layer) => (
                    <label
                      key={layer}
                      className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
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
            </div>
          </section>
        ) : null}

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

        {sidebarMode === "routes" ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Route workflow
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Build the route, manage saved routes, then check the current route
                </h2>
              </div>

              <p className="text-sm text-zinc-500">
                The working route is the route currently shown on the map and used by the NavLog table.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                  Build route
                </p>
                <h3 className="mt-1 text-sm font-semibold text-violet-950">
                  Create the working route
                </h3>
                <p className="mt-1 text-sm leading-6 text-violet-800">
                  Paste a route string or search points and add them to the current map/table route.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/70 p-1">
                  {[
                    { key: "text" as const, label: "Text" },
                    { key: "search" as const, label: "Search points" },
                  ].map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => setRouteBuildMode(mode.key)}
                      className={[
                        "rounded-xl px-2 py-2 text-xs font-semibold transition",
                        routeBuildMode === mode.key
                          ? "bg-violet-700 text-white shadow-sm"
                          : "text-violet-700 hover:bg-white",
                      ].join(" ")}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {routeBuildMode === "text" ? (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={routeText}
                      onChange={(event) => setRouteText(event.target.value)}
                      placeholder="LPSO NSA MAGUM PORCA..."
                      className="h-36 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400"
                    />

                    <div className="grid gap-2">
                      <button
                        type="button"
                        onClick={replaceRouteFromText}
                        disabled={!navlogData}
                        className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:bg-violet-200"
                      >
                        Replace current map/table route
                      </button>

                      <button
                        type="button"
                        onClick={appendRouteFromText}
                        disabled={!navlogData}
                        className="rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-40"
                      >
                        Append to current route
                      </button>
                    </div>

                    {routeWarnings.length > 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        {routeWarnings.map((warning) => (
                          <p key={warning} className="text-sm text-amber-800">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {routeBuildMode === "search" ? (
                  <div className="mt-4 space-y-3">
                    <input
                      value={pointSearch}
                      onChange={(event) => setPointSearch(event.target.value)}
                      placeholder="Search point: LPSO, ESP, MAGUM..."
                      className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400"
                    />

                    <div className="max-h-80 space-y-2 overflow-auto pr-1">
                      {dataError ? (
                        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                          {dataError}
                        </p>
                      ) : pointSearch.trim() === "" ? (
                        <p className="rounded-xl border border-dashed border-violet-200 bg-white p-3 text-sm text-violet-700">
                          Type a point code, name, type or route to search.
                        </p>
                      ) : pointResults.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-violet-200 bg-white p-3 text-sm text-violet-700">
                          No results for the current search.
                        </p>
                      ) : (
                        pointResults.map((point) => (
                          <article
                            key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
                            className="rounded-2xl border border-violet-200 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-semibold text-zinc-950">
                                  {point.code || "CUSTOM"}
                                </h4>
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
                                className="rounded-lg bg-violet-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-800"
                              >
                                Add
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </div>

                    <p className="rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-violet-800">
                      Added points use the current Alt add value. Existing waypoint altitudes are not changed.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Saved routes
                </p>
                <h3 className="mt-1 text-sm font-semibold text-zinc-950">
                  Load or manage Supabase routes
                </h3>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  Saved routes are stored separately from the current working route.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1">
                  {[
                    { key: "load" as const, label: "Load" },
                    { key: "manage" as const, label: "Manage" },
                  ].map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => setSavedRoutesMode(mode.key)}
                      className={[
                        "rounded-xl px-2 py-2 text-xs font-semibold transition",
                        savedRoutesMode === mode.key
                          ? "bg-zinc-950 text-white shadow-sm"
                          : "text-zinc-500 hover:bg-zinc-100",
                      ].join(" ")}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {savedRoutesMode === "load" ? (
                  <div className="mt-4 space-y-3">
                    <input
                      value={routeSearch}
                      onChange={(event) => setRouteSearch(event.target.value)}
                      placeholder="Search saved routes..."
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                    />

                    <div className="max-h-80 space-y-2 overflow-auto pr-1">
                      {filteredPerfectRoutes.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-zinc-200 bg-white p-3 text-sm text-zinc-500">
                          No saved routes match this search.
                        </p>
                      ) : (
                        filteredPerfectRoutes.map((route) => (
                          <article
                            key={route.id}
                            className={[
                              "rounded-2xl border bg-white p-3 transition",
                              selectedRouteId === route.id
                                ? "border-zinc-950"
                                : "border-zinc-200 hover:border-zinc-300",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-semibold text-zinc-950">
                                  {route.name || "Untitled route"}
                                </h4>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {route.waypoints.length} waypoints
                                </p>
                              </div>

                              {selectedRouteId === route.id ? (
                                <span className="rounded-full bg-zinc-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                                  Selected
                                </span>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRouteId(route.id);
                                setRouteSaveName(route.name);
                                setRouteSaveStatus("");
                                loadPerfectRoute(route);
                              }}
                              className="mt-3 w-full rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                            >
                              Load into map/table
                            </button>
                          </article>
                        ))
                      )}
                    </div>

                    <p className="rounded-xl bg-white px-3 py-2 text-xs leading-5 text-zinc-500">
                      Loading a saved route replaces the current map/table route, but it does not edit the saved route in Supabase.
                    </p>
                  </div>
                ) : null}

                {savedRoutesMode === "manage" ? (
                  <div className="mt-4 space-y-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Saved route name
                      </span>
                      <input
                        value={routeSaveName}
                        onChange={(event) => setRouteSaveName(event.target.value)}
                        placeholder="Saved route name..."
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={createSavedRoute}
                        disabled={routeSaveBusy || routeWaypoints.length < 2}
                        className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-emerald-200"
                      >
                        Save current as new
                      </button>

                      <button
                        type="button"
                        onClick={updateSavedRoute}
                        disabled={
                          routeSaveBusy ||
                          !selectedRouteId ||
                          routeWaypoints.length < 2
                        }
                        className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-40"
                      >
                        Update selected
                      </button>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Selected saved route
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-950">
                        {selectedPerfectRoute?.name || "None selected"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Select a saved route in Load before updating or deleting it.
                      </p>
                    </div>

                    {routeSaveStatus ? (
                      <p className="rounded-xl bg-white px-3 py-2 text-sm text-zinc-600">
                        {routeSaveStatus}
                      </p>
                    ) : null}

                    <details className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-red-900">
                        Danger zone: delete selected saved route
                      </summary>

                      <p className="mt-2 text-sm leading-6 text-red-800">
                        This permanently deletes the selected saved route from Supabase. It is different from clearing the map/table route.
                      </p>

                      <button
                        type="button"
                        onClick={deleteSavedRoute}
                        disabled={routeSaveBusy || !selectedRouteId}
                        className="mt-3 w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-40"
                      >
                        Delete selected saved route
                      </button>
                    </details>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">
                  Check working route
                </p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-sky-950">
                      Current map/table route
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-sky-800">
                      This is the active route used by the map, waypoint table, NavLog calculation and PDF export.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-sky-950 px-3 py-2 text-center text-white">
                    <span className="block text-base font-bold">
                      {routeWaypoints.length}
                    </span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide">
                      WP
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/70 p-2 text-xs text-sky-900">
                  <div>
                    <span className="block font-semibold">Distance</span>
                    {summary.distNm.toFixed(1)} NM
                  </div>
                  <div>
                    <span className="block font-semibold">Time</span>
                    {formatDuration(summary.timeSec)}
                  </div>
                  <div>
                    <span className="block font-semibold">EFOB</span>
                    {formatFuelDisplay(summary.finalEfob)}
                  </div>
                  <div>
                    <span className="block font-semibold">Wind</span>
                    {windConfirmed
                      ? `${String(setup.windFrom).padStart(3, "0")}/${setup.windKt} kt`
                      : "Not confirmed"}
                  </div>
                </div>

                {!windConfirmed ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                    Wind has not been confirmed yet. Check it before using headings, GS, ETE or EFOB operationally.
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={clearWorkingRoute}
                  disabled={routeWaypoints.length === 0}
                  className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Clear only the current map/table route. Saved Supabase routes are not deleted."
                >
                  Clear map/table route
                </button>

                <p className="mt-2 text-xs leading-5 text-sky-800">
                  This only clears the working route. It does not delete anything from Supabase.
                </p>

                <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-sky-900">
                  Next, review the waypoint table below the map: wind, headings, timings, EFOB, TOC/TOD and VOR selections.
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Working route plan
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Item 15: {routeItem15(routeWaypoints) || "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              TOC/TOD markers are shown below when calculated. If removed, the segment keeps altitude as a reference but uses cruise/level timing and fuel.
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              AUTO VOR selects the nearest VOR for the leg unless you choose FIXED and select a specific VOR.
            </p>
            {!windConfirmed ? (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Wind has not been confirmed yet. Check it before using headings, GS, ETE or EFOB operationally.
              </p>
            ) : null}
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
              onClick={clearWorkingRoute}
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              title="Clear only the current map/table route. Saved Supabase routes are not deleted."
            >
              Clear map/table route
            </button>

            <button
              type="button"
              onClick={exportNavlogPdf}
              disabled={calculation.legs.length === 0}
              className="rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              Export NavLog PDF
            </button>

          </div>
        </div>

        {bottomMode === "waypoints" ? (
          <div className="overflow-hidden">
            {routeWaypoints.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">
                Load a saved route, search for points, paste route text, or click the map to start.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left text-sm">
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
                    {waypointTableRows.map((row) => {
                      if (row.kind === "marker") {
                        return (
                          <tr
                            key={`marker-${row.previousWaypointId}-${row.node.code}-${row.node.lat}-${row.node.lon}`}
                            className="bg-indigo-50/70"
                          >
                            <td className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide text-indigo-500">
                              Auto
                            </td>

                            <td className="px-4 py-3 align-top">
                              <div className="space-y-1">
                                <p className="font-semibold text-indigo-800">
                                  {row.node.code}
                                </p>
                                <p className="text-xs text-indigo-700">
                                  Between {row.previousWaypointCode} → {row.nextWaypointCode}
                                </p>
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top text-indigo-800">
                              {row.node.alt.toFixed(0)} ft
                            </td>

                            <td className="px-4 py-3 align-top text-zinc-400">—</td>
                            <td className="px-4 py-3 align-top text-zinc-400">Calculated</td>
                            <td className="px-4 py-3 align-top text-zinc-400">—</td>

                            <td className="max-w-72 whitespace-pre-line px-4 py-3 align-top text-xs leading-5 text-indigo-700">
                              {row.node.calcDetail || row.node.note || "Calculated from altitude change and ROC/ROD."}
                            </td>

                            <td className="px-4 py-3 align-top">
                              <button
                                type="button"
                                onClick={() => suppressVerticalMarker(row.previousWaypointId)}
                                className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                              >
                                Remove TOC/TOD
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      if (row.kind === "removed-marker") {
                        return (
                          <tr
                            key={`removed-${row.previousWaypointId}`}
                            className="bg-zinc-50 text-zinc-400"
                          >
                            <td className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">
                              Off
                            </td>

                            <td className="px-4 py-3 align-top">
                              <div className="space-y-1">
                                <p className="font-semibold">
                                  {row.markerCode} removed
                                </p>
                                <p className="text-xs">
                                  Between {row.previousWaypointCode} → {row.nextWaypointCode}
                                </p>
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top">
                              {row.fromAlt.toFixed(0)} → {row.toAlt.toFixed(0)} ft
                            </td>

                            <td className="px-4 py-3 align-top">—</td>
                            <td className="px-4 py-3 align-top">Cruise/level</td>
                            <td className="px-4 py-3 align-top">—</td>

                            <td className="max-w-72 px-4 py-3 align-top text-xs leading-5">
                              Suppressed. The altitude remains as a NavLog reference, but time and fuel are calculated as a cruise/level segment.
                            </td>

                            <td className="px-4 py-3 align-top">
                              <button
                                type="button"
                                onClick={() => restoreVerticalMarker(row.previousWaypointId)}
                                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                              >
                                Restore auto TOC/TOD
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      const { waypoint, index } = row;

                      return (
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
                                <option value="">Select</option>
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
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <p className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-500">
                  TOC/TOD rows are calculated from altitude changes and ROC/ROD. Removing one keeps the grey row in this table so it can be restored, and the NavLog calculation treats that segment as cruise/level while keeping altitude as a reference.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {bottomMode === "navlog" ? (
          <div className="overflow-hidden">
            {calculation.legs.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">
                Create a route with at least two points.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-3">Leg</th>
                      <th className="px-3 py-3">From</th>
                      <th className="px-3 py-3">To</th>
                      <th className="px-3 py-3">Profile</th>
                      <th className="px-3 py-3">Alt</th>
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
                        <td className="px-3 py-3 text-zinc-600">
                          {leg.from.alt.toFixed(0)} → {leg.to.alt.toFixed(0)} ft
                          {leg.profile === "LEVEL" && Math.abs(leg.to.alt - leg.from.alt) > 1 ? (
                            <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              REF
                            </span>
                          ) : null}
                        </td>
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
