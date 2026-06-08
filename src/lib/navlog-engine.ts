import {
  navlogAircraftProfiles,
  type NavlogCalculationResult,
  type NavlogDataBundle,
  type NavlogLeg,
  type NavlogPoint,
  type NavlogRouteNode,
  type NavlogRouteWaypoint,
  type NavlogSetupForm,
  type NavlogVor,
} from "@/lib/navlog";

const EARTH_NM = 3440.065;
const ROUND_TIME_SEC = 60;
const ROUND_DIST_NM = 0.5;
const ROUND_FUEL_L = 1.0;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

export function wrap360(value: number) {
  return ((value % 360) + 360) % 360;
}

function angDiff(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

function roundToStep(value: number, step: number) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

function rt(seconds: number) {
  return Math.round(roundToStep(seconds, ROUND_TIME_SEC));
}

function rd(distanceNm: number) {
  return Number(roundToStep(distanceNm, ROUND_DIST_NM).toFixed(1));
}

function rf(fuelL: number) {
  return Number(roundToStep(fuelL, ROUND_FUEL_L).toFixed(1));
}

export function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const totalMinutes = Math.round(rounded / 60);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}`;
  }

  const minutes = Math.floor(rounded / 60);
  const sec = rounded % 60;

  return `${String(minutes).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatClock(seconds: number, startClock: string) {
  if (!startClock.trim()) return `T+${formatDuration(seconds)}`;

  const [hh, mm] = startClock.split(":").map(Number);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return `T+${formatDuration(seconds)}`;
  }

  const date = new Date();
  date.setHours(hh, mm, 0, 0);
  date.setSeconds(date.getSeconds() + seconds);

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

export function gcDistanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

  return EARTH_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function gcCourseTc(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return wrap360(toDeg(Math.atan2(y, x)));
}

export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceNm: number
) {
  const delta = distanceNm / EARTH_NM;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );

  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  return {
    lat: toDeg(phi2),
    lon: ((toDeg(lambda2) + 540) % 360) - 180,
  };
}

export function pointAlongGreatCircle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  distanceFromStartNm: number
) {
  const totalDistance = gcDistanceNm(lat1, lon1, lat2, lon2);
  const course = gcCourseTc(lat1, lon1, lat2, lon2);

  if (totalDistance <= 0) {
    return { lat: lat1, lon: lon1 };
  }

  return destinationPoint(
    lat1,
    lon1,
    course,
    Math.min(distanceFromStartNm, totalDistance)
  );
}

export function windTriangle(
  trueCourse: number,
  tas: number,
  windFrom: number,
  windKt: number
) {
  if (tas <= 0) {
    return {
      wca: 0,
      th: wrap360(trueCourse),
      gs: 0,
    };
  }

  const d = toRad(angDiff(windFrom, trueCourse));
  const cross = windKt * Math.sin(d);
  const s = Math.max(-1, Math.min(1, cross / Math.max(tas, 1e-9)));
  const wca = toDeg(Math.asin(s));
  const th = wrap360(trueCourse + wca);
  const gs = Math.max(0, tas * Math.cos(toRad(wca)) - windKt * Math.cos(d));

  return {
    wca,
    th,
    gs,
  };
}

export function applyMagVar(
  trueHeading: number,
  magVar: number,
  magDirection: "E" | "W"
) {
  return wrap360(
    magDirection === "E" ? trueHeading - magVar : trueHeading + magVar
  );
}

function cleanCode(value: string) {
  return value.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
}

export function makeWaypointFromPoint(
  point: NavlogPoint,
  setup: NavlogSetupForm,
  altitudeFt = setup.defaultAltitude,
  stopMin = 0
): NavlogRouteWaypoint {
  return {
    id: crypto.randomUUID(),
    point,
    altitudeFt,
    useGlobalWind: setup.useGlobalWind,
    windFrom: setup.windFrom,
    windKt: setup.windKt,
    stopMin,
    note: "",
    vorPref: "AUTO",
    vorIdent: "",
  };
}

export function waypointToNode(
  waypoint: NavlogRouteWaypoint
): NavlogRouteNode {
  return {
    id: waypoint.id,
    code: waypoint.point.code,
    name: waypoint.point.name,
    lat: waypoint.point.lat,
    lon: waypoint.point.lon,
    alt: waypoint.altitudeFt,
    src: waypoint.point.src,
    note: waypoint.note,
    stopMin: waypoint.stopMin,
    useGlobalWind: waypoint.useGlobalWind,
    windFrom: waypoint.windFrom,
    windKt: waypoint.windKt,
    vorPref: waypoint.vorPref,
    vorIdent: waypoint.vorIdent,
    suppressAutoVertical: waypoint.suppressAutoVertical ?? false,
  };
}

