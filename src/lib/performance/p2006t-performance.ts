import type {
  PerformanceLegResult,
  PerformanceLegRole,
} from "@/lib/performance/aerodrome-performance";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

export type P2006TRunwayConditions = {
  surface: "paved";
  uphillSlopePct: number;
};

export type P2006TDistanceKind =
  | "takeoff-ground-roll"
  | "takeoff-50ft"
  | "landing-ground-roll"
  | "landing-50ft";

type DistanceSource = {
  image: string;
  text: string;
  printedPage: string;
  weightKg: number | "maximum";
};

type DistanceFamily = "takeoff" | "landing";

type DistanceTableRow = {
  altitudeFt: number;
  profile: "ground" | "50ft";
  valuesM: [number, number, number, number];
};

type LoadedDistanceTable = {
  source: DistanceSource;
  weightKg: number;
  rows: DistanceTableRow[];
};

export type P2006TInterpolationTrace = {
  family: DistanceFamily;
  profile: "ground" | "50ft";
  requestedWeightKg: number;
  requestedAltitudeFt: number;
  requestedTemperatureC: number;
  lowerWeightKg: number;
  upperWeightKg: number;
  weightRatio: number;
  lowerAltitudeFt: number;
  upperAltitudeFt: number;
  altitudeRatio: number;
  lowerTemperatureC: number;
  upperTemperatureC: number;
  temperatureRatio: number;
  sourcePages: Array<{
    weightKg: number;
    image: string;
    text: string;
    printedPage: string;
  }>;
};

export type P2006TPerformanceRow = {
  ok: true;
  role: PerformanceLegRole;
  icao: string;
  aerodrome: string;
  runway: string;
  qfu: number;
  elevationFt: number;
  paFt: number;
  daFt: number;
  oatC: number;
  qnhHpa: number;
  windFrom: number;
  windKt: number;
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | "";
  todaM: number;
  ldaM: number;
  uphillSlopePct: number;
  takeoffWeightKg: number;
  landingWeightKg: number;
  takeoffGroundRollM: number;
  takeoff50M: number;
  landingGroundRollM: number;
  landing50M: number;
  takeoffMarginM: number;
  landingMarginM: number;
  takeoffPct: number;
  landingPct: number;
  takeoffOk: boolean;
  landingOk: boolean;
  rocFpm: number;
  takeoffTrace: P2006TInterpolationTrace;
  landingTrace: P2006TInterpolationTrace;
};

export type P2006TPerformanceFailure = {
  ok: false;
  role: PerformanceLegRole;
  icao: string;
  reason: string;
};

export type P2006TPerformanceResult =
  | P2006TPerformanceRow
  | P2006TPerformanceFailure;

const TEMPERATURES = [-25, 0, 25, 50] as const;
const tableCache = new Map<string, Promise<LoadedDistanceTable>>();

const SOURCE_PAGES: Record<
  P2006TRegistration,
  Record<DistanceFamily, DistanceSource[]>
