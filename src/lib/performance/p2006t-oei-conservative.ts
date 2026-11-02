import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  getP2006TOeiSourcePage,
  getP2006TOeiTables,
  P2006T_OEI_ALTITUDES_FT,
  P2006T_OEI_TEMPERATURES_C,
} from "./p2006t-oei-table";

const STANDARD_DENSITY_KG_M3 = 1.225;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;

type P2006TOeiTemperature = (typeof P2006T_OEI_TEMPERATURES_C)[number];

export type P2006TOeiCalculation = {
  sourcePage: string;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
  isaDeviationC: number;
  vyseKias: number;
  tasKt: number;
  rocFpm: number;
  gradientPct: number;
  serviceCeilingFt: number;
  serviceCeilingLowerAltitudeFt: number;
  serviceCeilingUpperAltitudeFt: number;
  serviceCeilingLowerRocFpm: number;
  serviceCeilingUpperRocFpm: number;
  serviceCeilingExtrapolated: boolean;
  limitedToPublishedRange: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function conservativeCeiling(
  value: number,
  values: readonly number[],
  label: string
) {
  const maximum = values.at(-1);
  if (maximum === undefined || !Number.isFinite(value)) {
    throw new Error(`P2006T OEI ${label} is unavailable.`);
  }
  if (value > maximum) {
    throw new Error(
      `P2006T OEI ${label} ${Math.round(value)} is above the published table limit ${maximum}.`
    );
  }
  return values.find((candidate) => candidate >= value) ?? maximum;
}

function isaTemperatureC(pressureAltitudeFt: number) {
  return 15 - 1.9812 * (pressureAltitudeFt / 1000);
}

function approximateTasKt(kias: number, pressureAltitudeFt: number, oatC: number) {
  const altitudeM = clamp(pressureAltitudeFt * 0.3048, -500, 11000);
  const pressurePa =
    101325 * Math.pow(1 - (0.0065 * altitudeM) / 288.15, 5.255877);
  const temperatureK = Math.max(180, oatC + 273.15);
  const density = pressurePa / (287.05287 * temperatureK);
  return kias * Math.sqrt(STANDARD_DENSITY_KG_M3 / Math.max(0.2, density));
}

function conservativeCell(
  registration: P2006TRegistration,
  weightKg: number,
  pressureAltitudeFt: number,
  oatC: number
) {
  const tables = getP2006TOeiTables(registration);
  const selectedWeightKg = conservativeCeiling(
    weightKg,
    tables.map((table) => table.weightKg),
    "weight"
  );
  const selectedAltitudeFt = conservativeCeiling(
    pressureAltitudeFt,
    P2006T_OEI_ALTITUDES_FT,
    "pressure altitude"
  );
  const selectedTemperatureC = conservativeCeiling(
    oatC,
    P2006T_OEI_TEMPERATURES_C,
    "temperature"
  );
  const table = tables.find(
    (candidate) => candidate.weightKg === selectedWeightKg
  );
  const row = table?.rows.find(
    (candidate) => candidate.altitudeFt === selectedAltitudeFt
  );
  const temperatureIndex = P2006T_OEI_TEMPERATURES_C.indexOf(
    selectedTemperatureC as P2006TOeiTemperature
  );

  if (!table || !row || temperatureIndex < 0) {
    throw new Error("P2006T OEI conservative table cell is unavailable.");
  }

  return {
    selectedWeightKg,
    selectedAltitudeFt,
    selectedTemperatureC,
    vyseKias: row.vyseKias,
    rocFpm: row.ratesFpm[temperatureIndex],
  };
}

function conservativeServiceCeiling(
  registration: P2006TRegistration,
  weightKg: number,
  isaDeviationC: number
) {
  const tables = getP2006TOeiTables(registration);
  const selectedWeightKg = conservativeCeiling(
    weightKg,
    tables.map((table) => table.weightKg),
    "weight"
  );
  const table = tables.find(
    (candidate) => candidate.weightKg === selectedWeightKg
  );
  if (!table) throw new Error("P2006T OEI weight table is unavailable.");

  let selectedAltitudeFt = 0;
  let selectedRocFpm = 0;
  let selectedTemperatureC: P2006TOeiTemperature =
    P2006T_OEI_TEMPERATURES_C[0];
  let found = false;
  let limited = false;

  for (const row of table.rows) {
    const tableOatC = isaTemperatureC(row.altitudeFt) + isaDeviationC;
    const maximumTemperature = P2006T_OEI_TEMPERATURES_C.at(-1)!;
    if (tableOatC > maximumTemperature) {
      limited = true;
      break;
    }

    const temperatureC =
      P2006T_OEI_TEMPERATURES_C.find(
        (candidate) => candidate >= tableOatC
      ) ?? maximumTemperature;
    const temperatureIndex = P2006T_OEI_TEMPERATURES_C.indexOf(temperatureC);
    const rocFpm = row.ratesFpm[temperatureIndex];

    if (rocFpm < 50) break;

    selectedAltitudeFt = row.altitudeFt;
    selectedRocFpm = rocFpm;
    selectedTemperatureC = temperatureC;
    found = true;
  }

  if (!found) {
    const first = table.rows[0];
    if (first) {
      const tableOatC = isaTemperatureC(first.altitudeFt) + isaDeviationC;
      if (tableOatC <= P2006T_OEI_TEMPERATURES_C.at(-1)!) {
        selectedTemperatureC =
          P2006T_OEI_TEMPERATURES_C.find(
            (candidate) => candidate >= tableOatC
          ) ?? P2006T_OEI_TEMPERATURES_C.at(-1)!;
        const temperatureIndex =
          P2006T_OEI_TEMPERATURES_C.indexOf(selectedTemperatureC);
        selectedRocFpm = first.ratesFpm[temperatureIndex];
      } else {
        limited = true;
      }
    }
  }

  const lastPublishedAltitude = table.rows.at(-1)?.altitudeFt ?? 0;
  if (selectedAltitudeFt === lastPublishedAltitude && selectedRocFpm >= 50) {
    limited = true;
  }

  return {
    altitudeFt: selectedAltitudeFt,
    rocFpm: selectedRocFpm,
    limited,
  };
}

export function calculateP2006TOeiPerformance({
  registration,
  weightKg,
  pressureAltitudeFt,
  oatC,
}: {
  registration: P2006TRegistration;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
}): P2006TOeiCalculation {
  const point = conservativeCell(
    registration,
    weightKg,
    pressureAltitudeFt,
    oatC
  );
  const tasKt = approximateTasKt(
    point.vyseKias,
    point.selectedAltitudeFt,
    point.selectedTemperatureC
  );
  const gradientPct =
    (point.rocFpm / Math.max(1, tasKt * FEET_PER_MINUTE_PER_KNOT)) * 100;
  const isaDeviationC = oatC - isaTemperatureC(pressureAltitudeFt);
  const ceiling = conservativeServiceCeiling(
    registration,
    weightKg,
    isaDeviationC
  );

  return {
    sourcePage: `AFM ${getP2006TOeiSourcePage(registration)}`,
    weightKg: point.selectedWeightKg,
    pressureAltitudeFt: point.selectedAltitudeFt,
    oatC: point.selectedTemperatureC,
    isaDeviationC,
    vyseKias: point.vyseKias,
    tasKt,
    rocFpm: point.rocFpm,
    gradientPct,
    serviceCeilingFt: ceiling.altitudeFt,
    serviceCeilingLowerAltitudeFt: ceiling.altitudeFt,
    serviceCeilingUpperAltitudeFt: ceiling.altitudeFt,
    serviceCeilingLowerRocFpm: ceiling.rocFpm,
    serviceCeilingUpperRocFpm: ceiling.rocFpm,
    serviceCeilingExtrapolated: false,
    limitedToPublishedRange: ceiling.limited,
  };
}
