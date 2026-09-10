"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { logUsageEvent } from "@/lib/usage-events";
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
  getRegistrationsForAircraft,
  navlogDefaultSetup,
  navlogReferenceLayers,
  type NavlogAircraftType,
  type NavlogDataBundle,
  type NavlogPoint,
  type NavlogReferenceLayer,
  type NavlogRouteNode,
  type NavlogRouteWaypoint,
  type NavlogSetupForm,
} from "@/lib/navlog";

const NavlogMap = dynamic(
  () => import("./navlog-map").then((module) => module.NavlogMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[68vh] min-h-[540px] items-center justify-center bg-zinc-100 text-sm text-zinc-500">
        Loading map…
      </div>
    ),
  }
);

type ComposerMode = "text" | "search" | "saved";
type ReviewMode = "waypoints" | "navlog";

const emptyNavlogData: NavlogDataBundle = {
  points: [],
  vors: [],
  airways: [],
  procedures: [],
};

const LITERS_PER_US_GALLON = 3.785411784;
const FINAL_RESERVE_MIN = 45;

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

function roundToNearestFiveMinutesSec(seconds: number) {
  return Math.max(0, Math.round((seconds || 0) / 300) * 300);
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

function isLpfrProcedurePoint(point: NavlogPoint) {
  return (
    point.routes.toUpperCase().includes("LPFR") ||
    point.remarks.toUpperCase().includes("AIRAC 005-26")
  );
}

function pointSearchScore(point: NavlogPoint, query: string) {
  let score = 0;
  if (point.code === query) score += 1000;
  if (point.code.startsWith(query)) score += 300;
  if (point.name.toUpperCase().includes(query)) score += 100;
  if (point.routes.toUpperCase().includes(query)) score += 80;
  if (isLpfrProcedurePoint(point)) score += 500;
  return score;
}

function holdMaxClass(status: string) {
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-800";
  if (status === "caution") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
      {children}
    </span>
  );
}

function NumberField({
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
    <label className="block min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500"
      />
    </label>
  );
}

function ComposerTab({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-w-0 rounded-xl px-3 py-2.5 text-left transition",
        active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100",
      ].join(" ")}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className={active ? "block text-[11px] text-zinc-300" : "block text-[11px] text-zinc-400"}>
        {description}
      </span>
    </button>
  );
}