> = {
  "CS-EAQ": {
    takeoff: [
      {
        image: "/p2006-performance-pages/CS-EAQ/page-171.png",
        text: "/p2006-performance-pages/CS-EAQ/page-171.txt",
        printedPage: "5-7",
        weightKg: "maximum",
      },
      {
        image: "/p2006-performance-pages/CS-EAQ/page-172.png",
        text: "/p2006-performance-pages/CS-EAQ/page-172.txt",
        printedPage: "5-8",
        weightKg: 1080,
      },
      {
        image: "/p2006-performance-pages/CS-EAQ/page-173.png",
        text: "/p2006-performance-pages/CS-EAQ/page-173.txt",
        printedPage: "5-9",
        weightKg: 930,
      },
    ],
    landing: [
      {
        image: "/p2006-performance-pages/CS-EAQ/page-183.png",
        text: "/p2006-performance-pages/CS-EAQ/page-183.txt",
        printedPage: "5-19",
        weightKg: "maximum",
      },
      {
        image: "/p2006-performance-pages/CS-EAQ/page-184.png",
        text: "/p2006-performance-pages/CS-EAQ/page-184.txt",
        printedPage: "5-20",
        weightKg: 1080,
      },
      {
        image: "/p2006-performance-pages/CS-EAQ/page-185.png",
        text: "/p2006-performance-pages/CS-EAQ/page-185.txt",
        printedPage: "5-21",
        weightKg: 930,
      },
    ],
  },
  "CS-EBX": {
    takeoff: [
      {
        image: "/p2006-performance-pages/CS-EBX/page-171.png",
        text: "/p2006-performance-pages/CS-EBX/page-171.txt",
        printedPage: "5-7",
        weightKg: "maximum",
      },
      {
        image: "/p2006-performance-pages/CS-EBX/page-172.png",
        text: "/p2006-performance-pages/CS-EBX/page-172.txt",
        printedPage: "5-8",
        weightKg: 1080,
      },
      {
        image: "/p2006-performance-pages/CS-EBX/page-173.png",
        text: "/p2006-performance-pages/CS-EBX/page-173.txt",
        printedPage: "5-9",
        weightKg: 930,
      },
    ],
    landing: [
      {
        image: "/p2006-performance-pages/CS-EBX/page-183.png",
        text: "/p2006-performance-pages/CS-EBX/page-183.txt",
        printedPage: "5-19",
        weightKg: "maximum",
      },
      {
        image: "/p2006-performance-pages/CS-EBX/page-184.png",
        text: "/p2006-performance-pages/CS-EBX/page-184.txt",
        printedPage: "5-20",
        weightKg: 1080,
      },
      {
        image: "/p2006-performance-pages/CS-EBX/page-185.png",
        text: "/p2006-performance-pages/CS-EBX/page-185.txt",
        printedPage: "5-21",
        weightKg: 930,
      },
    ],
  },
  "D-GSEV": {
    takeoff: [
      {
        image: "/p2006-performance-pages/D-GSEV/page-169.png",
        text: "/p2006-performance-pages/D-GSEV/page-169.txt",
        printedPage: "5-7",
        weightKg: "maximum",
      },
      {
        image: "/p2006-performance-pages/D-GSEV/page-170.png",
        text: "/p2006-performance-pages/D-GSEV/page-170.txt",
        printedPage: "5-8",
        weightKg: 1080,
      },
      {
        image: "/p2006-performance-pages/D-GSEV/page-171.png",
        text: "/p2006-performance-pages/D-GSEV/page-171.txt",
        printedPage: "5-9",
        weightKg: 930,
      },
    ],
    landing: [
      {
        image: "/p2006-performance-pages/D-GSEV/page-181.png",
        text: "/p2006-performance-pages/D-GSEV/page-181.txt",
        printedPage: "5-19",
        weightKg: "maximum",
      },
      {
        image: "/p2006-performance-pages/D-GSEV/page-182.png",
        text: "/p2006-performance-pages/D-GSEV/page-182.txt",
        printedPage: "5-20",
        weightKg: 1080,
      },
      {
        image: "/p2006-performance-pages/D-GSEV/page-183.png",
        text: "/p2006-performance-pages/D-GSEV/page-183.txt",
        printedPage: "5-21",
        weightKg: 930,
      },
    ],
  },
};

function maxWeight(registration: P2006TRegistration) {
  return registration === "CS-EAQ" ? 1180 : 1230;
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function bracket(value: number, values: readonly number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const limited = clamp(value, ordered[0], ordered[ordered.length - 1]);

  let lower = ordered[0];
  let upper = ordered[ordered.length - 1];

  for (const candidate of ordered) {
    if (candidate <= limited) lower = candidate;
    if (candidate >= limited) {
      upper = candidate;
      break;
    }
  }

  return {
    requested: value,
    limited,
    lower,
    upper,
    ratio: upper === lower ? 0 : (limited - lower) / (upper - lower),
  };
}

function metricValues(line: string) {
  const values = line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const metric: number[] = [];

  for (let index = 0; index < values.length; index += 2) {
    metric.push(values[index]);
  }

  return metric.slice(0, 5);
}

function parseDistanceTable(text: string): DistanceTableRow[] {
  const rows: DistanceTableRow[] = [];
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/);
  let altitudeFt: number | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^S\.L\.$/i.test(line)) {
      altitudeFt = 0;
      continue;
    }

    if (/^\d{3,5}$/.test(line)) {
      altitudeFt = Number(line);
      continue;
    }

    if (altitudeFt === null) continue;

    if (/Ground\s+Roll/i.test(line)) {
      const values = metricValues(line.replace(/.*Ground\s+Roll/i, ""));
      if (values.length >= 4) {
        rows.push({
          altitudeFt,
          profile: "ground",
          valuesM: values.slice(0, 4) as [number, number, number, number],
        });
      }
      continue;
    }

    if (/At\s+50\s*ft\s+AGL/i.test(line)) {
      const values = metricValues(line.replace(/.*At\s+50\s*ft\s+AGL/i, ""));
      if (values.length >= 4) {
        rows.push({
          altitudeFt,
          profile: "50ft",
          valuesM: values.slice(0, 4) as [number, number, number, number],
        });
      }
    }
  }

  return rows;
}

