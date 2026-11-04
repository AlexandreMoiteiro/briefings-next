"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { logUsageEvent } from "@/lib/usage-events";
import { C152_NAVLOG_PRESET } from "@/lib/c152-operational-presets";
import { C152_CS_AYR } from "@/lib/performance/c152-performance";
import { loadAllNavlogData } from "@/lib/navlog-data";
import { navlogRouteTimes } from "@/lib/navlog-route-times";
import { displayRouteCategory } from "@/lib/navlog-route-category";
import { NavlogPointPicker } from "@/components/navlog-point-picker";
import { buildNavlogFormPdf } from "@/lib/pdf/navlog-form-pdf";
import {
  buildNavlogCalculation,
  formatDuration,
  makeWaypointFromPoint,
  parseRouteText,
  routeItem15,
} from "@/lib/navlog-engine";
import {
  createPersonalRoute,
  deletePersonalRoute,
  loadPersonalRoutes,
  loadSupabasePerfectRoutes,
  perfectRouteToWaypoints,
  routeToText,
  updatePersonalRoute,
  type PerfectRoute,
} from "@/lib/navlog-saved-routes";
import { supabase } from "@/lib/supabase/client";
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

type ReviewMode = "waypoints" | "navlog";

const emptyNavlogData: NavlogDataBundle = {
  points: [],
  vors: [],
  airways: [],
  procedures: [],
};

const LITERS_PER_US_GALLON = 3.785411784;
const FINAL_RESERVE_MIN = 45;
const NAVLOG_SESSION_DRAFT_KEY = "briefings_navlog_draft_v1";

function formatFuelDisplay(liters: number) {
  const roundedLiters = Math.max(0, Math.round(liters || 0));
  const roundedGallons = Math.max(
    0,
    Math.round(roundedLiters / LITERS_PER_US_GALLON)
  );
  return `${roundedLiters}(${roundedGallons})`;
}