export function NavlogStudio({ aircraftType }: { aircraftType: NavlogAircraftType }) {
  const initialProfile = useMemo(
    () => applyAircraftProfile(navlogDefaultSetup, aircraftType),
    [aircraftType]
  );
  const [setup, setSetup] = useState<NavlogSetupForm>(initialProfile);
  const [navlogData, setNavlogData] = useState<NavlogDataBundle | null>(null);
  const [perfectRoutes, setPerfectRoutes] = useState<PerfectRoute[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  const [composerMode, setComposerMode] = useState<ComposerMode>("text");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("waypoints");
  const [showLayers, setShowLayers] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [manualMapClickEnabled, setManualMapClickEnabled] = useState(false);
  const [windConfirmed, setWindConfirmed] = useState(false);

  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [pointSearch, setPointSearch] = useState("");
  const [routeText, setRouteText] = useState("");
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [routeSaveName, setRouteSaveName] = useState("");
  const [routeSaveStatus, setRouteSaveStatus] = useState("");
  const [routeSaveBusy, setRouteSaveBusy] = useState(false);
  const [addAltitude, setAddAltitude] = useState(initialProfile.defaultAltitude);
  const [routeWaypoints, setRouteWaypoints] = useState<NavlogRouteWaypoint[]>([]);

  const isCustomAircraft = aircraftType === CUSTOM_AIRCRAFT_TYPE;
  const registrationOptions = getRegistrationsForAircraft(aircraftType);
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
  const summary = useMemo(() => navlogSummary(calculation.legs), [calculation.legs]);
  const calculatedOnBlockClock = calculation.legs.at(-1)?.clockEnd ?? "";

  useEffect(() => {
    const next = applyAircraftProfile(navlogDefaultSetup, aircraftType);
    setSetup((current) => ({
      ...applyAircraftProfile(current, aircraftType),
      showReferencePoints: current.showReferencePoints,
      referenceLayers: current.referenceLayers,
    }));
    setAddAltitude(next.defaultAltitude);
    setWindConfirmed(false);
    if (aircraftType === CUSTOM_AIRCRAFT_TYPE) setShowPerformance(true);
  }, [aircraftType]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [data, routes] = await Promise.all([
          loadAllNavlogData(),
          loadSupabasePerfectRoutes(),
        ]);
        if (cancelled) return;
        setNavlogData(data);
        setPerfectRoutes(routes);
        setSelectedRouteId(routes[0]?.id ?? "");
        setRouteSaveName(routes[0]?.name ?? "");
      } catch (error) {
        console.error(error);
        if (!cancelled) setDataError("Could not load NavLog data or saved routes.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateSetup<K extends keyof NavlogSetupForm>(
    key: K,
    value: NavlogSetupForm[K]
  ) {
    setSetup((current) => ({ ...current, [key]: value }));
  }

  function updateWind<K extends "windFrom" | "windKt">(
    key: K,
    value: NavlogSetupForm[K]
  ) {
    setWindConfirmed(false);
    updateSetup(key, value);
  }

  function toggleReferenceLayer(layer: NavlogReferenceLayer, checked: boolean) {
    setSetup((current) => ({
      ...current,
      referenceLayers: checked
        ? Array.from(new Set([...current.referenceLayers, layer]))
        : current.referenceLayers.filter((item) => item !== layer),
    }));
  }

  function addPoint(point: NavlogPoint) {
    setRouteWaypoints((current) => [
      ...current,
      makeWaypointFromPoint(point, setup, addAltitude, 0),
    ]);
    setReviewMode("waypoints");
  }

  function addMapPoint(lat: number, lon: number) {
    addPoint({
      code: manualPointCode(routeWaypoints.length),
      name: "Map point",
      lat,
      lon,
      alt: addAltitude,
      src: "VFR",
      routes: "",
      remarks: "Added from map",
    });
  }

  function replaceRouteFromText() {
    if (!navlogData) return;
    const result = parseRouteText(routeText, navlogData, setup, addAltitude);
    setRouteWaypoints(result.waypoints);
    setRouteWarnings(result.warnings);
    setReviewMode("waypoints");
  }

  function appendRouteFromText() {
    if (!navlogData) return;
    const result = parseRouteText(routeText, navlogData, setup, addAltitude);
    setRouteWaypoints((current) => [...current, ...result.waypoints]);
    setRouteWarnings(result.warnings);
    setReviewMode("waypoints");
  }

  function loadPerfectRoute(route: PerfectRoute) {
    setSelectedRouteId(route.id);
    setRouteSaveName(route.name);
    setRouteWaypoints(perfectRouteToWaypoints(route, setup));
    setRouteText(routeToText(route));
    setRouteWarnings([]);
    setRouteSaveStatus("");
    setReviewMode("waypoints");
  }

  function updateWaypoint(
    id: string,
    patch: Partial<Omit<NavlogRouteWaypoint, "id" | "point">>
  ) {
    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === id ? { ...waypoint, ...patch } : waypoint
      )
    );
  }

  function updateWaypointPoint(id: string, patch: Partial<NavlogPoint>) {
    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === id
          ? { ...waypoint, point: { ...waypoint.point, ...patch } }
          : waypoint
      )
    );
  }

  function toggleAlternateMarker(id: string) {
    setRouteWaypoints((current) =>
      current.map((waypoint) => ({
        ...waypoint,
        alternateMarker:
          waypoint.id === id ? !waypoint.alternateMarker : false,
      }))
    );
  }

  function suppressVerticalMarker(previousWaypointId: string | null) {
    if (!previousWaypointId) return;
    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === previousWaypointId
          ? { ...waypoint, suppressAutoVertical: true }
          : waypoint
      )
    );
  }

  function restoreVerticalMarker(previousWaypointId: string) {
    setRouteWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === previousWaypointId
          ? { ...waypoint, suppressAutoVertical: false }
          : waypoint
      )
    );
  }

  function removeWaypoint(id: string) {
    setRouteWaypoints((current) => current.filter((waypoint) => waypoint.id !== id));
  }

  function moveWaypoint(id: string, direction: "up" | "down") {
    setRouteWaypoints((current) => {
      const index = current.findIndex((waypoint) => waypoint.id === id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function clearWorkingRoute() {
    if (
      routeWaypoints.length > 0 &&
      !window.confirm("Clear the current working route? Saved routes will not be deleted.")
    ) {
      return;
    }
    setRouteWaypoints([]);
    setRouteWarnings([]);
    setRouteSaveStatus("");
    setReviewMode("waypoints");
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
      const created = await createSupabasePerfectRoute(routeSaveName, routeWaypoints);
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
    if (!routeSaveName.trim() || routeWaypoints.length < 2) {
      setRouteSaveStatus("Enter a name and create a route with at least two points.");
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
    if (!selected) return;
    const confirmed = window.prompt(
      `Permanently delete "${selected.name}" from saved routes? Type DELETE to continue.`
    );
    if (confirmed !== "DELETE") return;
    setRouteSaveBusy(true);
    try {
      await deleteSupabasePerfectRoute(selected.id);
      const remaining = perfectRoutes.filter((route) => route.id !== selected.id);
      setPerfectRoutes(remaining);
      setSelectedRouteId(remaining[0]?.id ?? "");
      setRouteSaveName(remaining[0]?.name ?? "");
      setRouteSaveStatus("Saved route deleted.");
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

    const pdfCalculation = buildNavlogCalculation(setup, routeWaypoints, navlogData);
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
        callsign: setup.callsign,
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
        setup,
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
          alternateMarker: waypoint.alternateMarker === true,
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

  const pointResults = useMemo(() => {
    if (!navlogData) return [];
    const query = pointSearch.trim().toUpperCase();
    if (!query) return [];
    return navlogData.points
      .filter(
        (point) =>
          point.code.includes(query) ||
          point.name.toUpperCase().includes(query) ||
          point.src.includes(query) ||
          point.routes.toUpperCase().includes(query) ||
          point.remarks.toUpperCase().includes(query)
      )
      .sort((a, b) => pointSearchScore(b, query) - pointSearchScore(a, query))
      .slice(0, 18);
  }, [navlogData, pointSearch]);

  const filteredPerfectRoutes = useMemo(() => {
    const query = routeSearch.trim().toUpperCase();
    if (!query) return perfectRoutes;
    return perfectRoutes.filter((route) => route.name.toUpperCase().includes(query));
  }, [perfectRoutes, routeSearch]);

  const selectedPerfectRoute = perfectRoutes.find((route) => route.id === selectedRouteId);

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

  const alternatePlanning = useMemo(() => {
    const markerIndex = routeWaypoints.findIndex((waypoint) => waypoint.alternateMarker === true);
    if (markerIndex < 0 || calculation.legs.length === 0) return null;
    const markerWaypoint = routeWaypoints[markerIndex];
    const markerLegIndex = calculation.legs.findIndex((leg) => leg.to.id === markerWaypoint.id);
    if (markerLegIndex < 0) return null;

    const destinationLeg = calculation.legs[markerLegIndex];
    const alternateLegs = calculation.legs.slice(markerLegIndex + 1);
    const alternateTripFuelL = alternateLegs.reduce(
      (sum, leg) => sum + leg.burnL + leg.holdBurnL,
      0
    );
    const alternateTripSec = roundToNearestFiveMinutesSec(
      alternateLegs.reduce((sum, leg) => sum + leg.eteSec + leg.holdSec, 0)
    );
    const finalReserveFuelL = (setup.fuelFlowLh * FINAL_RESERVE_MIN) / 60;
    const minimumFuelAtMarkerL = alternateTripFuelL + finalReserveFuelL;
    const destinationArrivalEfobL = destinationLeg.efobAfterLegL;
    const plannedHoldFuelL = destinationLeg.holdBurnL;
    const holdAvailableFuelL = destinationArrivalEfobL - alternateTripFuelL - finalReserveFuelL;
    const holdAvailableSec = roundToNearestFiveMinutesSec(
      setup.fuelFlowLh > 0
        ? Math.max(0, (holdAvailableFuelL / setup.fuelFlowLh) * 3600)
        : 0
    );
    const fuelAfterPlannedHoldL = holdAvailableFuelL - plannedHoldFuelL;
    const status =
      holdAvailableFuelL < 0
        ? "blocked"
        : fuelAfterPlannedHoldL < 0
          ? "caution"
          : "ok";

    return {
      markerWaypointId: markerWaypoint.id,
      markerCode: markerWaypoint.point.code || markerWaypoint.point.name || "Arrival",
      destinationArrivalEfobL,
      alternateTripFuelL,
      alternateTripSec,
      finalReserveFuelL,
      minimumFuelAtMarkerL,
      holdAvailableFuelL,
      holdAvailableSec,
      plannedHoldFuelL,
      fuelAfterPlannedHoldL,
      status,
    };
  }, [calculation.legs, routeWaypoints, setup.fuelFlowLh]);

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
      if ((node.code !== "TOC" && node.code !== "TOD") || !previousWaypoint) return;
      const nextUserNode = calculation.nodes
        .slice(nodeIndex + 1)
        .find((candidate) => waypointById.has(candidate.id));
      const previousWaypointCode =
        previousWaypoint.point.code || previousWaypoint.point.name || "WP";
      const previousMarkers = activeMarkersByPreviousWaypoint.get(previousWaypoint.id) ?? [];
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
        | { kind: "waypoint"; waypoint: NavlogRouteWaypoint; index: number }
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
      > = [{ kind: "waypoint", waypoint, index }];
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
          nextWaypointCode: nextWaypoint.point.code || nextWaypoint.point.name || "WP",
          fromAlt: waypoint.altitudeFt,
          toAlt: nextWaypoint.altitudeFt,
        });
      }
      return rows;
    });
  }, [calculation.nodes, routeWaypoints]);

  return (
    <div className="navlog-studio space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="grid gap-px overflow-hidden rounded-2xl bg-zinc-200 sm:grid-cols-2 lg:grid-cols-6">
          <div className="bg-white p-3 lg:col-span-1">
            <FieldLabel>Registration</FieldLabel>
            {isCustomAircraft ? (
              <input
                value={setup.registration}
                onChange={(event) => updateSetup("registration", event.target.value.toUpperCase())}
                placeholder="Registration"
                className="h-10 w-full border-0 bg-transparent p-0 text-base font-semibold outline-none"
              />
            ) : (
              <select
                value={setup.registration}
                onChange={(event) => updateSetup("registration", event.target.value)}
                className="h-10 w-full border-0 bg-transparent p-0 text-base font-semibold outline-none"
              >
                {registrationOptions.map((registration) => (
                  <option key={registration}>{registration}</option>
                ))}
              </select>
            )}
          </div>

          <label className="bg-white p-3">
            <FieldLabel>Callsign</FieldLabel>
            <input
              value={setup.callsign}
              onChange={(event) => updateSetup("callsign", event.target.value.toUpperCase())}
              className="h-10 w-full border-0 bg-transparent p-0 text-base font-semibold outline-none"
            />
          </label>

          <label className="bg-white p-3">
            <FieldLabel>Off-block</FieldLabel>
            <input
              type="time"
              value={setup.startClock}
              onChange={(event) => updateSetup("startClock", event.target.value)}
              className="h-10 w-full border-0 bg-transparent p-0 text-base font-semibold outline-none"
            />
          </label>

          <div className="bg-white p-3">
            <FieldLabel>Start EFOB</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={300}
                value={setup.startEfob}
                onChange={(event) => updateSetup("startEfob", Number(event.target.value))}
                className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-semibold outline-none"
              />
              <span className="text-xs text-zinc-400">L</span>
            </div>
          </div>

          <div className="bg-white p-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Route wind</FieldLabel>
              <button
                type="button"
                onClick={() => setWindConfirmed((value) => !value)}
                className={[
                  "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition",
                  windConfirmed
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800",
                ].join(" ")}
              >
                {windConfirmed ? "Confirmed" : "Confirm wind"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={360}
                step={10}
                value={setup.windFrom}
                onChange={(event) => updateWind("windFrom", Number(event.target.value))}
                className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-semibold outline-none"
              />
              <span className="text-zinc-300">/</span>
              <input
                type="number"
                min={0}
                max={100}
                value={setup.windKt}
                onChange={(event) => updateWind("windKt", Number(event.target.value))}
                className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-semibold outline-none"
              />
              <span className="text-xs text-zinc-400">kt</span>
            </div>
          </div>
        </div>

        <details className="group border-t border-zinc-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
            <span>More mission details & aircraft assumptions</span>
            <span className="text-zinc-400 transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-zinc-100 bg-zinc-50/70 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <label>
                <FieldLabel>On-block</FieldLabel>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={setup.onBlockClock}
                    onChange={(event) => updateSetup("onBlockClock", event.target.value)}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={!setup.startClock || !calculatedOnBlockClock}
                    onClick={() => updateSetup("onBlockClock", calculatedOnBlockClock)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold disabled:opacity-40"
                  >
                    Auto
                  </button>
                </div>
              </label>
              <label>
                <FieldLabel>Lesson</FieldLabel>
                <input
                  value={setup.lesson}
                  onChange={(event) => updateSetup("lesson", event.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                />
              </label>
              <label>
                <FieldLabel>Instructor</FieldLabel>
                <input
                  value={setup.instructor}
                  onChange={(event) => updateSetup("instructor", event.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                />
              </label>
              <label>
                <FieldLabel>Student</FieldLabel>
                <input
                  value={setup.student}
                  onChange={(event) => updateSetup("student", event.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                />
              </label>
              <NumberField
                label="New point altitude"
                value={addAltitude}
                min={0}
                max={20000}
                step={100}
                onChange={setAddAltitude}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Aircraft assumptions</p>
                <p className="text-xs text-zinc-500">
                  TAS, fuel flow, climb/descent and taxi values used by the calculation engine.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPerformance((value) => !value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700"
              >
                {showPerformance ? "Hide assumptions" : "Edit assumptions"}
              </button>
            </div>

            {showPerformance ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <NumberField label="Climb TAS" value={setup.climbTas} min={30} max={250} onChange={(value) => updateSetup("climbTas", value)} />
                <NumberField label="Cruise TAS" value={setup.cruiseTas} min={30} max={300} onChange={(value) => updateSetup("cruiseTas", value)} />
                <NumberField label="Descent TAS" value={setup.descentTas} min={30} max={250} onChange={(value) => updateSetup("descentTas", value)} />
                <NumberField label="Fuel L/h" value={setup.fuelFlowLh} min={0} max={120} onChange={(value) => updateSetup("fuelFlowLh", value)} />
                <NumberField label="Taxi min" value={setup.taxiMin} min={0} max={120} step={5} onChange={(value) => updateSetup("taxiMin", value)} />
                <NumberField label="Taxi FF" value={setup.taxiFuelFlowLh} min={0} max={40} step={0.5} onChange={(value) => updateSetup("taxiFuelFlowLh", value)} />
                <NumberField label="ROC" value={setup.rocFpm} min={100} max={2000} step={50} onChange={(value) => updateSetup("rocFpm", value)} />
                <NumberField label="ROD" value={setup.rodFpm} min={100} max={2000} step={50} onChange={(value) => updateSetup("rodFpm", value)} />
                <NumberField label="Default alt" value={setup.defaultAltitude} min={0} max={20000} step={100} onChange={(value) => updateSetup("defaultAltitude", value)} />
                <NumberField label="Mag var" value={setup.magVar} min={0} max={30} step={0.1} onChange={(value) => updateSetup("magVar", value)} />
                <label>
                  <FieldLabel>Mag dir</FieldLabel>
                  <select
                    value={setup.magDirection}
                    onChange={(event) => updateSetup("magDirection", event.target.value as "E" | "W")}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                  >
                    <option value="W">W</option>
                    <option value="E">E</option>
                  </select>
                </label>
                <div>
                  <FieldLabel>Taxi fuel</FieldLabel>
                  <div className="flex h-11 items-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold">
                    {((setup.taxiFuelFlowLh * setup.taxiMin) / 60).toFixed(1)} L
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </details>
      </section>

      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Route studio</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">Compose the route, then work directly on the map</h2>
            </div>
            <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl bg-zinc-200 text-center text-xs">
              <div className="bg-zinc-50 px-3 py-2"><span className="block text-zinc-400">WP</span><strong>{routeWaypoints.length}</strong></div>
              <div className="bg-zinc-50 px-3 py-2"><span className="block text-zinc-400">NM</span><strong>{summary.distNm.toFixed(1)}</strong></div>
              <div className="bg-zinc-50 px-3 py-2"><span className="block text-zinc-400">ETE</span><strong>{formatDuration(summary.timeSec)}</strong></div>
              <div className="bg-zinc-50 px-3 py-2"><span className="block text-zinc-400">EFOB</span><strong>{formatFuelDisplay(summary.finalEfob)}</strong></div>
            </div>
          </div>

          <div className="mt-4 grid gap-1 rounded-2xl bg-zinc-50 p-1 md:grid-cols-3">
            <ComposerTab active={composerMode === "text"} label="Route text" description="Paste or type Item 15 style routing" onClick={() => setComposerMode("text")} />
            <ComposerTab active={composerMode === "search"} label="Find point" description="Search AD, VFR, VOR and IFR points" onClick={() => setComposerMode("search")} />
            <ComposerTab active={composerMode === "saved"} label="Saved routes" description="Load, save or update Supabase routes" onClick={() => setComposerMode("saved")} />
          </div>

          {composerMode === "text" ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
              <textarea
                value={routeText}
                onChange={(event) => setRouteText(event.target.value)}
                placeholder="LPSO NSA MAGUM PORCA…"
                className="min-h-24 w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-zinc-500"
              />
              <div className="grid grid-cols-2 gap-2 lg:w-44 lg:grid-cols-1">
                <button type="button" onClick={replaceRouteFromText} disabled={!navlogData} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300">Use route</button>
                <button type="button" onClick={appendRouteFromText} disabled={!navlogData} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 disabled:opacity-40">Append</button>
              </div>
              {routeWarnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 lg:col-span-2">
                  {routeWarnings.map((warning) => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
                </div>
              ) : null}
            </div>
          ) : null}

          {composerMode === "search" ? (
            <div className="mt-4">
              <input
                value={pointSearch}
                onChange={(event) => setPointSearch(event.target.value)}
                placeholder="Search LPSO, MAGUM, ESP, VOR, IFR…"
                className="h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-500"
              />
              <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                {dataError ? <p className="text-sm text-red-700">{dataError}</p> : null}
                {!dataError && pointSearch.trim() && pointResults.length === 0 ? <p className="text-sm text-zinc-500">No matching points.</p> : null}
                {pointResults.map((point) => (
                  <button
                    key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
                    type="button"
                    onClick={() => addPoint(point)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-zinc-400"
                  >
                    <span className="min-w-0"><strong className="block text-sm">{point.code || "CUSTOM"}</strong><span className="block truncate text-xs text-zinc-500">{point.name} · {point.src}</span></span>
                    <span className="text-lg text-zinc-400">＋</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {composerMode === "saved" ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <input
                    value={routeSearch}
                    onChange={(event) => setRouteSearch(event.target.value)}
                    placeholder="Search saved routes…"
                    className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-500"
                  />
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-zinc-200">
                    {filteredPerfectRoutes.length === 0 ? (
                      <p className="p-4 text-sm text-zinc-500">No saved routes match.</p>
                    ) : (
                      filteredPerfectRoutes.map((route) => (
                        <button
                          key={route.id}
                          type="button"
                          onClick={() => loadPerfectRoute(route)}
                          className={[
                            "flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2.5 text-left last:border-0 hover:bg-zinc-50",
                            selectedRouteId === route.id ? "bg-zinc-50" : "bg-white",
                          ].join(" ")}
                        >
                          <span><strong className="block text-sm">{route.name || "Untitled route"}</strong><span className="text-xs text-zinc-400">{route.waypoints.length} waypoints</span></span>
                          <span className="text-xs font-semibold text-zinc-500">Use →</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <FieldLabel>Save current route</FieldLabel>
                  <input
                    value={routeSaveName}
                    onChange={(event) => setRouteSaveName(event.target.value)}
                    placeholder="Route name"
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={createSavedRoute} disabled={routeSaveBusy || routeWaypoints.length < 2} className="rounded-lg bg-zinc-950 px-2 py-2 text-xs font-semibold text-white disabled:bg-zinc-300">Save new</button>
                    <button type="button" onClick={updateSavedRoute} disabled={routeSaveBusy || !selectedRouteId || routeWaypoints.length < 2} className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs font-semibold disabled:opacity-40">Update</button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">Selected: {selectedPerfectRoute?.name || "none"}</p>
                  {routeSaveStatus ? <p className="mt-2 text-xs font-medium text-zinc-700">{routeSaveStatus}</p> : null}
                  <button type="button" onClick={deleteSavedRoute} disabled={routeSaveBusy || !selectedRouteId} className="mt-3 text-xs font-medium text-red-600 disabled:opacity-30">Delete selected saved route</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualMapClickEnabled((value) => !value)}
              className={[
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                manualMapClickEnabled
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500",
              ].join(" ")}
            >
              {manualMapClickEnabled ? "✓ Click map to add point" : "＋ Add point on map"}
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">New point</span>
              <input
                type="number"
                value={addAltitude}
                step={100}
                onChange={(event) => setAddAltitude(Number(event.target.value))}
                className="w-20 border-0 bg-transparent text-sm font-semibold outline-none"
              />
              <span className="text-xs text-zinc-400">ft</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateSetup("showReferencePoints", !setup.showReferencePoints)}
              className={[
                "rounded-xl border px-3 py-2 text-sm font-medium",
                setup.showReferencePoints
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-300 bg-white text-zinc-700",
              ].join(" ")}
            >
              Reference points {setup.showReferencePoints ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => setShowLayers((value) => !value)}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700"
            >
              Layers {showLayers ? "▴" : "▾"}
            </button>
          </div>
        </div>

        {showLayers ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Reference layers</span>
            {navlogReferenceLayers.map((layer) => (
              <label key={layer} className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700">
                <input type="checkbox" checked={setup.referenceLayers.includes(layer)} onChange={(event) => toggleReferenceLayer(layer, event.target.checked)} />
                {layer}
              </label>
            ))}
          </div>
        ) : null}

        {manualMapClickEnabled ? (
          <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-xs font-medium text-emerald-800">
            Manual point mode is active — click anywhere on the map to add a waypoint at {addAltitude} ft.
          </div>
        ) : null}

        <div className="min-w-0">
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
        </div>

        <div className="border-t border-zinc-200 bg-white px-4 py-3">
          {routeWaypoints.length === 0 ? (
            <p className="text-sm text-zinc-500">No working route yet. Use route text, find a point, load a saved route or add points directly on the map.</p>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {routeWaypoints.map((waypoint, index) => (
                <div key={waypoint.id} className="flex shrink-0 items-center gap-2">
                  {index > 0 ? <span className="text-zinc-300">→</span> : null}
                  <div className={[
                    "rounded-xl border px-3 py-2",
                    waypoint.alternateMarker ? "border-sky-300 bg-sky-50" : "border-zinc-200 bg-zinc-50",
                  ].join(" ")}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{index + 1}</span>
                    <strong className="block text-sm text-zinc-900">{waypoint.point.code || waypoint.point.name || "WP"}</strong>
                    <span className="block text-[11px] text-zinc-500">{waypoint.altitudeFt} ft</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Review</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">Working route & calculated NavLog</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">Item 15: {routeItem15(routeWaypoints) || "—"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl bg-zinc-100 p-1">
              <button type="button" onClick={() => setReviewMode("waypoints")} className={reviewMode === "waypoints" ? "rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-sm" : "px-3 py-2 text-sm font-medium text-zinc-500"}>Waypoints</button>
              <button type="button" onClick={() => setReviewMode("navlog")} className={reviewMode === "navlog" ? "rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-sm" : "px-3 py-2 text-sm font-medium text-zinc-500"}>NavLog</button>
            </div>
            <button type="button" onClick={clearWorkingRoute} disabled={routeWaypoints.length === 0} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-30">Clear route</button>
            <button type="button" onClick={exportNavlogPdf} disabled={calculation.legs.length === 0} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300">Export NavLog PDF</button>
          </div>
        </div>

        {!windConfirmed && calculation.legs.length > 0 ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Wind is not confirmed. Heading, groundspeed, ETE and EFOB values should be reviewed after confirming the route wind.
          </div>
        ) : null}

        {alternatePlanning ? (
          <div className={["m-4 rounded-2xl border p-4 text-sm", holdMaxClass(alternatePlanning.status)].join(" ")}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">Alternate holding check · {alternatePlanning.markerCode}</p>
                <p className="mt-1">Hold available: <strong>{formatDuration(alternatePlanning.holdAvailableSec)}</strong> before alternate + 45 min final reserve.</p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs sm:grid-cols-4">
                <span>Dest EFOB <strong>{formatFuelDisplay(alternatePlanning.destinationArrivalEfobL)}</strong></span>
                <span>Alternate <strong>{formatFuelDisplay(alternatePlanning.alternateTripFuelL)}</strong></span>
                <span>Reserve <strong>{formatFuelDisplay(alternatePlanning.finalReserveFuelL)}</strong></span>
                <span>Min FOB <strong>{formatFuelDisplay(alternatePlanning.minimumFuelAtMarkerL)}</strong></span>
              </div>
            </div>
          </div>
        ) : null}

        {reviewMode === "waypoints" ? (
          <div className="overflow-x-auto">
            {routeWaypoints.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">Build or load a route to edit its waypoints.</div>
            ) : (
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                  <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Point</th><th className="px-4 py-3">Alt</th><th className="px-4 py-3">Stop</th><th className="px-4 py-3">Wind</th><th className="px-4 py-3">VOR</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {waypointTableRows.map((row) => {
                    if (row.kind === "marker") {
                      return (
                        <tr key={`marker-${row.previousWaypointId}-${row.node.code}-${row.node.lat}-${row.node.lon}`} className="bg-indigo-50/70">
                          <td className="px-4 py-3 text-xs font-semibold uppercase text-indigo-500">Auto</td>
                          <td className="px-4 py-3"><strong className="text-indigo-800">{row.node.code}</strong><span className="mt-1 block text-xs text-indigo-600">{row.previousWaypointCode} → {row.nextWaypointCode}</span></td>
                          <td className="px-4 py-3 text-indigo-800">{row.node.alt.toFixed(0)} ft</td>
                          <td className="px-4 py-3 text-zinc-400">—</td><td className="px-4 py-3 text-zinc-400">Calculated</td><td className="px-4 py-3 text-zinc-400">—</td>
                          <td className="max-w-72 px-4 py-3 text-xs text-indigo-700">{row.node.calcDetail || row.node.note || "Calculated from altitude change and ROC/ROD."}</td>
                          <td className="px-4 py-3"><button type="button" onClick={() => suppressVerticalMarker(row.previousWaypointId)} className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700">Remove TOC/TOD</button></td>
                        </tr>
                      );
                    }

                    if (row.kind === "removed-marker") {
                      return (
                        <tr key={`removed-${row.previousWaypointId}`} className="bg-zinc-50 text-zinc-400">
                          <td className="px-4 py-3 text-xs font-semibold uppercase">Off</td>
                          <td className="px-4 py-3"><strong>{row.markerCode} removed</strong><span className="mt-1 block text-xs">{row.previousWaypointCode} → {row.nextWaypointCode}</span></td>
                          <td className="px-4 py-3">{row.fromAlt.toFixed(0)} → {row.toAlt.toFixed(0)} ft</td>
                          <td className="px-4 py-3">—</td><td className="px-4 py-3">Cruise/level</td><td className="px-4 py-3">—</td>
                          <td className="max-w-72 px-4 py-3 text-xs">Altitude stays as a reference; time and fuel use cruise/level calculation.</td>
                          <td className="px-4 py-3"><button type="button" onClick={() => restoreVerticalMarker(row.previousWaypointId)} className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700">Restore TOC/TOD</button></td>
                        </tr>
                      );
                    }

                    const { waypoint, index } = row;
                    return (
                      <tr key={waypoint.id} className={waypoint.alternateMarker ? "bg-sky-50" : undefined}>
                        <td className="px-4 py-3 align-top text-zinc-400">{index + 1}</td>
                        <td className="px-4 py-3 align-top">
                          <input value={waypoint.point.code} onChange={(event) => updateWaypointPoint(waypoint.id, { code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 font-semibold" />
                          <input value={waypoint.point.name} onChange={(event) => updateWaypointPoint(waypoint.id, { name: event.target.value })} className="mt-2 block w-44 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600" />
                          {waypoint.alternateMarker ? <span className="mt-2 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">ALTERNATE START</span> : null}
                        </td>
                        <td className="px-4 py-3 align-top"><input type="number" value={waypoint.altitudeFt} step={100} onChange={(event) => updateWaypoint(waypoint.id, { altitudeFt: Number(event.target.value) })} className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5" /></td>
                        <td className="px-4 py-3 align-top">
                          <input type="number" value={waypoint.stopMin} min={0} onChange={(event) => updateWaypoint(waypoint.id, { stopMin: Number(event.target.value) })} className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5" />
                          {waypoint.alternateMarker && alternatePlanning ? <div className={["mt-2 rounded-lg border px-2 py-1 text-[10px] font-semibold", holdMaxClass(alternatePlanning.status)].join(" ")}>HOLD MAX {formatDuration(alternatePlanning.holdAvailableSec)}</div> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <label className="mb-2 flex items-center gap-2 text-xs text-zinc-500"><input type="checkbox" checked={waypoint.useGlobalWind} onChange={(event) => updateWaypoint(waypoint.id, { useGlobalWind: event.target.checked })} />Global</label>
                          {waypoint.useGlobalWind ? <span>{String(setup.windFrom).padStart(3, "0")}/{setup.windKt}</span> : <div className="flex gap-2"><input type="number" value={waypoint.windFrom} onChange={(event) => updateWaypoint(waypoint.id, { windFrom: Number(event.target.value) })} className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5" /><input type="number" value={waypoint.windKt} onChange={(event) => updateWaypoint(waypoint.id, { windKt: Number(event.target.value) })} className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5" /></div>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select value={waypoint.vorPref} onChange={(event) => updateWaypoint(waypoint.id, { vorPref: event.target.value as "AUTO" | "FIXED" })} className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"><option value="AUTO">AUTO</option><option value="FIXED">FIXED</option></select>
                          {waypoint.vorPref === "FIXED" ? <select value={waypoint.vorIdent} onChange={(event) => updateWaypoint(waypoint.id, { vorIdent: event.target.value })} className="mt-2 block w-28 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"><option value="">Select</option>{vorOptions.map((vor) => <option key={vor}>{vor}</option>)}</select> : null}
                        </td>
                        <td className="px-4 py-3 align-top"><input value={waypoint.note} onChange={(event) => updateWaypoint(waypoint.id, { note: event.target.value })} placeholder="NavLog note" className="w-44 rounded-lg border border-zinc-200 px-2 py-1.5" /></td>
                        <td className="px-4 py-3 align-top"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => moveWaypoint(waypoint.id, "up")} disabled={index === 0} className="rounded-lg border border-zinc-200 px-2 py-1 disabled:opacity-30">↑</button><button type="button" onClick={() => moveWaypoint(waypoint.id, "down")} disabled={index === routeWaypoints.length - 1} className="rounded-lg border border-zinc-200 px-2 py-1 disabled:opacity-30">↓</button><button type="button" onClick={() => toggleAlternateMarker(waypoint.id)} className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-medium text-sky-700">{waypoint.alternateMarker ? "Unset alt" : "Start alt"}</button><button type="button" onClick={() => removeWaypoint(waypoint.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600">Remove</button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {reviewMode === "navlog" ? (
          <div className="overflow-x-auto">
            {calculation.legs.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">Create a route with at least two points.</div>
            ) : (
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                  <tr><th className="px-3 py-3">Leg</th><th className="px-3 py-3">From</th><th className="px-3 py-3">To</th><th className="px-3 py-3">Profile</th><th className="px-3 py-3">Alt</th><th className="px-3 py-3">TC</th><th className="px-3 py-3">TH</th><th className="px-3 py-3">MH</th><th className="px-3 py-3">TAS</th><th className="px-3 py-3">GS</th><th className="px-3 py-3">Dist</th><th className="px-3 py-3">ETE</th><th className="px-3 py-3">Fuel</th><th className="px-3 py-3">EFOB</th><th className="px-3 py-3">Clock</th><th className="px-3 py-3">Tracking</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {calculation.legs.map((leg) => (
                    <tr key={leg.i}>
                      <td className="px-3 py-3">{leg.i}</td><td className="px-3 py-3 font-medium">{leg.from.code}</td><td className="px-3 py-3 font-medium">{leg.to.code}</td><td className="px-3 py-3">{leg.profile}</td>
                      <td className="px-3 py-3 text-zinc-600">{leg.from.alt.toFixed(0)} → {leg.to.alt.toFixed(0)} ft{leg.profile === "LEVEL" && Math.abs(leg.to.alt - leg.from.alt) > 1 ? <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">REF</span> : null}</td>
                      <td className="px-3 py-3">{leg.tc.toFixed(0)}</td><td className="px-3 py-3">{leg.th.toFixed(0)}</td><td className="px-3 py-3">{leg.mh.toFixed(0)}</td><td className="px-3 py-3">{leg.tas.toFixed(0)}</td><td className="px-3 py-3">{leg.gs.toFixed(0)}</td><td className="px-3 py-3">{leg.distNm.toFixed(1)}</td>
                      <td className="px-3 py-3"><strong>{formatDuration(leg.eteSec)}</strong>{leg.holdSec > 0 ? <span className="mt-1 block text-xs text-red-600">+{formatDuration(leg.holdSec)} hold</span> : null}{alternatePlanning?.markerWaypointId === leg.to.id ? <span className="mt-1 block text-xs font-semibold text-emerald-700">HM {formatDuration(alternatePlanning.holdAvailableSec)}</span> : null}</td>
                      <td className="px-3 py-3">{formatFuelDisplay(leg.burnL)}</td><td className="px-3 py-3">{formatFuelDisplay(leg.efobEndL)}{alternatePlanning?.markerWaypointId === leg.to.id ? <span className="mt-1 block text-xs font-semibold text-emerald-700">MIN {formatFuelDisplay(alternatePlanning.minimumFuelAtMarkerL)}</span> : null}</td>
                      <td className="px-3 py-3">{leg.clockStart} → {leg.clockArrive}</td><td className="max-w-56 whitespace-pre-line px-3 py-3 text-zinc-600">{leg.tracking || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