async function loadDistanceTable(
  registration: P2006TRegistration,
  source: DistanceSource
) {
  const weightKg =
    source.weightKg === "maximum" ? maxWeight(registration) : source.weightKg;
  const cacheKey = `${registration}:${source.text}`;

  if (!tableCache.has(cacheKey)) {
    tableCache.set(
      cacheKey,
      fetch(source.text, { cache: "force-cache" }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load P2006T table ${source.text}.`);
        }

        const rows = parseDistanceTable(await response.text());

        if (rows.length < 20) {
          throw new Error(`P2006T table ${source.text} could not be parsed.`);
        }

        return { source, weightKg, rows };
      })
    );
  }

  return tableCache.get(cacheKey)!;
}

function interpolateTable(
  table: LoadedDistanceTable,
  profile: "ground" | "50ft",
  altitudeFt: number,
  temperatureC: number
) {
  const rows = table.rows
    .filter((row) => row.profile === profile)
    .sort((a, b) => a.altitudeFt - b.altitudeFt);
  const altitudeBracket = bracket(
    altitudeFt,
    rows.map((row) => row.altitudeFt)
  );
  const temperatureBracket = bracket(temperatureC, TEMPERATURES);
  const lowerRow = rows.find(
    (row) => row.altitudeFt === altitudeBracket.lower
  );
  const upperRow = rows.find(
    (row) => row.altitudeFt === altitudeBracket.upper
  );

  if (!lowerRow || !upperRow) {
    throw new Error("P2006T table altitude row is unavailable.");
  }

  const lowerTempIndex = TEMPERATURES.indexOf(
    temperatureBracket.lower as (typeof TEMPERATURES)[number]
  );
  const upperTempIndex = TEMPERATURES.indexOf(
    temperatureBracket.upper as (typeof TEMPERATURES)[number]
  );

  const atLowerAltitude = lerp(
    lowerRow.valuesM[lowerTempIndex],
    lowerRow.valuesM[upperTempIndex],
    temperatureBracket.ratio
  );
  const atUpperAltitude = lerp(
    upperRow.valuesM[lowerTempIndex],
    upperRow.valuesM[upperTempIndex],
    temperatureBracket.ratio
  );

  return {
    distanceM: lerp(
      atLowerAltitude,
      atUpperAltitude,
      altitudeBracket.ratio
    ),
    altitudeBracket,
    temperatureBracket,
  };
}

async function calculateBaseDistance({
  registration,
  family,
  profile,
  weightKg,
  altitudeFt,
  temperatureC,
}: {
  registration: P2006TRegistration;
  family: DistanceFamily;
  profile: "ground" | "50ft";
  weightKg: number;
  altitudeFt: number;
  temperatureC: number;
}) {
  const sources = SOURCE_PAGES[registration][family];
  const loaded = await Promise.all(
    sources.map((source) => loadDistanceTable(registration, source))
  );
  const weightBracket = bracket(
    weightKg,
    loaded.map((table) => table.weightKg)
  );
  const lowerTable = loaded.find(
    (table) => table.weightKg === weightBracket.lower
  );
  const upperTable = loaded.find(
    (table) => table.weightKg === weightBracket.upper
  );

  if (!lowerTable || !upperTable) {
    throw new Error("P2006T weight table is unavailable.");
  }

  const lower = interpolateTable(
    lowerTable,
    profile,
    altitudeFt,
    temperatureC
  );
  const upper = interpolateTable(
    upperTable,
    profile,
    altitudeFt,
    temperatureC
  );

  return {
    distanceM: lerp(lower.distanceM, upper.distanceM, weightBracket.ratio),
    trace: {
      family,
      profile,
      requestedWeightKg: weightKg,
      requestedAltitudeFt: altitudeFt,
      requestedTemperatureC: temperatureC,
      lowerWeightKg: weightBracket.lower,
      upperWeightKg: weightBracket.upper,
      weightRatio: weightBracket.ratio,
      lowerAltitudeFt: lower.altitudeBracket.lower,
      upperAltitudeFt: lower.altitudeBracket.upper,
      altitudeRatio: lower.altitudeBracket.ratio,
      lowerTemperatureC: lower.temperatureBracket.lower,
      upperTemperatureC: lower.temperatureBracket.upper,
      temperatureRatio: lower.temperatureBracket.ratio,
      sourcePages: Array.from(
        new Map(
          [lowerTable, upperTable].map((table) => [
            table.weightKg,
            {
              weightKg: table.weightKg,
              image: table.source.image,
              text: table.source.text,
              printedPage: table.source.printedPage,
            },
          ])
        ).values()
      ),
    } satisfies P2006TInterpolationTrace,
  };
}

function applyTakeoffWind(distanceM: number, headwindKt: number) {
  return Math.max(
    0,
    headwindKt >= 0
      ? distanceM - 2.5 * headwindKt
      : distanceM + 10 * Math.abs(headwindKt)
  );
}

function applyLandingWind(distanceM: number, headwindKt: number) {
  return Math.max(
    0,
    headwindKt >= 0
      ? distanceM - 5 * headwindKt
      : distanceM + 11 * Math.abs(headwindKt)
  );
}

function applyTakeoffGroundCorrections(
  distanceM: number,
  conditions: P2006TRunwayConditions
) {
  const slope = clamp(conditions.uphillSlopePct, 0, 5);
  return Math.max(0, distanceM * 0.94 * (1 + 0.05 * slope));
}

function applyLandingGroundCorrections(
  distanceM: number,
  conditions: P2006TRunwayConditions
) {
  const slope = clamp(conditions.uphillSlopePct, 0, 5);
  return Math.max(0, distanceM * 0.98 * (1 - 0.025 * slope));
}

export async function calculateP2006TPerformance({
  registration,
  result,
  takeoffWeightKg,
  landingWeightKg,
  conditions,
}: {
  registration: P2006TRegistration;
  result: PerformanceLegResult;
  takeoffWeightKg: number;
  landingWeightKg: number;
  conditions: P2006TRunwayConditions;
}): Promise<P2006TPerformanceResult> {
  const role = result.leg.role;
  const icao = result.leg.icao;

  if (!result.aerodrome || !result.bestRunway) {
    return {
      ok: false,
      role,
      icao,
      reason: "Aerodrome or runway data is unavailable.",
    };
  }

  try {
    const [takeoffGround, takeoff50, landingGround, landing50] =
      await Promise.all([
        calculateBaseDistance({
          registration,
          family: "takeoff",
          profile: "ground",
          weightKg: takeoffWeightKg,
          altitudeFt: result.pressureAltitudeFt,
          temperatureC: result.leg.tempC,
        }),
        calculateBaseDistance({
          registration,
          family: "takeoff",
          profile: "50ft",
          weightKg: takeoffWeightKg,
          altitudeFt: result.pressureAltitudeFt,
          temperatureC: result.leg.tempC,
        }),
        calculateBaseDistance({
          registration,
          family: "landing",
          profile: "ground",
          weightKg: landingWeightKg,
          altitudeFt: result.pressureAltitudeFt,
          temperatureC: result.leg.tempC,
        }),
        calculateBaseDistance({
          registration,
          family: "landing",
          profile: "50ft",
          weightKg: landingWeightKg,
          altitudeFt: result.pressureAltitudeFt,
          temperatureC: result.leg.tempC,
        }),
      ]);

    const takeoffGroundCorrected = applyTakeoffGroundCorrections(
      applyTakeoffWind(takeoffGround.distanceM, result.headwindKt),
      conditions
    );
    const takeoff50Corrected = applyTakeoffWind(
      takeoff50.distanceM,
      result.headwindKt
    );
    const landingGroundCorrected = applyLandingGroundCorrections(
      applyLandingWind(landingGround.distanceM, result.headwindKt),
      conditions
    );
    const landing50Corrected = applyLandingWind(
      landing50.distanceM,
      result.headwindKt
    );
    const runway = result.bestRunway;
    const takeoffMarginM = runway.toda - takeoff50Corrected;
    const landingMarginM = runway.lda - landing50Corrected;

    return {
      ok: true,
      role,
      icao,
      aerodrome: result.aerodrome.name,
      runway: runway.id,
      qfu: runway.qfu,
      elevationFt: result.aerodrome.elev_ft,
      paFt: result.pressureAltitudeFt,
      daFt: result.densityAltitudeFt,
      oatC: result.leg.tempC,
      qnhHpa: result.leg.qnhHpa,
      windFrom: result.leg.windFrom,
      windKt: result.leg.windKt,
      headwindKt: result.headwindKt,
      crosswindKt: result.crosswindKt,
      crosswindSide: result.crosswindSide,
      todaM: runway.toda,
      ldaM: runway.lda,
      uphillSlopePct: clamp(conditions.uphillSlopePct, 0, 5),
      takeoffWeightKg,
      landingWeightKg,
      takeoffGroundRollM: round(takeoffGroundCorrected),
      takeoff50M: round(takeoff50Corrected),
      landingGroundRollM: round(landingGroundCorrected),
      landing50M: round(landing50Corrected),
      takeoffMarginM: round(takeoffMarginM),
      landingMarginM: round(landingMarginM),
      takeoffPct:
        runway.toda > 0 ? round((takeoff50Corrected / runway.toda) * 100) : 0,
      landingPct:
        runway.lda > 0 ? round((landing50Corrected / runway.lda) * 100) : 0,
      takeoffOk: takeoff50Corrected <= runway.toda,
      landingOk: landing50Corrected <= runway.lda,
      rocFpm: 850,
      takeoffTrace: takeoff50.trace,
      landingTrace: landing50.trace,
    };
  } catch (error) {
    return {
      ok: false,
      role,
      icao,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function p2006tDistanceSources(
  registration: P2006TRegistration,
  family: DistanceFamily
) {
  return SOURCE_PAGES[registration][family];
}