function formatWholeMinutes(seconds: number) {
  return `${Math.max(0, Math.round((seconds || 0) / 60))} min`;
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

function HelpTip({ label, text }: { label: string; text: string }) {
  return (
    <span
      tabIndex={0}
      title={text}
      aria-label={`${label}. ${text}`}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-300 bg-white align-middle text-[10px] font-bold normal-case tracking-normal text-zinc-500 outline-none focus:border-zinc-700"
    >
      ?
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

function AlternateStartButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const help =
    "Marks your planned destination: the normal Flight time and Block time stop here, and the next leg starts the separate alternate segment. In the NavLog, HOLD MAX XX min is the maximum waiting time available here before leaving for the alternate while preserving alternate trip fuel plus the 45 min final reserve. HM repeats that time in the NavLog and MIN in EFOB shows the minimum fuel that must remain at this point. Green means the planned Time over fits, amber means it exceeds the available margin, and red means alternate + reserve fuel is insufficient. Check the operational minima that apply to the flight.";

  return (
    <button
      type="button"
      onClick={onClick}
      title={help}
      aria-label={`${active ? "Unset" : "Start"} alternate. ${help}`}
      className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-medium text-sky-700"
    >
      {active ? "Unset alternate" : "Start alternate"}
    </button>
  );
}

function profileForAircraft(aircraftType: NavlogAircraftType) {
  const profile = applyAircraftProfile(navlogDefaultSetup, aircraftType);
  return aircraftType === "Tecnam P2006T"
    ? { ...profile, startEfob: 200 }
    : profile;
}

export function NavlogStudio({ aircraftType, onOpenAccount }: { aircraftType: NavlogAircraftType; onOpenAccount: () => void }) {
  const initialProfile = useMemo(() => profileForAircraft(aircraftType), [aircraftType]);
  const [setup, setSetup] = useState<NavlogSetupForm>(initialProfile);
  const [navlogData, setNavlogData] = useState<NavlogDataBundle | null>(null);
  const [perfectRoutes, setPerfectRoutes] = useState<PerfectRoute[]>([]);
  const [personalRoutes, setPersonalRoutes] = useState<PerfectRoute[]>([]);
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const accountIdRef = useRef<string | null>(null);
  const [personalRoutesError, setPersonalRoutesError] = useState("");
  const [dataError, setDataError] = useState<string | null>(null);

  const [reviewMode, setReviewMode] = useState<ReviewMode>("waypoints");
  const [showLayers, setShowLayers] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [manualMapClickEnabled, setManualMapClickEnabled] = useState(false);
  const [windConfirmed, setWindConfirmed] = useState(false);
  const [ayrTankConfiguration, setAyrTankConfiguration] = useState<"" | "standard" | "long-range">("");

  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [routeLibraryScope, setRouteLibraryScope] = useState<"featured" | "personal">("featured");
  const [routeCategory, setRouteCategory] = useState<"all" | "VFR" | "IFR">("all");
  const [showSaveRouteForm, setShowSaveRouteForm] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [routeText, setRouteText] = useState("");
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [routeSaveName, setRouteSaveName] = useState("");
  const [routeSaveStatus, setRouteSaveStatus] = useState("");
  const [routeSaveBusy, setRouteSaveBusy] = useState(false);
  const [addAltitude, setAddAltitude] = useState(initialProfile.defaultAltitude);
  const [routeWaypoints, setRouteWaypoints] = useState<NavlogRouteWaypoint[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draggedWaypointId, setDraggedWaypointId] = useState<string | null>(null);
  const [dragOverWaypointId, setDragOverWaypointId] = useState<string | null>(null);

  const isCustomAircraft = aircraftType === CUSTOM_AIRCRAFT_TYPE;
  const registrationOptions = getRegistrationsForAircraft(aircraftType);
  const isC152Ayr = setup.registration === "CS-AYR";
  const ayrFuelCapacityL =
    ayrTankConfiguration === "standard"
      ? C152_CS_AYR.standardFuelUsableGal * LITERS_PER_US_GALLON
      : ayrTankConfiguration === "long-range"
        ? C152_CS_AYR.longRangeFuelUsableGal * LITERS_PER_US_GALLON
        : null;
  const aircraftPerformanceValuesReady =
    setup.climbTas > 0 &&
    setup.cruiseTas > 0 &&
    setup.descentTas > 0 &&
    setup.fuelFlowLh > 0 &&
    setup.startEfob > 0 &&
    setup.rocFpm > 0 &&
    setup.rodFpm > 0;

  const calculation = useMemo(
    () => buildNavlogCalculation(setup, routeWaypoints, navlogData),
    [setup, routeWaypoints, navlogData]
  );
  const alternateWaypointId = routeWaypoints.find((waypoint) => waypoint.alternateMarker === true)?.id ?? null;
  const routeTimes = useMemo(
    () => navlogRouteTimes(calculation.legs, alternateWaypointId, setup.taxiMin),
    [calculation.legs, alternateWaypointId, setup.taxiMin]
  );
  const calculatedOnBlockClock = routeTimes.plannedOnBlockClock;
  const hasCalculatedRoute = calculation.legs.length > 0;
  const { flightTimeSec, blockTimeSec, alternateTimeSec, blockPlusAlternateSec } = routeTimes;

  useEffect(() => {
    const next = profileForAircraft(aircraftType);
    // A different aircraft changes the setup profile of this existing studio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSetup((current) => ({
      ...applyAircraftProfile(current, aircraftType),
      startEfob: aircraftType === "Tecnam P2006T" ? 200 : next.startEfob,
      showReferencePoints: current.showReferencePoints,
      referenceLayers: current.referenceLayers,
    }));
    setAddAltitude(next.defaultAltitude);
    setWindConfirmed(false);
    if (aircraftType === CUSTOM_AIRCRAFT_TYPE) setShowPerformance(true);
  }, [aircraftType]);

  useEffect(() => {
    try {
      const previous = JSON.parse(window.sessionStorage.getItem(NAVLOG_SESSION_DRAFT_KEY) ?? "null") as {
        aircraftType?: NavlogAircraftType;
        waypoints?: NavlogRouteWaypoint[];
        routeText?: string;
      } | null;
      if (previous?.aircraftType === aircraftType && Array.isArray(previous.waypoints)) {
        const validWaypoints = previous.waypoints.slice(0, 120).filter((item) =>
          typeof item?.id === "string" &&
          typeof item.point?.lat === "number" && Number.isFinite(item.point.lat) &&
          typeof item.point?.lon === "number" && Number.isFinite(item.point.lon)
        );
        if (validWaypoints.length > 0) {
          // Restore the editor after visiting the account page in the same browser tab.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setRouteWaypoints(validWaypoints);
          setRouteText(typeof previous.routeText === "string" ? previous.routeText : "");
        }
      }
    } catch {
      // Ignore invalid browser data and start with a fresh route.
    }
    setDraftRestored(true);
    // The selected aircraft is restored by NavlogClientStable on page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftRestored) return;
    try {
      window.sessionStorage.setItem(NAVLOG_SESSION_DRAFT_KEY, JSON.stringify({
        aircraftType,
        waypoints: routeWaypoints,
        routeText,
      }));
    } catch {
      // Planning must keep working if browser storage is unavailable or full.
    }
  }, [draftRestored, aircraftType, routeWaypoints, routeText]);

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
        if (routes.some((route) => route.verifiedCreator)) setRouteLibraryScope("featured");
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

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id ?? null;
      if (accountIdRef.current !== nextId) {
        accountIdRef.current = nextId;
        setPersonalRoutes([]);
        setPersonalRoutesError("");
      }
      setAccountUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const accountUserId = accountUser?.id;
  useEffect(() => {
    if (!accountUserId) return;
    let cancelled = false;
    void loadPersonalRoutes().then((routes) => {
      if (!cancelled) setPersonalRoutes(routes);
    }).catch((error) => {
      console.error(error);
      if (!cancelled) setPersonalRoutesError("Could not load your routes. Please retry signing in.");
    });
    return () => { cancelled = true; };
  }, [accountUserId]);

  function updateSetup<K extends keyof NavlogSetupForm>(
    key: K,
    value: NavlogSetupForm[K]
  ) {
    setSetup((current) => {
      const next = { ...current, [key]: value };
      if (key === "fuelFlowLh" || key === "taxiMin") {
        next.taxiFuelFlowLh = next.fuelFlowLh;
        next.taxiFuelL = (next.fuelFlowLh * next.taxiMin) / 60;
      }
      return next;
    });
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
    setMapSearchQuery("");
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

  function moveWaypointTo(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setRouteWaypoints((current) => {
      const fromIndex = current.findIndex((waypoint) => waypoint.id === sourceId);
      const targetIndex = current.findIndex((waypoint) => waypoint.id === targetId);
      if (fromIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      const insertionIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      next.splice(insertionIndex, 0, moved);
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
    if (!accountUser) {
      setRouteSaveStatus("Sign in to save a private copy of this route.");
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
      const created = await createPersonalRoute(routeSaveName, routeWaypoints);
      setPersonalRoutes((current) => [created, ...current]);
      setSelectedRouteId(created.id);
      setRouteSaveName(created.name);
      setRouteLibraryScope("personal");
      setRouteSaveStatus("Saved privately to your account.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Could not save the route.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function updateSavedRoute() {
    const selected = personalRoutes.find((route) => route.id === selectedRouteId);
    if (!selected) {
      setRouteSaveStatus("Select one of your routes to update. Public library routes are read-only.");
      return;
    }
    if (!routeSaveName.trim() || routeWaypoints.length < 2) {
      setRouteSaveStatus("Enter a name and create a route with at least two points.");
      return;
    }
    setRouteSaveBusy(true);
    setRouteSaveStatus("");
    try {
      const updated = await updatePersonalRoute(
        selected.id,
        routeSaveName,
        routeWaypoints
      );
      setPersonalRoutes((current) =>
        [updated, ...current.filter((route) => route.id !== updated.id)]
      );
      setSelectedRouteId(updated.id);
      setRouteSaveName(updated.name);
      setRouteSaveStatus("Route updated.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Could not update the route.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function deleteSavedRoute() {
    const selected = personalRoutes.find((route) => route.id === selectedRouteId);
    if (!selected) return;
    const confirmed = window.prompt(
      `Permanently delete "${selected.name}" from saved routes? Type DELETE to continue.`
    );
    if (confirmed !== "DELETE") return;
    setRouteSaveBusy(true);
    try {
      await deletePersonalRoute(selected.id);
      setPersonalRoutes((current) => current.filter((route) => route.id !== selected.id));
      setSelectedRouteId("");
      setRouteSaveName("");
      setRouteSaveStatus("Route deleted.");
    } catch (error) {
      console.error(error);
      setRouteSaveStatus("Could not delete the route.");
    } finally {
      setRouteSaveBusy(false);
    }
  }

  async function exportNavlogPdf() {
    if (
      isC152Ayr &&
      (ayrFuelCapacityL === null ||
        !Number.isFinite(setup.startEfob) ||
        setup.startEfob <= 0 ||
        setup.startEfob > ayrFuelCapacityL)
    ) {
      window.alert(
        "CS-AYR: verify the installed fuel tanks and enter the actual starting fuel quantity within the usable tank capacity before exporting."
      );
      return;
    }
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
        distanceNm: routeTimes.plannedDistanceNm,
        timeSec: flightTimeSec,
        blockTimeSec,
        blockPlusAlternateSec,
        alternateTimeSec,
        finalEfobL: routeTimes.destinationEfobL,
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

  const filteredPerfectRoutes = useMemo(() => {
    const query = routeSearch.trim().toUpperCase();
    const routes = routeLibraryScope === "personal"
      ? personalRoutes
      : perfectRoutes.filter((route) => route.verifiedCreator === true && (routeCategory === "all" || displayRouteCategory(route) === routeCategory));
    if (!query) return routes;
    return routes.filter((route) => route.name.toUpperCase().includes(query));
  }, [perfectRoutes, personalRoutes, routeSearch, routeLibraryScope, routeCategory]);

  const verifiedRouteCount = perfectRoutes.filter((route) => route.verifiedCreator).length;
  const defaultVfrCount = perfectRoutes.filter((route) => route.verifiedCreator && displayRouteCategory(route) === "VFR").length;
  const defaultIfrCount = perfectRoutes.filter((route) => route.verifiedCreator && displayRouteCategory(route) === "IFR").length;
  const routeSections = useMemo(() => {
    if (routeLibraryScope === "personal") return [{ label: "My saved routes", category: "personal", routes: filteredPerfectRoutes }];
    return ([
      { label: "VFR routes", category: "VFR", routes: filteredPerfectRoutes.filter((route) => displayRouteCategory(route) === "VFR") },
      { label: "IFR routes", category: "IFR", routes: filteredPerfectRoutes.filter((route) => displayRouteCategory(route) === "IFR") },
      { label: "Uncategorised routes", category: "other", routes: filteredPerfectRoutes.filter((route) => displayRouteCategory(route) === null) },
    ]).filter((group) => group.routes.length > 0);
  }, [filteredPerfectRoutes, routeLibraryScope]);
  const selectedPersonalRoute = personalRoutes.find((route) => route.id === selectedRouteId);

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

  const tocTodHelp =
    "TOC/TOD is added automatically when altitude changes. +X NM FROM means the calculated point is X NM after the previous waypoint. -Y NM TO means Y NM remain to the next waypoint.";
  const timeOverHelp =
    "Time added at this point for circuits, touch-and-go practice, local work or a planned wait. The NavLog shows it as +XX:XX over and adds the related fuel burn before calculating the next EFOB.";
  const globalWindHelp =
    "Uses the Route wind for the leg leaving this waypoint. Turn it off only when that leg needs a different forecast wind.";

  return (
    <div className="navlog-studio space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="grid gap-px overflow-hidden rounded-t-2xl bg-zinc-200 sm:grid-cols-2 lg:grid-cols-6">
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
                onChange={(event) => {
                  const nextRegistration = event.target.value;
                  setSetup((current) => ({
                    ...current,
                    registration: nextRegistration,
                    startEfob:
                      nextRegistration === "CS-AYR"
                        ? 0
                        : nextRegistration === "CS-AVC"
                          ? C152_NAVLOG_PRESET.startEfobL
                          : current.startEfob,
                  }));
                  setAyrTankConfiguration("");
                }}
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
                max={isC152Ayr ? ayrFuelCapacityL ?? 0 : 300}
                value={setup.startEfob}
                onChange={(event) => updateSetup("startEfob", Number(event.target.value))}
                className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-semibold outline-none"
              />
              <span className="text-xs text-zinc-400">L</span>
            </div>
          </div>

          <div className="bg-white p-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>
                Route wind
                <HelpTip label="Route wind" text="This is the default/global wind. Waypoints with Global wind enabled use this value for their outgoing leg; individual legs can override it in Review." />
              </FieldLabel>
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
        {isC152Ayr ? (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <label className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">CS-AYR installed tanks:</span>
              <select
                value={ayrTankConfiguration}
                onChange={(event) => {
                  setAyrTankConfiguration(event.target.value as "" | "standard" | "long-range");
                  updateSetup("startEfob", 0);
                }}
                className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Select verified configuration</option>
                <option value="standard">Standard · 24.5 US gal usable</option>
                <option value="long-range">Long-range · 37.5 US gal usable</option>
              </select>
            </label>
            <p className="mt-2 text-xs leading-5">
              No CS-AVC fuel quantity is copied to CS-AYR. Confirm the tank
              installation and enter the actual start EFOB in litres before PDF export.
            </p>
          </div>
        ) : null}

        <div className="border-t border-sky-200 bg-sky-50 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-sky-950">Ground / taxi allowance</p>
              <p className="mt-1 text-xs leading-5 text-sky-800">
                Time before takeoff. Included in the calculated block time and fuel burn.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-sky-300 bg-white px-3 py-2 shadow-sm">
                <span className="sr-only">Ground / taxi allowance in minutes</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={setup.taxiMin}
                  onChange={(event) =>
                    updateSetup("taxiMin", Math.max(0, Math.min(120, Number(event.target.value) || 0)))
                  }
                  className="w-16 border-0 bg-transparent text-right text-lg font-bold tabular-nums text-sky-950 outline-none"
                />
                <span className="text-sm font-medium text-sky-700">min</span>
              </label>
              <button
                type="button"
                onClick={() => updateSetup("taxiMin", initialProfile.taxiMin)}
                disabled={setup.taxiMin === initialProfile.taxiMin}
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 transition hover:border-sky-400 disabled:cursor-default disabled:opacity-40"
              >
                Reset to {initialProfile.taxiMin} min
              </button>
            </div>
          </div>
        </div>

        <details className="group border-t border-zinc-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
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
                <input value={setup.lesson} onChange={(event) => updateSetup("lesson", event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
              </label>
              <label>
                <FieldLabel>Instructor</FieldLabel>
                <input value={setup.instructor} onChange={(event) => updateSetup("instructor", event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
              </label>
              <label>
                <FieldLabel>Student</FieldLabel>
                <input value={setup.student} onChange={(event) => updateSetup("student", event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
              </label>
              <NumberField label="New point altitude" value={addAltitude} min={0} max={20000} step={100} onChange={setAddAltitude} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Aircraft assumptions</p>
                <p className="text-xs text-zinc-500">TAS, common fuel flow and climb/descent rates. Ground/taxi time is editable above.</p>
              </div>
              <button type="button" onClick={() => setShowPerformance((value) => !value)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700">
                {showPerformance ? "Hide assumptions" : "Edit assumptions"}
              </button>
            </div>

            {showPerformance ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <NumberField label="Climb TAS" value={setup.climbTas} min={30} max={250} onChange={(value) => updateSetup("climbTas", value)} />
                <NumberField label="Cruise TAS" value={setup.cruiseTas} min={30} max={300} onChange={(value) => updateSetup("cruiseTas", value)} />
                <NumberField label="Descent TAS" value={setup.descentTas} min={30} max={250} onChange={(value) => updateSetup("descentTas", value)} />
                <NumberField label="Fuel L/h · all phases" value={setup.fuelFlowLh} min={0} max={120} onChange={(value) => updateSetup("fuelFlowLh", value)} />
                <NumberField label="ROC" value={setup.rocFpm} min={100} max={2000} step={50} onChange={(value) => updateSetup("rocFpm", value)} />
                <NumberField label="ROD" value={setup.rodFpm} min={100} max={2000} step={50} onChange={(value) => updateSetup("rodFpm", value)} />
                <NumberField label="Default alt" value={setup.defaultAltitude} min={0} max={20000} step={100} onChange={(value) => updateSetup("defaultAltitude", value)} />
                <NumberField label="Mag var" value={setup.magVar} min={0} max={30} step={0.1} onChange={(value) => updateSetup("magVar", value)} />
                <label>
                  <FieldLabel>Mag dir</FieldLabel>
                  <select value={setup.magDirection} onChange={(event) => updateSetup("magDirection", event.target.value as "E" | "W")} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                    <option value="W">W</option>
                    <option value="E">E</option>
                  </select>
                </label>
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
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">Build your route</h2>
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-zinc-200 text-center text-xs">
              <div className="bg-zinc-50 px-3 py-2"><span className="block text-zinc-400">WP</span><strong>{routeWaypoints.length}</strong></div>
              <div className="bg-zinc-50 px-3 py-2"><span className="block text-zinc-400">NM to destination</span><strong>{routeTimes.plannedDistanceNm.toFixed(1)}</strong></div>
              <div className="bg-zinc-50 px-3 py-2"><span className="block text-zinc-400">Destination EFOB</span><strong>{hasCalculatedRoute ? formatFuelDisplay(routeTimes.destinationEfobL) : "—"}</strong></div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3" aria-label="NavLog time breakdown">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Flight time</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">{hasCalculatedRoute ? formatDuration(flightTimeSec) : "—"}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-600">Airborne time to your planned destination. No taxi or alternate.</p>
            </div>
            <div className="rounded-xl border-2 border-sky-400 bg-sky-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Block time · Flight Logger</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-sky-950">{hasCalculatedRoute ? formatDuration(blockTimeSec) : "—"}</p>
              <p className="mt-1 text-xs leading-5 text-sky-800">Flight to destination + {setup.taxiMin} min ground/taxi allowance. This is the planned block time to log.</p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Block + alternate</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-violet-950">{hasCalculatedRoute && routeTimes.hasAlternate ? formatDuration(blockPlusAlternateSec) : "—"}</p>
              <p className="mt-1 text-xs leading-5 text-violet-800">{routeTimes.hasAlternate
                ? `Contingency only: block + ${formatDuration(alternateTimeSec)} to alternate. Not your planned Flight Logger block time.`
                : "Use Start alternate on your planned destination in Review → Waypoints, after adding the alternate as the next waypoint. It keeps diversion time separate from your normal Block time."}</p>
            </div>
          </div>
          <details className="mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-700">
            <summary className="cursor-pointer font-semibold text-zinc-900">How to use Start alternate</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 leading-5">
              <li>Build the route to your intended destination first.</li>
              <li>Add the diversion route and alternate airport <strong>after</strong> your destination.</li>
              <li>In <strong>Review → Waypoints</strong>, select <strong>Start alternate</strong> on the intended destination row.</li>
            </ol>
            <p className="mt-2 leading-5">Flight time and Block time then stop at your destination. Block + alternate includes the extra diversion time for contingency planning, not for your normal Flight Logger entry.</p>
          </details>

          {accountUser ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Save routes to your own profile</p>
              <p className="mt-0.5 text-xs text-zinc-600">Keep your flight plans private and reopen them on any device.</p>
            </div>
              <button type="button" onClick={() => setShowSaveRouteForm((value) => !value)} aria-expanded={showSaveRouteForm}
                className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
                {showSaveRouteForm ? "Close saving" : "Save my route"}
              </button>
          </div> : null}

          {accountUser && showSaveRouteForm ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3">
              <label className="min-w-48 flex-1 text-xs font-medium text-zinc-600">Route name
                <input value={routeSaveName} onChange={(event) => setRouteSaveName(event.target.value)} maxLength={100} placeholder="Give this route a name" className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm" />
              </label>
              <button type="button" onClick={createSavedRoute} disabled={routeSaveBusy || routeWaypoints.length < 2 || routeWaypoints.length > 120} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">Save new</button>
              {selectedPersonalRoute ? (
                <>
                  <button type="button" onClick={updateSavedRoute} disabled={routeSaveBusy || routeWaypoints.length < 2 || routeWaypoints.length > 120} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 disabled:opacity-40">Update</button>
                  <button type="button" onClick={deleteSavedRoute} disabled={routeSaveBusy} className="px-2 py-2.5 text-sm text-red-700 disabled:opacity-40">Delete</button>
                </>
              ) : null}
            </div>
          ) : null}
          {routeSaveStatus ? <p role="status" className="mt-2 text-xs text-zinc-700">{routeSaveStatus}</p> : null}

          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-sm font-semibold text-white">1</span>
              <div>
                <h3 className="text-base font-semibold text-zinc-950">Choose an existing route</h3>
                <p className="mt-0.5 text-sm leading-6 text-zinc-600">Start with a default route, or reopen a route you saved privately.</p>
              </div>
            </div>
              <div className="grid gap-2 sm:grid-cols-2" aria-label="Route collections">
                  {([
                    ["featured", "Default routes", verifiedRouteCount, "Selected by the site owner"],
                    ["personal", "My saved routes", personalRoutes.length, "Private to your account"],
                  ] as const).map(([scope, label, count, description]) => (
                    <button key={scope} type="button" onClick={() => { setRouteLibraryScope(scope); setRouteSearch(""); }} aria-pressed={routeLibraryScope === scope}
                      className={`rounded-2xl border-2 px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${scope === "featured"
                        ? routeLibraryScope === scope ? "border-sky-600 bg-sky-50 ring-2 ring-sky-100" : "border-sky-200 bg-sky-50/70 hover:border-sky-400"
                        : routeLibraryScope === scope ? "border-violet-600 bg-violet-50 ring-2 ring-violet-100" : "border-violet-200 bg-violet-50/70 hover:border-violet-400"}`}>
                      <span className="block text-sm font-semibold text-zinc-950">{label} <span className="font-normal tabular-nums text-zinc-500">({count})</span></span>
                      <span className="mt-1.5 block text-xs leading-5 text-zinc-600">{description}</span>
                    </button>
                  ))}
              </div>

              {routeLibraryScope === "personal" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Your private routes</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{accountUser ? "Only you can access your saved routes." : "Sign in to access or save routes across devices."}</p>
                  </div>
                  <button type="button" onClick={onOpenAccount} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
                    {accountUser ? "My account" : "Sign in / Create account"}
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="navlog-route-search" className="sr-only">Search saved routes</label>
                <input id="navlog-route-search" value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} placeholder="Search by aerodrome, name or route…"
                  className="h-11 min-w-44 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-950" />
              </div>
              {routeLibraryScope !== "personal" ? (
                <div className="flex flex-wrap gap-2" aria-label="Filter default routes by flight rules">
                  {([
                    ["all", "All defaults", verifiedRouteCount],
                    ["VFR", "VFR", defaultVfrCount],
                    ["IFR", "IFR", defaultIfrCount],
                  ] as const).map(([value, label, count]) => (
                    <button key={value} type="button" onClick={() => setRouteCategory(value)} aria-pressed={routeCategory === value}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${routeCategory === value
                        ? value === "IFR" ? "border-indigo-600 bg-indigo-50 text-indigo-900" : value === "VFR" ? "border-sky-600 bg-sky-50 text-sky-900" : "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                      {label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="max-h-96 overflow-y-auto rounded-xl border border-zinc-200">
                {personalRoutesError && routeLibraryScope === "personal" ? <p role="alert" className="p-3 text-xs text-red-700">{personalRoutesError}</p> : null}
                {filteredPerfectRoutes.length === 0 ? (
                  <div className="p-6 text-center text-sm leading-6 text-zinc-500">
                    <p>{routeLibraryScope === "personal" && !accountUser
                      ? "Sign in to view your private routes."
                      : routeLibraryScope === "featured" && verifiedRouteCount === 0
                        ? "Default routes are being reviewed. Please try again soon."
                        : "No matching routes."}</p>
                  </div>
                ) : routeSections.map((section) => (
                  <section key={section.category}>
                    <div className={`flex items-center justify-between border-y px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] ${section.category === "VFR" ? "border-sky-100 bg-sky-50 text-sky-900" : section.category === "IFR" ? "border-indigo-100 bg-indigo-50 text-indigo-900" : "border-zinc-100 bg-zinc-50 text-zinc-700"}`}>
                      <span>{section.label}</span><span className="tabular-nums">{section.routes.length}</span>
                    </div>
                    {section.routes.map((route) => (
                      <button key={route.id} type="button" onClick={() => loadPerfectRoute(route)}
                        className={["flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left transition-colors hover:bg-zinc-50", selectedRouteId === route.id ? "bg-zinc-50" : "bg-white"].join(" ")}>
                        <span className="min-w-0">
                          <strong className="block truncate text-sm font-bold text-zinc-950">{route.name || "Untitled route"}</strong>
                          <span className="mt-0.5 block text-xs text-zinc-500">{route.waypoints.length} points · {route.waypoints.slice(0, 5).map((point) => point.code || point.name || "WP").join(" → ")}{route.waypoints.length > 5 ? " …" : ""}</span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-zinc-700">Use →</span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            </div>

            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-800">2</span>
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950">Find and add navigation points</h3>
                    <p className="mt-0.5 text-sm leading-6 text-zinc-600">Build your own route one point at a time. Search an aerodrome, VOR or waypoint by name or ICAO code.</p>
                  </div>
                </div>
                <div className="mt-4">
                  {dataError ? <p className="pb-2 text-sm text-red-700">{dataError}</p> : null}
                  <NavlogPointPicker points={navlogData?.points ?? emptyNavlogData.points} onAdd={addPoint}
                    onLocate={(point) => setMapSearchQuery(point.code)} disabled={!navlogData} />
                  <p className="mt-2 text-[11px] text-zinc-500">Use <strong>Map</strong> to locate a result without interrupting your typing, or <strong>+ Add</strong> to include it in the route.</p>
                </div>
              </section>

              <section className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-800">3</span>
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950">Enter a complete route</h3>
                    <p className="mt-0.5 text-sm leading-6 text-zinc-600">Already know the route? Paste the waypoints in order, as in Item 15 of a flight plan.</p>
                  </div>
                </div>
                <label htmlFor="navlog-route-text" className="sr-only">Route waypoints</label>
                <textarea id="navlog-route-text" value={routeText} onChange={(event) => setRouteText(event.target.value)} placeholder="LPSO NSA MAGUM PORCA…"
                  className="mt-4 min-h-24 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-zinc-950" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={replaceRouteFromText} disabled={!navlogData || !routeText.trim()} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Use this route</button>
                  <button type="button" onClick={appendRouteFromText} disabled={!navlogData || !routeText.trim()} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 disabled:opacity-40">Add to current route</button>
                </div>
                {routeWarnings.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    {routeWarnings.map((warning) => <p key={warning} className="text-xs text-zinc-700">{warning}</p>)}
                  </div>
                ) : null}
              </section>
            </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setManualMapClickEnabled((value) => !value)}
                aria-pressed={manualMapClickEnabled}
                className={["rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2", manualMapClickEnabled ? "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:outline-emerald-700" : "bg-sky-700 text-white hover:bg-sky-800 focus-visible:outline-sky-700"].join(" ")}
              >
                {manualMapClickEnabled ? "✓ Stop adding map points" : "+ Add point anywhere on map"}
              </button>
              <p className="max-w-64 text-[11px] leading-4 text-zinc-600">
                Enable, then click or tap the map to place a waypoint.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">New point</span>
              <input type="number" value={addAltitude} step={100} onChange={(event) => setAddAltitude(Number(event.target.value))} className="w-20 border-0 bg-transparent text-sm font-semibold outline-none" />
              <span className="text-xs text-zinc-400">ft</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => updateSetup("showReferencePoints", !setup.showReferencePoints)} className={["rounded-xl border px-3 py-2 text-sm font-medium", setup.showReferencePoints ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-700"].join(" ")}>
              Reference points {setup.showReferencePoints ? "on" : "off"}
            </button>
            <button type="button" onClick={() => setShowLayers((value) => !value)} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700">Layers {showLayers ? "▴" : "▾"}</button>
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
            ✓ Map placement is active — click or tap anywhere on the map to add a waypoint at {addAltitude} ft.
          </div>
        ) : null}

        <div className="min-w-0">
          <NavlogMap
            points={(navlogData ?? emptyNavlogData).points}
            routeWaypoints={routeWaypoints}
            calculatedNodes={calculation.nodes}
            searchQuery={mapSearchQuery}
            showReferencePoints={setup.showReferencePoints}
            referenceLayers={setup.referenceLayers}
            manualMapClickEnabled={manualMapClickEnabled}
            onAddPoint={addPoint}
            onAddMapPoint={addMapPoint}
          />
        </div>

        <div className="border-t border-zinc-200 bg-white px-4 py-3">
          {routeWaypoints.length === 0 ? (
            <p className="text-sm text-zinc-500">Route is empty.</p>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {routeWaypoints.map((waypoint, index) => (
                <div key={waypoint.id} className="flex shrink-0 items-center gap-2">
                  {index > 0 ? <span className="text-zinc-300">→</span> : null}
                  <div className={["rounded-xl border px-3 py-2", waypoint.alternateMarker ? "border-sky-300 bg-sky-50" : "border-zinc-200 bg-zinc-50"].join(" ")}>
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
                <p className="mt-1">HOLD MAX <strong>{formatWholeMinutes(alternatePlanning.holdAvailableSec)}</strong> before alternate + 45 min final reserve.</p>
                <p className="mt-1 text-xs opacity-80">This is the maximum time available at the marked point before you must depart for the alternate while preserving the required alternate and reserve fuel.</p>
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
              <table className="w-full min-w-[1230px] text-left text-sm">
                <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-3">Order</th>
                    <th className="px-4 py-3">Point</th>
                    <th className="px-4 py-3">Alt</th>
                    <th className="px-4 py-3">Time over <HelpTip label="Time over" text={timeOverHelp} /></th>
                    <th className="px-4 py-3">Wind <HelpTip label="Global wind" text={globalWindHelp} /></th>
                    <th className="px-4 py-3">VOR</th>
                    <th className="px-4 py-3">Note</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {waypointTableRows.map((row) => {
                    if (row.kind === "marker") {
                      return (
                        <tr key={`marker-${row.previousWaypointId}-${row.node.code}-${row.node.lat}-${row.node.lon}`} className="bg-indigo-50/70">
                          <td className="px-3 py-3 text-xs font-semibold uppercase text-indigo-500">Auto</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5"><strong className="text-indigo-800">{row.node.code}</strong><HelpTip label={`${row.node.code} position`} text={tocTodHelp} /></div>
                            <span className="mt-1 block text-xs text-indigo-600">{row.previousWaypointCode} → {row.nextWaypointCode}</span>
                          </td>
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
                          <td className="px-3 py-3 text-xs font-semibold uppercase">Off</td>
                          <td className="px-4 py-3"><strong>{row.markerCode} removed</strong><span className="mt-1 block text-xs">{row.previousWaypointCode} → {row.nextWaypointCode}</span></td>
                          <td className="px-4 py-3">{row.fromAlt.toFixed(0)} → {row.toAlt.toFixed(0)} ft</td>
                          <td className="px-4 py-3">—</td><td className="px-4 py-3">Cruise/level</td><td className="px-4 py-3">—</td>
                          <td className="max-w-72 px-4 py-3 text-xs">Altitude stays as a reference; time and fuel use cruise/level calculation.</td>
                          <td className="px-4 py-3"><button type="button" onClick={() => restoreVerticalMarker(row.previousWaypointId)} className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700">Restore TOC/TOD</button></td>
                        </tr>
                      );
                    }

                    const { waypoint, index } = row;
                    const isDragTarget = dragOverWaypointId === waypoint.id && draggedWaypointId !== waypoint.id;
                    return (
                      <tr
                        key={waypoint.id}
                        onDragOver={(event) => {
                          if (!draggedWaypointId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverWaypointId(waypoint.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverWaypointId === waypoint.id) setDragOverWaypointId(null);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggedWaypointId) moveWaypointTo(draggedWaypointId, waypoint.id);
                          setDraggedWaypointId(null);
                          setDragOverWaypointId(null);
                        }}
                        className={[
                          waypoint.alternateMarker ? "bg-sky-50" : "",
                          isDragTarget ? "outline outline-2 outline-offset-[-2px] outline-zinc-400" : "",
                          draggedWaypointId === waypoint.id ? "opacity-50" : "",
                        ].join(" ")}
                      >
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <span
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", waypoint.id);
                                setDraggedWaypointId(waypoint.id);
                              }}
                              onDragEnd={() => {
                                setDraggedWaypointId(null);
                                setDragOverWaypointId(null);
                              }}
                              title="Drag this handle to reorder the waypoint"
                              className="cursor-grab select-none rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-zinc-400 active:cursor-grabbing"
                            >
                              ⋮⋮
                            </span>
                            <span className="text-zinc-400">{index + 1}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input value={waypoint.point.code} onChange={(event) => updateWaypointPoint(waypoint.id, { code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 font-semibold" />
                          <input value={waypoint.point.name} onChange={(event) => updateWaypointPoint(waypoint.id, { name: event.target.value })} className="mt-2 block w-44 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600" />
                          {waypoint.alternateMarker ? <span className="mt-2 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">DESTINATION · ALT START</span> : null}
                        </td>
                        <td className="px-4 py-3 align-top"><input type="number" value={waypoint.altitudeFt} step={100} onChange={(event) => updateWaypoint(waypoint.id, { altitudeFt: Number(event.target.value) })} className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5" /></td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <input type="number" value={waypoint.stopMin} min={0} onChange={(event) => updateWaypoint(waypoint.id, { stopMin: Number(event.target.value) })} className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5" />
                            <span className="text-xs text-zinc-400">min</span>
                          </div>
                          {waypoint.alternateMarker && alternatePlanning ? <div className={["mt-2 rounded-lg border px-2 py-1 text-[10px] font-semibold", holdMaxClass(alternatePlanning.status)].join(" ")}>HOLD MAX {formatWholeMinutes(alternatePlanning.holdAvailableSec)}</div> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <label title={globalWindHelp} className="mb-2 flex cursor-help items-center gap-2 text-xs text-zinc-500"><input type="checkbox" checked={waypoint.useGlobalWind} onChange={(event) => updateWaypoint(waypoint.id, { useGlobalWind: event.target.checked })} />Global wind <HelpTip label="Global wind" text={globalWindHelp} /></label>
                          {waypoint.useGlobalWind ? <span>{String(setup.windFrom).padStart(3, "0")}/{setup.windKt}</span> : <div className="flex gap-2"><input type="number" value={waypoint.windFrom} onChange={(event) => updateWaypoint(waypoint.id, { windFrom: Number(event.target.value) })} className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5" /><input type="number" value={waypoint.windKt} onChange={(event) => updateWaypoint(waypoint.id, { windKt: Number(event.target.value) })} className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5" /></div>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select value={waypoint.vorPref} onChange={(event) => updateWaypoint(waypoint.id, { vorPref: event.target.value as "AUTO" | "FIXED" })} className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"><option value="AUTO">AUTO</option><option value="FIXED">FIXED</option></select>
                          {waypoint.vorPref === "FIXED" ? <select value={waypoint.vorIdent} onChange={(event) => updateWaypoint(waypoint.id, { vorIdent: event.target.value })} className="mt-2 block w-28 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"><option value="">Select</option>{vorOptions.map((vor) => <option key={vor}>{vor}</option>)}</select> : null}
                        </td>
                        <td className="px-4 py-3 align-top"><input value={waypoint.note} onChange={(event) => updateWaypoint(waypoint.id, { note: event.target.value })} placeholder="NavLog note" className="w-44 rounded-lg border border-zinc-200 px-2 py-1.5" /></td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => moveWaypoint(waypoint.id, "up")} disabled={index === 0} className="rounded-lg border border-zinc-200 px-2 py-1 disabled:opacity-30" title="Move waypoint up">↑</button>
                            <button type="button" onClick={() => moveWaypoint(waypoint.id, "down")} disabled={index === routeWaypoints.length - 1} className="rounded-lg border border-zinc-200 px-2 py-1 disabled:opacity-30" title="Move waypoint down">↓</button>
                            <AlternateStartButton active={waypoint.alternateMarker === true} onClick={() => toggleAlternateMarker(waypoint.id)} />
                            <button type="button" onClick={() => removeWaypoint(waypoint.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600">Remove</button>
                          </div>
                        </td>
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
                  <tr><th className="px-3 py-3">Leg</th><th className="px-3 py-3">From</th><th className="px-3 py-3">To</th><th className="px-3 py-3">Profile</th><th className="px-3 py-3">Alt</th><th className="px-3 py-3">TC</th><th className="px-3 py-3">TH</th><th className="px-3 py-3">MH</th><th className="px-3 py-3">TAS</th><th className="px-3 py-3">GS</th><th className="px-3 py-3">Dist</th><th className="px-3 py-3">ETE / time over</th><th className="px-3 py-3">Fuel</th><th className="px-3 py-3">EFOB</th><th className="px-3 py-3">Clock</th><th className="px-3 py-3">Tracking</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {calculation.legs.map((leg) => (
                    <tr key={leg.i}>
                      <td className="px-3 py-3">{leg.i}</td><td className="px-3 py-3 font-medium">{leg.from.code}</td><td className="px-3 py-3 font-medium">{leg.to.code}</td><td className="px-3 py-3">{leg.profile}</td>
                      <td className="px-3 py-3 text-zinc-600">{leg.from.alt.toFixed(0)} → {leg.to.alt.toFixed(0)} ft{leg.profile === "LEVEL" && Math.abs(leg.to.alt - leg.from.alt) > 1 ? <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">REF</span> : null}</td>
                      <td className="px-3 py-3">{leg.tc.toFixed(0)}</td><td className="px-3 py-3">{leg.th.toFixed(0)}</td><td className="px-3 py-3">{leg.mh.toFixed(0)}</td><td className="px-3 py-3">{leg.tas.toFixed(0)}</td><td className="px-3 py-3">{leg.gs.toFixed(0)}</td><td className="px-3 py-3">{leg.distNm.toFixed(1)}</td>
                      <td className="px-3 py-3"><strong>{formatDuration(leg.eteSec)}</strong>{leg.holdSec > 0 ? <span className="mt-1 block text-xs font-medium text-violet-700">+{formatDuration(leg.holdSec)} over</span> : null}{alternatePlanning?.markerWaypointId === leg.to.id ? <span className="mt-1 block text-xs font-semibold text-emerald-700">HM {formatWholeMinutes(alternatePlanning.holdAvailableSec)}</span> : null}</td>
                      <td className="px-3 py-3">{formatFuelDisplay(leg.burnL)}{leg.holdBurnL > 0 ? <span className="mt-1 block text-xs font-medium text-violet-700">+{formatFuelDisplay(leg.holdBurnL)} over</span> : null}</td>
                      <td className="px-3 py-3">{formatFuelDisplay(leg.efobEndL)}{alternatePlanning?.markerWaypointId === leg.to.id ? <span className="mt-1 block text-xs font-semibold text-emerald-700">MIN {formatFuelDisplay(alternatePlanning.minimumFuelAtMarkerL)}</span> : null}</td>
                      <td className="px-3 py-3">{leg.clockStart} → {leg.clockArrive}{leg.holdSec > 0 ? <span className="mt-1 block text-xs text-violet-700">out {leg.clockEnd}</span> : null}</td><td className="max-w-56 whitespace-pre-line px-3 py-3 text-zinc-600">{leg.tracking || "—"}</td>
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
