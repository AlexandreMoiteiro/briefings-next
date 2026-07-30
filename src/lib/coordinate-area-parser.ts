import type { AreaMapPoint } from "@/lib/area-map-saved-areas";

export type CoordinateParseResult = {
  points: AreaMapPoint[];
  warnings: string[];
  errors: string[];
};

type Candidate = {
  start: number;
  end: number;
  priority: number;
  lat: number;
  lon: number;
  raw: string;
  warnings: string[];
};

type Hemisphere = "N" | "S" | "E" | "W";

const VFR_BOUNDS = {
  south: 35.124950538548724,
  west: -10.25,
  north: 42.3125,
  east: -6.00004279020789,
} as const;

function applyHemisphere(value: number, hemisphere: Hemisphere) {
  return hemisphere === "S" || hemisphere === "W"
    ? -Math.abs(value)
    : Math.abs(value);
}

function validateCoordinate(lat: number, lon: number) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("Latitude outside the valid range (-90 to 90).");
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error("Longitude outside the valid range (-180 to 180).");
  }
}

function dmsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  hemisphere: Hemisphere
) {
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new Error("Minutes and seconds must be between 0 and 59.999.");
  }

  return applyHemisphere(
    degrees + minutes / 60 + seconds / 3600,
    hemisphere
  );
}

function parseCompact(
  rawDigits: string,
  hemisphere: Hemisphere,
  kind: "lat" | "lon"
) {
  let digits = rawDigits.replace(/\s+/g, "");
  const warnings: string[] = [];
  const degreeDigits = kind === "lat" ? 2 : 3;
  const dmLength = degreeDigits + 2;
  const dmsLength = degreeDigits + 4;

  // Preserve the old Area Map OCR recovery behaviour.
  if (kind === "lat" && digits.length === 5) {
    warnings.push(`${digits}${hemisphere} interpreted as 3${digits}${hemisphere}.`);
    digits = `3${digits}`;
  }

  if (kind === "lon" && digits.length === 6) {
    warnings.push(`${digits}${hemisphere} interpreted as 0${digits}${hemisphere}.`);
    digits = `0${digits}`;
  }

  if (digits.length !== dmLength && digits.length !== dmsLength) {
    throw new Error(
      `Invalid compact ${kind === "lat" ? "latitude" : "longitude"}.`
    );
  }

  const degrees = Number(digits.slice(0, degreeDigits));
  const minutes = Number(digits.slice(degreeDigits, degreeDigits + 2));
  const seconds =
    digits.length === dmsLength
      ? Number(digits.slice(degreeDigits + 2))
      : 0;
  const maximumDegrees = kind === "lat" ? 90 : 180;

  if (degrees > maximumDegrees) {
    throw new Error(
      `Invalid ${kind === "lat" ? "latitude" : "longitude"} degrees.`
    );
  }

  return {
    value: dmsToDecimal(degrees, minutes, seconds, hemisphere),
    warnings,
  };
}

function parseDirectionalToken(raw: string, kind: "lat" | "lon") {
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  const prefix = compact[0];
  const suffix = compact.at(-1) ?? "";
  const allowed = kind === "lat" ? ["N", "S"] : ["E", "W"];
  const hemisphere = allowed.includes(prefix)
    ? prefix
    : allowed.includes(suffix)
      ? suffix
      : "";

  if (!hemisphere) {
    throw new Error(`Missing hemisphere in directional ${kind} boundary.`);
  }

  const digits = compact.replace(/[NSEW]/g, "");
  return parseCompact(digits, hemisphere as Hemisphere, kind);
}

