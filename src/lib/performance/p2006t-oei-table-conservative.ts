import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import type { P2006TOeiCalculation } from "./p2006t-oei-conservative";
import {
  getP2006TOeiTables,
  P2006T_OEI_ALTITUDES_FT,
  P2006T_OEI_TEMPERATURES_C,
  type P2006TOeiTraceCell,
} from "./p2006t-oei-table";

export * from "./p2006t-oei-table";

function isaTemperatureC(pressureAltitudeFt: number) {
  return 15 - 1.9812 * (pressureAltitudeFt / 1000);
}

function ceiling(value: number, values: readonly number[]) {
  return values.find((candidate) => candidate >= value) ?? values.at(-1) ?? 0;
}

function addCell(
  cells: P2006TOeiTraceCell[],
  registration: P2006TRegistration,
  weightKg: number,
  altitudeFt: number,
  temperatureC: number,
  purpose: P2006TOeiTraceCell["purpose"],
  includeVyse: boolean
) {
  const tables = getP2006TOeiTables(registration);
  const weightIndex = tables.findIndex((table) => table.weightKg === weightKg);
  const altitudeIndex = P2006T_OEI_ALTITUDES_FT.indexOf(
    altitudeFt as (typeof P2006T_OEI_ALTITUDES_FT)[number]
  );
  const temperatureIndex = P2006T_OEI_TEMPERATURES_C.indexOf(
    temperatureC as (typeof P2006T_OEI_TEMPERATURES_C)[number]
  );
  if (weightIndex < 0 || altitudeIndex < 0 || temperatureIndex < 0) return;

  const rowIndex = weightIndex * P2006T_OEI_ALTITUDES_FT.length + altitudeIndex;
  if (includeVyse) {
    cells.push({
      rowIndex,
      columnIndex: 0,
      weightKg,
      altitudeFt,
      purpose,
    });
  }
  cells.push({
    rowIndex,
    columnIndex: temperatureIndex + 1,
    weightKg,
    altitudeFt,
    purpose,
  });
}

export function getP2006TOeiTraceCells({
  registration,
  calculation,
}: {
  registration: P2006TRegistration;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
  calculation: P2006TOeiCalculation;
}) {
  const cells: P2006TOeiTraceCell[] = [];

  addCell(
    cells,
    registration,
    calculation.weightKg,
    calculation.pressureAltitudeFt,
    calculation.oatC,
    "gradient",
    true
  );

  const ceilingTemperature = ceiling(
    isaTemperatureC(calculation.serviceCeilingFt) + calculation.isaDeviationC,
    P2006T_OEI_TEMPERATURES_C
  );
  addCell(
    cells,
    registration,
    calculation.weightKg,
    calculation.serviceCeilingFt,
    ceilingTemperature,
    "ceiling",
    false
  );

  const unique = new Map<string, P2006TOeiTraceCell>();
  cells.forEach((cell) => {
    const key = `${cell.rowIndex}:${cell.columnIndex}:${cell.purpose}`;
    unique.set(key, cell);
  });
  return Array.from(unique.values());
}