function windForNode(node: NavlogRouteNode, setup: NavlogSetupForm) {
  if (node.useGlobalWind) {
    return {
      windFrom: setup.windFrom,
      windKt: setup.windKt,
    };
  }

  return {
    windFrom: node.windFrom,
    windKt: node.windKt,
  };
}

function compactNavToken(value: string) {
  return cleanCode(value).slice(0, 8) || "WP";
}

function buildTocTodNodes(
  userNodes: NavlogRouteNode[],
  setup: NavlogSetupForm
): NavlogRouteNode[] {
  if (userNodes.length < 2) return userNodes;

  const output: NavlogRouteNode[] = [];

  for (let index = 0; index < userNodes.length - 1; index += 1) {
    const a = userNodes[index];
    const b = userNodes[index + 1];

    output.push(a);

    if (a.suppressAutoVertical === true) {
      continue;
    }

    const dist = gcDistanceNm(a.lat, a.lon, b.lat, b.lon);
    const tc = gcCourseTc(a.lat, a.lon, b.lat, b.lon);
    const { windFrom, windKt } = windForNode(a, setup);

    const fromLabel = a.code || a.name || "FROM";
    const toLabel = b.code || b.name || "TO";

    if (b.alt > a.alt) {
      const climbMinutes = (b.alt - a.alt) / Math.max(setup.rocFpm, 1);
      const { gs } = windTriangle(tc, setup.climbTas, windFrom, windKt);
      const distanceNeeded = (gs * climbMinutes) / 60;

      if (distanceNeeded > 0.05 && distanceNeeded < dist - 0.05) {
        const pos = pointAlongGreatCircle(
          a.lat,
          a.lon,
          b.lat,
          b.lon,
          distanceNeeded
        );

        const dFrom = rd(distanceNeeded);
        const dTo = rd(dist - distanceNeeded);

        output.push({
          id: `${a.id}__TOC__${b.id}`,
          code: "TOC",
          name: "TOC",
          lat: pos.lat,
          lon: pos.lon,
          alt: b.alt,
          src: "CALC",
          note: `TOC\\n+${dFrom.toFixed(1)} ${compactNavToken(
            fromLabel
          )}\\n-${dTo.toFixed(1)} ${compactNavToken(toLabel)}`,
          stopMin: 0,
          useGlobalWind: true,
          windFrom: setup.windFrom,
          windKt: setup.windKt,
          vorPref: "AUTO",
          vorIdent: "",
          calcDetail: `${dFrom.toFixed(1)} NM from ${fromLabel} / ${dTo.toFixed(
            1
          )} NM to ${toLabel}`,
        });
      }
    }

    if (b.alt < a.alt) {
      const descentMinutes = (a.alt - b.alt) / Math.max(setup.rodFpm, 1);
      const { gs } = windTriangle(tc, setup.descentTas, windFrom, windKt);
      const distanceNeeded = (gs * descentMinutes) / 60;

      if (distanceNeeded > 0.05 && distanceNeeded < dist - 0.05) {
        const dFrom = rd(dist - distanceNeeded);
        const dTo = rd(distanceNeeded);

        const pos = pointAlongGreatCircle(a.lat, a.lon, b.lat, b.lon, dFrom);

        output.push({
          id: `${a.id}__TOD__${b.id}`,
          code: "TOD",
          name: "TOD",
          lat: pos.lat,
          lon: pos.lon,
          alt: a.alt,
          src: "CALC",
          note: `TOD\\n+${dFrom.toFixed(1)} ${compactNavToken(
            fromLabel
          )}\\n-${dTo.toFixed(1)} ${compactNavToken(toLabel)}`,
          stopMin: 0,
          useGlobalWind: true,
          windFrom: setup.windFrom,
          windKt: setup.windKt,
          vorPref: "AUTO",
          vorIdent: "",
          calcDetail: `${dFrom.toFixed(1)} NM from ${fromLabel} / ${dTo.toFixed(
            1
          )} NM to ${toLabel}`,
        });
      }
    }
  }

  output.push(userNodes[userNodes.length - 1]);

  return output;
}

function nearestVor(
  vors: NavlogVor[],
  lat: number,
  lon: number
): NavlogVor | null {
  if (vors.length === 0) return null;

  let best = vors[0];
  let bestDistance = gcDistanceNm(lat, lon, best.lat, best.lon);

  for (const vor of vors.slice(1)) {
    const distance = gcDistanceNm(lat, lon, vor.lat, vor.lon);

    if (distance < bestDistance) {
      best = vor;
      bestDistance = distance;
    }
  }

  return best;
}