function parseDirectionalArea(input: string): CoordinateParseResult | null {
  const hasDirectionalQualifier = /\b[NSWE]\s+OF\b/i.test(input);
  if (!hasDirectionalQualifier) return null;

  const warnings: string[] = [];
  const errors: string[] = [];
  const matchedClauses: string[] = [];
  let north = VFR_BOUNDS.north;
  let south = VFR_BOUNDS.south;
  let east = VFR_BOUNDS.east;
  let west = VFR_BOUNDS.west;

  const latitudeRegex =
    /\b([NS])\s+OF\s+((?:[NS]\s*)?\d{4,6}(?:\s*[NS])?)\b/gi;
  const longitudeRegex =
    /\b([EW])\s+OF\s+((?:[EW]\s*)?\d{5,7}(?:\s*[EW])?)\b/gi;

  for (const match of input.matchAll(latitudeRegex)) {
    try {
      const areaSide = match[1].toUpperCase();
      const parsed = parseDirectionalToken(match[2], "lat");
      warnings.push(...parsed.warnings);
      matchedClauses.push(match[0].trim());

      if (areaSide === "S") {
        north = Math.min(north, parsed.value);
      } else {
        south = Math.max(south, parsed.value);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid latitude boundary.");
    }
  }

  for (const match of input.matchAll(longitudeRegex)) {
    try {
      const areaSide = match[1].toUpperCase();
      const parsed = parseDirectionalToken(match[2], "lon");
      warnings.push(...parsed.warnings);
      matchedClauses.push(match[0].trim());

      if (areaSide === "W") {
        east = Math.min(east, parsed.value);
      } else {
        west = Math.max(west, parsed.value);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid longitude boundary.");
    }
  }

  if (!matchedClauses.length) {
    return {
      points: [],
      warnings: [],
      errors: [
        "Directional qualifier found, but no valid boundary was recognised. Example: S OF N3845 AND W OF W00815.",
      ],
    };
  }

  if (north <= south || east <= west) {
    errors.push(
      "The directional limits do not create an area inside the VFR chart coverage."
    );
  }

  if (errors.length) {
    return { points: [], warnings: Array.from(new Set(warnings)), errors };
  }

  warnings.push(
    "Directional area clipped to the available Portugal VFR chart coverage."
  );

  const raw = matchedClauses.join(" AND ");
  const corners = [
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ];

  return {
    points: corners.map((point, index) => ({
      ...point,
      label: `P${index + 1}`,
      raw,
    })),
    warnings: Array.from(new Set(warnings)),
    errors: [],
  };
}

function addCandidate(
  candidates: Candidate[],
  input: string,
  match: RegExpMatchArray,
  priority: number,
  lat: number,
  lon: number,
  warnings: string[] = []
) {
  validateCoordinate(lat, lon);
  const start = match.index ?? 0;

  candidates.push({
    start,
    end: start + match[0].length,
    priority,
    lat,
    lon,
    raw: input.slice(start, start + match[0].length).trim(),
    warnings,
  });
}

function collectCompactSuffix(input: string, candidates: Candidate[]) {
  const regex = /(\d{4,6})\s*([NS])\s*[,;\/\-–—\s]*\s*(\d{5,7})\s*([EW])/gi;

  for (const match of input.matchAll(regex)) {
    try {
      const lat = parseCompact(
        match[1],
        match[2].toUpperCase() as Hemisphere,
        "lat"
      );
      const lon = parseCompact(
        match[3],
        match[4].toUpperCase() as Hemisphere,
        "lon"
      );
      addCandidate(candidates, input, match, 10, lat.value, lon.value, [
        ...lat.warnings,
        ...lon.warnings,
      ]);
    } catch {
      // A broader matcher may still recognise the same text.
    }
  }
}

function collectCompactPrefix(input: string, candidates: Candidate[]) {
  const regex = /([NS])\s*(\d{4,6})\s*[,;\/\-–—\s]*\s*([EW])\s*(\d{5,7})/gi;

  for (const match of input.matchAll(regex)) {
    try {
      const lat = parseCompact(
        match[2],
        match[1].toUpperCase() as Hemisphere,
        "lat"
      );
      const lon = parseCompact(
        match[4],
        match[3].toUpperCase() as Hemisphere,
        "lon"
      );
      addCandidate(candidates, input, match, 10, lat.value, lon.value, [
        ...lat.warnings,
        ...lon.warnings,
      ]);
    } catch {
      // A broader matcher may still recognise the same text.
    }
  }
}

function collectSymbolicSuffix(input: string, candidates: Candidate[]) {
  const regex = /(\d{1,2}(?:\.\d+)?)\s*(?:°|DEG|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:(?:['′:]|MIN|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|SEC)?)?\s*([NS])\s*[,;\/\-–—\s]+\s*(\d{1,3}(?:\.\d+)?)\s*(?:°|DEG|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:(?:['′:]|MIN|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|SEC)?)?\s*([EW])/gi;

  for (const match of input.matchAll(regex)) {
    try {
      const lat = dmsToDecimal(
        Number(match[1]),
        Number(match[2]),
        Number(match[3] ?? 0),
        match[4].toUpperCase() as Hemisphere
      );
      const lon = dmsToDecimal(
        Number(match[5]),
        Number(match[6]),
        Number(match[7] ?? 0),
        match[8].toUpperCase() as Hemisphere
      );
      addCandidate(candidates, input, match, 20, lat, lon);
    } catch {
      // Ignore malformed pairs and report a generic message if nothing parses.
    }
  }
}

function collectSymbolicPrefix(input: string, candidates: Candidate[]) {
  const regex = /([NS])\s*(\d{1,2}(?:\.\d+)?)\s*(?:°|DEG|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:(?:['′:]|MIN|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|SEC)?)?\s*[,;\/\-–—\s]+\s*([EW])\s*(\d{1,3}(?:\.\d+)?)\s*(?:°|DEG|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:(?:['′:]|MIN|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|SEC)?)?/gi;

  for (const match of input.matchAll(regex)) {
    try {
      const lat = dmsToDecimal(
        Number(match[2]),
        Number(match[3]),
        Number(match[4] ?? 0),
        match[1].toUpperCase() as Hemisphere
      );
      const lon = dmsToDecimal(
        Number(match[6]),
        Number(match[7]),
        Number(match[8] ?? 0),
        match[5].toUpperCase() as Hemisphere
      );
      addCandidate(candidates, input, match, 20, lat, lon);
    } catch {
      // Ignore malformed pairs and report a generic message if nothing parses.
    }
  }
}

function collectDecimalHemisphereSuffix(
  input: string,
  candidates: Candidate[]
) {
  const regex = /(\d{1,2}(?:\.\d+))\s*([NS])\s*[,;\/\-–—\s]+\s*(\d{1,3}(?:\.\d+))\s*([EW])/gi;

  for (const match of input.matchAll(regex)) {
    try {
      const lat = applyHemisphere(
        Number(match[1]),
        match[2].toUpperCase() as Hemisphere
      );
      const lon = applyHemisphere(
        Number(match[3]),
        match[4].toUpperCase() as Hemisphere
      );
      addCandidate(candidates, input, match, 30, lat, lon);
    } catch {
      // Ignore malformed pairs.
    }
  }
}

function collectDecimalHemispherePrefix(
  input: string,
  candidates: Candidate[]
) {
  const regex = /([NS])\s*(\d{1,2}(?:\.\d+))\s*[,;\/\-–—\s]+\s*([EW])\s*(\d{1,3}(?:\.\d+))/gi;

  for (const match of input.matchAll(regex)) {
    try {
      const lat = applyHemisphere(
        Number(match[2]),
        match[1].toUpperCase() as Hemisphere
      );
      const lon = applyHemisphere(
        Number(match[4]),
        match[3].toUpperCase() as Hemisphere
      );
      addCandidate(candidates, input, match, 30, lat, lon);
    } catch {
      // Ignore malformed pairs.
    }
  }
}

function collectSignedDecimal(input: string, candidates: Candidate[]) {
  const regex = /(?<![\d.])([+-]?\d{1,2}(?:\.\d+))\s*[,;]\s*([+-]?\d{1,3}(?:\.\d+))(?![\d.])/g;

  for (const match of input.matchAll(regex)) {
    try {
      addCandidate(
        candidates,
        input,
        match,
        40,
        Number(match[1]),
        Number(match[2])
      );
    } catch {
      // Ignore malformed pairs.
    }
  }
}

function overlaps(a: Candidate, b: Candidate) {
  return a.start < b.end && b.start < a.end;
}

function selectCandidates(candidates: Candidate[]) {
  const selected: Candidate[] = [];
  const ordered = [...candidates].sort(
    (a, b) =>
      a.start - b.start ||
      a.priority - b.priority ||
      b.end - b.start - (a.end - a.start)
  );

  for (const candidate of ordered) {
    const conflicts = selected.filter((existing) =>
      overlaps(existing, candidate)
    );

    if (!conflicts.length) {
      selected.push(candidate);
      continue;
    }

    const bestConflict = conflicts.sort(
      (a, b) =>
        a.priority - b.priority ||
        b.end - b.start - (a.end - a.start)
    )[0];

    if (
      candidate.priority < bestConflict.priority ||
      (candidate.priority === bestConflict.priority &&
        candidate.end - candidate.start >
          bestConflict.end - bestConflict.start)
    ) {
      selected.splice(selected.indexOf(bestConflict), 1, candidate);
    }
  }

  return selected.sort((a, b) => a.start - b.start);
}

export function parseCoordinateAreaInput(
  input: string
): CoordinateParseResult {
  const directional = parseDirectionalArea(input);
  if (directional) return directional;

  const candidates: Candidate[] = [];
  const errors: string[] = [];

  collectCompactSuffix(input, candidates);
  collectCompactPrefix(input, candidates);
  collectSymbolicSuffix(input, candidates);
  collectSymbolicPrefix(input, candidates);
  collectDecimalHemisphereSuffix(input, candidates);
  collectDecimalHemispherePrefix(input, candidates);
  collectSignedDecimal(input, candidates);

  const selected = selectCandidates(candidates);
  const warnings = Array.from(
    new Set(selected.flatMap((candidate) => candidate.warnings))
  );
  const points = selected.map((candidate, index) => ({
    lat: candidate.lat,
    lon: candidate.lon,
    label: `P${index + 1}`,
    raw: candidate.raw,
  }));

  if (!points.length && input.trim()) {
    errors.push(
      "No valid coordinates found. Supported examples: 384221N 0090058W, 3842N 00900W, N3842 W00900, S OF N3845 AND W OF W00815, 38°42′21″N 009°00′58″W, or 38.703, -9.016."
    );
  }

  return { points, warnings, errors };
}
