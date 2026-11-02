import type { P2006TRegistration } from "./p2006t-fleet";
import {
  p2006tDistanceSources,
  type P2006TInterpolationTrace,
} from "./p2006t-performance";

const TEMPERATURES = [-25, 0, 25, 50] as const;
type Family = "takeoff" | "landing";
type Profile = "ground" | "50ft";
type Source = ReturnType<typeof p2006tDistanceSources>[number];
type Row = {
  altitudeFt: number;
  profile: Profile;
  valuesM: [number, number, number, number];
};
const cache = new Map<string, Promise<Row[]>>();

function maxWeight(registration: P2006TRegistration) {
  return registration === "CS-EAQ" ? 1180 : 1230;
}

function sourceWeight(registration: P2006TRegistration, source: Source) {
  return source.weightKg === "maximum" ? maxWeight(registration) : source.weightKg;
}

function ceiling(requested: number, values: readonly number[], label: string) {
  const ordered = [...values].sort((a, b) => a - b);
  const maximum = ordered.at(-1);
  if (maximum === undefined || !Number.isFinite(requested)) {
    throw new Error(`P2006T ${label} is unavailable.`);
  }
  if (requested > maximum) {
    throw new Error(
      `P2006T ${label} ${Math.round(requested)} is above the AFM table limit ${maximum}.`
    );
  }
  return ordered.find((value) => value >= requested) ?? maximum;
}

function metricValues(line: string) {
  const numbers = line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return numbers.filter((_, index) => index % 2 === 0).slice(0, 4);
}

function parseTable(text: string) {
  const rows: Row[] = [];
  let altitudeFt: number | null = null;
  for (const raw of text.replace(/\u00a0/g, " ").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^S\.L\.$/i.test(line)) altitudeFt = 0;
    else if (/^\d{3,5}$/.test(line)) altitudeFt = Number(line);
    else if (altitudeFt !== null && /Ground\s+Roll/i.test(line)) {
      const values = metricValues(line.replace(/.*Ground\s+Roll/i, ""));
      if (values.length === 4) {
        rows.push({ altitudeFt, profile: "ground", valuesM: values as Row["valuesM"] });
      }
    } else if (altitudeFt !== null && /At\s+50\s*ft\s+AGL/i.test(line)) {
      const values = metricValues(line.replace(/.*At\s+50\s*ft\s+AGL/i, ""));
      if (values.length === 4) {
        rows.push({ altitudeFt, profile: "50ft", valuesM: values as Row["valuesM"] });
      }
    }
  }
  if (rows.length < 20) throw new Error("P2006T AFM distance table could not be parsed.");
  return rows;
}

async function load(source: Source) {
  if (!cache.has(source.text)) {
    cache.set(
      source.text,
      fetch(source.text, { cache: "force-cache" }).then(async (response) => {
        if (!response.ok) throw new Error(`Could not load ${source.text}.`);
        return parseTable(await response.text());
      })
    );
  }
  return cache.get(source.text)!;
}

export async function conservativeP2006TDistance({
  registration,
  family,
  profile,
  weightKg,
  pressureAltitudeFt,
  oatC,
}: {
  registration: P2006TRegistration;
  family: Family;
  profile: Profile;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
}) {
  const sources = p2006tDistanceSources(registration, family);
  const selectedWeight = ceiling(
    weightKg,
    sources.map((source) => sourceWeight(registration, source)),
    "weight"
  );
  const source = sources.find(
    (candidate) => sourceWeight(registration, candidate) === selectedWeight
  );
  if (!source) throw new Error("P2006T conservative AFM page is unavailable.");

  const rows = (await load(source)).filter((row) => row.profile === profile);
  const selectedAltitude = ceiling(
    pressureAltitudeFt,
    rows.map((row) => row.altitudeFt),
    "pressure altitude"
  );
  const selectedTemperature = ceiling(oatC, TEMPERATURES, "temperature");
  const row = rows.find((candidate) => candidate.altitudeFt === selectedAltitude);
  const temperatureIndex = TEMPERATURES.indexOf(
    selectedTemperature as (typeof TEMPERATURES)[number]
  );
  if (!row || temperatureIndex < 0) {
    throw new Error("P2006T conservative AFM cell is unavailable.");
  }

  const trace: P2006TInterpolationTrace = {
    family,
    profile,
    requestedWeightKg: weightKg,
    requestedAltitudeFt: pressureAltitudeFt,
    requestedTemperatureC: oatC,
    lowerWeightKg: selectedWeight,
    upperWeightKg: selectedWeight,
    weightRatio: 0,
    lowerAltitudeFt: selectedAltitude,
    upperAltitudeFt: selectedAltitude,
    altitudeRatio: 0,
    lowerTemperatureC: selectedTemperature,
    upperTemperatureC: selectedTemperature,
    temperatureRatio: 0,
    sourcePages: [
      {
        weightKg: selectedWeight,
        image: source.image,
        text: source.text,
        printedPage: source.printedPage,
      },
    ],
  };

  return { distanceM: row.valuesM[temperatureIndex], trace };
}