function vorRadialDistance(vor: NavlogVor, lat: number, lon: number) {
  return {
    radial: Math.round(gcCourseTc(vor.lat, vor.lon, lat, lon)),
    distance: gcDistanceNm(vor.lat, vor.lon, lat, lon),
  };
}

function trackingInstruction(
  from: NavlogRouteNode,
  to: NavlogRouteNode,
  data: NavlogDataBundle | null
) {
  if (to.note) return to.note;

  if (!data || data.vors.length === 0) return "";

  const preferred =
    from.vorPref === "FIXED"
      ? data.vors.find((vor) => vor.ident === cleanCode(from.vorIdent))
      : null;

  const mid = pointAlongGreatCircle(
    from.lat,
    from.lon,
    to.lat,
    to.lon,
    gcDistanceNm(from.lat, from.lon, to.lat, to.lon) / 2
  );

  const vor = preferred ?? nearestVor(data.vors, mid.lat, mid.lon);

  if (!vor) return "";

  const a = vorRadialDistance(vor, from.lat, from.lon);
  const b = vorRadialDistance(vor, to.lat, to.lon);

  if (b.distance < a.distance - 0.3) {
    return `INB ${vor.ident} R${String(a.radial).padStart(3, "0")}`;
  }

  if (b.distance > a.distance + 0.3) {
    return `OUTB ${vor.ident} R${String(a.radial).padStart(3, "0")}`;
  }

  return `X-RAD ${vor.ident} R${String(a.radial).padStart(3, "0")}→R${String(
    b.radial
  ).padStart(3, "0")}`;
}

export function buildNavlogCalculation(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  data: NavlogDataBundle | null
): NavlogCalculationResult {
  if (waypoints.length < 2) {
    return {
      nodes: waypoints.map(waypointToNode),
      legs: [],
    };
  }

  const userNodes = waypoints.map(waypointToNode);
  const nodes = buildTocTodNodes(userNodes, setup);

  const legs: NavlogLeg[] = [];
  let timeCursor = Math.max(0, setup.taxiMin * 60);
  const taxiFuelL = rf((setup.taxiFuelFlowLh * setup.taxiMin) / 60);
  let efob = Math.max(0, setup.startEfob - taxiFuelL);

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];

    const distRaw = gcDistanceNm(from.lat, from.lon, to.lat, to.lon);
    const tc = gcCourseTc(from.lat, from.lon, to.lat, to.lon);
    const dist = rd(distRaw);
    const { windFrom, windKt } = windForNode(from, setup);

    const verticalSuppressed = from.suppressAutoVertical === true;
    const legProfile = verticalSuppressed
      ? "LEVEL"
      : to.alt > from.alt + 1
        ? "CLIMB"
        : to.alt < from.alt - 1
          ? "DESCENT"
          : "LEVEL";

    const tas =
      legProfile === "CLIMB"
        ? setup.climbTas
        : legProfile === "DESCENT"
          ? setup.descentTas
          : setup.cruiseTas;

    const { th, gs } = windTriangle(tc, tas, windFrom, windKt);
    const mh = applyMagVar(th, setup.magVar, setup.magDirection);
    const eteSec = gs > 0 && dist > 0 ? rt((dist / gs) * 3600) : 0;
    const burnL = rf((setup.fuelFlowLh * eteSec) / 3600);

    const holdSec = to.stopMin > 0 ? rt(to.stopMin * 60) : 0;
    const holdBurnL = holdSec > 0 ? rf((setup.fuelFlowLh * holdSec) / 3600) : 0;

    const efobStartL = efob;
    const efobAfterLegL = Math.max(0, rf(efobStartL - burnL));
    const efobEndL = Math.max(0, rf(efobAfterLegL - holdBurnL));

    const clockStart = formatClock(timeCursor, setup.startClock);
    const clockArrive = formatClock(timeCursor + eteSec, setup.startClock);
    const clockEnd = formatClock(timeCursor + eteSec + holdSec, setup.startClock);

    legs.push({
      i: legs.length + 1,
      from,
      to,
      profile: legProfile,
      tc: Math.round(tc),
      th: Math.round(th),
      mh: Math.round(mh),
      tas,
      gs: Math.round(gs),
      distNm: dist,
      eteSec,
      burnL,
      holdSec,
      holdBurnL,
      efobStartL,
      efobAfterLegL,
      efobEndL,
      clockStart,
      clockArrive,
      clockEnd,
      windFrom,
      windKt,
      tracking: trackingInstruction(from, to, data),
    });

    timeCursor += eteSec + holdSec;
    efob = efobEndL;
  }

  return {
    nodes,
    legs,
  };
}

