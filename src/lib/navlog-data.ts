import type {
  NavlogAirway,
  NavlogDataBundle,
  NavlogPoint,
  NavlogPointSource,
  NavlogProcedure,
  NavlogVor,
} from "@/lib/navlog";

const DATA_BASE = "/legacy/data";

const LPFR_NAVLOG_POINTS: NavlogPoint[] = [
  { code: "FR611", name: "FR611", lat: 36.992278, lon: -7.815806, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID RWY10 ILS LOC RWY10", remarks: "LPFR RNAV SID/IAP waypoint AIRAC 005-26" },
  { code: "FR621", name: "FR621", lat: 37.068969, lon: -7.697489, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID RWY10", remarks: "LPFR RNAV SID waypoint AIRAC 005-26" },
  { code: "DEDUX", name: "DEDUX", lat: 37.411358, lon: -7.957933, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "XAPAS", name: "XAPAS", lat: 37.597228, lon: -7.949892, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "ODPAK", name: "ODPAK", lat: 38.128422, lon: -7.926689, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "DOGUT", name: "DOGUT", lat: 38.295256, lon: -7.924153, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "EVURA", name: "EVURA", lat: 38.664972, lon: -7.918492, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "FR631", name: "FR631", lat: 37.339767, lon: -8.087881, alt: 0, src: "IFR", routes: "LPFR EVURA1C STAR RWY10", remarks: "LPFR RNAV STAR waypoint AIRAC 005-26" },
  { code: "USALU", name: "USALU", lat: 37.222111, lon: -8.300347, alt: 0, src: "IFR", routes: "LPFR EVURA1C STAR RWY10", remarks: "LPFR RNAV STAR waypoint AIRAC 005-26" },
  { code: "KOPAV", name: "KOPAV", lat: 37.057094, lon: -8.269211, alt: 0, src: "IFR", routes: "LPFR EVURA1C STAR ILS LOC RWY10", remarks: "LPFR STAR/IAP clearance limit AIRAC 005-26" },
  { code: "FR910", name: "FR910", lat: 37.043778, lon: -8.174000, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10", remarks: "LPFR ILS/LOC RWY10 FAP waypoint AIRAC 005-26" },
  { code: "THR10", name: "THR RWY 10", lat: 37.017222, lon: -7.985611, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10", remarks: "LPFR RWY10 threshold / MAPt AIRAC 005-26" },
  { code: "FR728", name: "FR728", lat: 36.997000, lon: -7.842167, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10 MISSED APPROACH", remarks: "LPFR missed approach waypoint AIRAC 005-26" },
  { code: "GIMAL", name: "GIMAL", lat: 36.764444, lon: -8.005861, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10 MISSED APPROACH", remarks: "LPFR missed approach holding waypoint AIRAC 005-26" },
  { code: "FR609", name: "FR609", lat: 36.930906, lon: -8.346689, alt: 0, src: "IFR", routes: "LPFR GIMAL9C STAR ILS LOC RWY10", remarks: "LPFR RNAV STAR/IAP chart waypoint AIRAC 005-26" },
];

const LPFR_NAVLOG_CODES = new Set(
  LPFR_NAVLOG_POINTS.map((point) => cleanCode(point.code))
);

function mergeNavlogPointsPreferLpfr(points: NavlogPoint[]) {
  const bySourceAndCode = new Map<string, NavlogPoint>();

  for (const point of points) {
    const code = cleanCode(point.code);

    if (!code || code === "RUWIB") {
      continue;
    }

    bySourceAndCode.set(`${point.src}:${code}`, point);
  }

  for (const point of LPFR_NAVLOG_POINTS) {
    bySourceAndCode.set(`IFR:${cleanCode(point.code)}`, point);
  }

  return Array.from(bySourceAndCode.values());
}










function stripOuterQuotes(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function cleanCode(value: string) {
  return value.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase()
  );

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? "";
    });

    return row;
  });
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);

  return values;
}

function dmsTokenToDecimalDegrees(token: string, isLongitude: boolean) {
  const cleaned = token.trim().toUpperCase();
  const direction = cleaned.at(-1);

  if (!direction || !["N", "S", "E", "W"].includes(direction)) {
    return null;
  }

  const numeric = cleaned.slice(0, -1);
  const degreeDigits = isLongitude ? 3 : 2;

  if (numeric.length < degreeDigits + 2) {
    return null;
  }

  const degrees = Number(numeric.slice(0, degreeDigits));
  const minutes = Number(numeric.slice(degreeDigits, degreeDigits + 2));
  const seconds = Number(numeric.slice(degreeDigits + 2) || "0");

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  let decimal = degrees + minutes / 60 + seconds / 3600;

  if (direction === "S" || direction === "W") {
    decimal *= -1;
  }

  return decimal;
}

function parseAdHelUlm(text: string): NavlogPoint[] {
  const points: NavlogPoint[] = [];

  for (const rawLine of text.split(/\r?\n/g)) {
    const line = stripOuterQuotes(rawLine);

    if (!line || line.startsWith("Ident") || line.startsWith("DEP/")) {
      continue;
    }

    const tokens = line.split(/\s+/g);
    const coordTokens = tokens.filter((token) =>
      /^\d+(?:\.\d+)?[NSEW]$/i.test(token)
    );

    if (coordTokens.length < 2) continue;

    const latToken = coordTokens.at(-2);
    const lonToken = coordTokens.at(-1);

    if (!latToken || !lonToken) continue;

    const lat = dmsTokenToDecimalDegrees(latToken, false);
    const lon = dmsTokenToDecimalDegrees(lonToken, true);

    if (lat === null || lon === null) continue;

    const firstToken = tokens[0] ?? "";
    const ident = /^[A-Z0-9]{3,5}$/i.test(firstToken) ? firstToken : "";

    const firstCoordIndex = tokens.indexOf(coordTokens[0]);
    const name =
      firstCoordIndex > 1
        ? tokens.slice(1, firstCoordIndex).join(" ")
        : ident || tokens.slice(0, 3).join(" ");

    points.push({
      code: cleanCode(ident || name),
      name: name || ident,
      lat,
      lon,
      alt: 0,
      src: "AD",
      routes: "",
      remarks: "",
    });
  }

  return points;
}

function parseLocalidades(text: string): NavlogPoint[] {
  const points: NavlogPoint[] = [];

  for (const rawLine of text.split(/\r?\n/g)) {
    const line = stripOuterQuotes(rawLine);

    if (!line || line.includes("Total de registos")) continue;

    const tokens = line.split(/\s+/g);
    const coordTokens = tokens.filter((token) =>
      /^\d{6,7}(?:\.\d+)?[NSEW]$/i.test(token)
    );

    if (coordTokens.length < 2) continue;

    const latToken = coordTokens[0];
    const lonToken = coordTokens[1];

    const lat = dmsTokenToDecimalDegrees(latToken, false);
    const lon = dmsTokenToDecimalDegrees(lonToken, true);

    if (lat === null || lon === null) continue;

    const latIndex = tokens.indexOf(latToken);
    const lonIndex = tokens.indexOf(lonToken);

    const name = tokens.slice(0, latIndex).join(" ");
    const code = tokens[lonIndex + 1] ?? name;

    points.push({
      code: cleanCode(code || name),
      name: name || code,
      lat,
      lon,
      alt: 0,
      src: "VFR",
      routes: "",
      remarks: "",
    });
  }

  return points;
}

function parseVors(text: string): {
  vors: NavlogVor[];
  points: NavlogPoint[];
} {
  const rows = parseCsv(text);

  const vors = rows
    .map((row) => {
      const ident = cleanCode(row.ident ?? "");
      const freqMhz = Number(row.freq_mhz ?? row.freq ?? row.frequency);
      const lat = Number(row.lat ?? row.latitude);
      const lon = Number(row.lon ?? row.longitude);

      if (!ident || !Number.isFinite(freqMhz) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return {
        ident,
        name: row.name || ident,
        freqMhz,
        lat,
        lon,
      } satisfies NavlogVor;
    })
    .filter((item): item is NavlogVor => item !== null);

  const points = vors.map((vor) => ({
    code: vor.ident,
    name: vor.name,
    lat: vor.lat,
    lon: vor.lon,
    alt: 0,
    src: "VOR" as NavlogPointSource,
    routes: "",
    remarks: `${vor.freqMhz.toFixed(2)} MHz`,
  }));

  return { vors, points };
}

function parseIfrPoints(text: string): NavlogPoint[] {
  const rows = parseCsv(text);

  return rows
    .map((row) => {
      const code = cleanCode(row.code || row.ident || "");
      const lat = Number(row.lat);
      const lon = Number(row.lon);

      if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return {
        code,
        name: row.name || code,
        lat,
        lon,
        alt: Number(row.alt || 0),
        src: "IFR" as NavlogPointSource,
        routes: row.routes || "",
        remarks: row.remarks || "",
      } satisfies NavlogPoint;
    })
    .filter((item): item is NavlogPoint => item !== null);
}





function parseAirways(text: string): NavlogAirway[] {
  const rows = parseCsv(text);

  return rows
    .map((row) => {
      const airway = cleanCode(row.airway || "");
      const point = cleanCode(row.point || "");
      const seq = Number(row.seq);
      const lat = Number(row.lat);
      const lon = Number(row.lon);

      if (
        !airway ||
        !point ||
        !Number.isFinite(seq) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
      ) {
        return null;
      }

      return {
        airway,
        seq,
        point,
        lat,
        lon,
        routeType: row.route_type || "",
        lower: row.lower || "",
        upper: row.upper || "",
        mea: row.mea || "",
        remarks: row.remarks || "",
      } satisfies NavlogAirway;
    })
    .filter((item): item is NavlogAirway => item !== null)
    .sort((a, b) => {
      if (a.airway !== b.airway) return a.airway.localeCompare(b.airway);
      return a.seq - b.seq;
    });
}

function deduplicatePoints(points: NavlogPoint[]) {
  const bySourceAndCode = new Map<string, NavlogPoint>();

  for (const point of points) {
    const code = cleanCode(point.code);

    if (!code || code === "RUWIB") {
      continue;
    }

    bySourceAndCode.set(`${point.src}:${code}`, point);
  }

  for (const point of LPFR_NAVLOG_POINTS) {
    bySourceAndCode.set(`IFR:${cleanCode(point.code)}`, point);
  }

  return Array.from(bySourceAndCode.values());
}

function parseProcedures(raw: unknown): NavlogProcedure[] {
  if (!raw || typeof raw !== "object") return [];

  const maybeProcedures = (raw as { procedures?: unknown }).procedures;

  if (!Array.isArray(maybeProcedures)) return [];

  const procedures: NavlogProcedure[] = [];

  for (const procedure of maybeProcedures) {
    if (!procedure || typeof procedure !== "object") continue;

    const item = procedure as Record<string, unknown>;

    const id = String(item.id ?? "");
    const name = String(item.name ?? id);
    const kind = String(item.kind ?? "");

    if (!id || !kind) continue;

    procedures.push({
      id,
      name,
      kind,
      runway: item.runway ? String(item.runway) : undefined,
      transition: item.transition ? String(item.transition) : undefined,
    });
  }

  return procedures;
}

async function fetchText(path: string) {
  const response = await fetch(`${path}?v=airac-005-26-lpfr-2`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }

  return response.text();
}

async function fetchJson(path: string) {
  const response = await fetch(`${path}?v=airac-005-26-lpfr-2`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }

  return response.json() as Promise<unknown>;
}

export async function loadAllNavlogData(): Promise<NavlogDataBundle> {
  const [adText, localidadesText, vorText, ifrText, airwaysText, proceduresJson] =
    await Promise.all([
      fetchText(`${DATA_BASE}/AD-HEL-ULM.csv`),
      fetchText(`${DATA_BASE}/Localidades-Nova-versao-230223.csv`),
      fetchText(`${DATA_BASE}/NAVAIDS_VOR.csv`),
      fetchText(`${DATA_BASE}/IFR_POINTS.csv`),
      fetchText(`${DATA_BASE}/IFR_AIRWAYS.csv`),
      fetchJson(`${DATA_BASE}/procedures_lpso.json`),
    ]);

  const adPoints = parseAdHelUlm(adText);
  const vfrPoints = parseLocalidades(localidadesText);
  const { vors, points: vorPoints } = parseVors(vorText);
  const ifrPoints = mergeNavlogPointsPreferLpfr(parseIfrPoints(ifrText));
  const airways = parseAirways(airwaysText);
  const procedures = parseProcedures(proceduresJson);

  const points = deduplicatePoints([
    ...adPoints,
    ...vfrPoints,
    ...vorPoints,
    ...ifrPoints,
  ]);

  return {
    points,
    vors,
    airways,
    procedures,
  };
}