function resolvePointToken(token: string, points: NavlogPoint[]) {
  const clean = cleanCode(token);

  if (!clean) return null;

  return (
    points.find((point) => cleanCode(point.code) === clean) ??
    points.find((point) => cleanCode(point.name) === clean) ??
    points.find((point) => cleanCode(point.code).startsWith(clean)) ??
    points.find((point) => cleanCode(point.name).includes(clean)) ??
    null
  );
}

export function parseRouteText(
  text: string,
  data: NavlogDataBundle,
  setup: NavlogSetupForm,
  altitudeFt: number
): {
  waypoints: NavlogRouteWaypoint[];
  warnings: string[];
} {
  const tokens = text
    .split(/[\s,;]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

  const waypoints: NavlogRouteWaypoint[] = [];
  const warnings: string[] = [];

  for (const token of tokens) {
    const point = resolvePointToken(token, data.points);

    if (!point) {
      warnings.push(`Could not find point for: ${token}`);
      continue;
    }

    waypoints.push(makeWaypointFromPoint(point, setup, altitudeFt));
  }

  return {
    waypoints,
    warnings,
  };
}

export function makeVorRadialDistanceFix(
  input: string,
  data: NavlogDataBundle,
  setup: NavlogSetupForm,
  altitudeFt: number
): NavlogRouteWaypoint | null {
  const match = input
    .trim()
    .toUpperCase()
    .match(/^([A-Z0-9]{2,5})\s*\/\s*R?([0-9]{1,3})\s*\/\s*D?([0-9]+(?:\.\d+)?)$/);

  if (!match) return null;

  const [, identRaw, radialRaw, distanceRaw] = match;
  const ident = cleanCode(identRaw);
  const radial = Number(radialRaw);
  const distance = Number(distanceRaw);

  if (!Number.isFinite(radial) || !Number.isFinite(distance)) return null;

  const vor = data.vors.find((item) => cleanCode(item.ident) === ident);

  if (!vor) return null;

  const pos = destinationPoint(vor.lat, vor.lon, radial, distance);

  const point: NavlogPoint = {
    code: `${ident}R${String(Math.round(radial)).padStart(3, "0")}D${String(distance).replace(".", "")}`,
    name: `${ident} R${String(Math.round(radial)).padStart(3, "0")} / D${distance}`,
    lat: pos.lat,
    lon: pos.lon,
    alt: altitudeFt,
    src: "IFR",
    routes: "",
    remarks: "VOR radial/distance fix",
  };

  return makeWaypointFromPoint(point, setup, altitudeFt);
}

export function routeItem15(waypoints: NavlogRouteWaypoint[]) {
  return waypoints
    .map((waypoint) => waypoint.point.code || waypoint.point.name)
    .map(cleanCode)
    .filter(Boolean)
    .join(" ");
}

export function navlogLegsToCsv(legs: NavlogLeg[]) {
  const header = [
    "Leg",
    "From",
    "To",
    "Profile",
    "TC",
    "TH",
    "MH",
    "TAS",
    "GS",
    "Dist NM",
    "ETE",
    "Fuel L",
    "EFOB start",
    "EFOB end",
    "Wind",
    "Tracking",
  ];

  const rows = legs.map((leg) => [
    leg.i,
    leg.from.code,
    leg.to.code,
    leg.profile,
    leg.tc,
    leg.th,
    leg.mh,
    leg.tas,
    leg.gs,
    leg.distNm,
    formatDuration(leg.eteSec),
    leg.burnL,
    leg.efobStartL,
    leg.efobEndL,
    `${String(leg.windFrom).padStart(3, "0")}/${leg.windKt}`,
    leg.tracking.replaceAll("\\n", " "),
  ]);

  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\\n");
}

export function navlogSummary(legs: NavlogLeg[]) {
  return legs.reduce(
    (acc, leg) => {
      acc.timeSec += leg.eteSec + leg.holdSec;
      acc.distNm += leg.distNm;
      acc.burnL += leg.burnL + leg.holdBurnL;
      acc.finalEfob = leg.efobEndL;
      return acc;
    },
    {
      timeSec: 0,
      distNm: 0,
      burnL: 0,
      finalEfob: 0,
    }
  );
}
