import type {
  PerformanceLegResult,
} from "@/lib/performance/aerodrome-performance";
import type { FuelPlanningInput } from "@/lib/performance/fuel-planning";
import type { TecnamMbInput, TecnamMbResult } from "@/lib/performance/mb";
import type { TecnamPerformanceRow } from "@/lib/performance/tecnam-performance";
import { buildPerformancePdf } from "./performance-template-pdf";

export type BuildP2008PerformancePdfV2Input = {
  registration: string;
  date: string;
  mb: TecnamMbResult;
  mbInput: TecnamMbInput;
  fuelPlan: FuelPlanningInput;
  performanceResults: PerformanceLegResult[];
  rows: TecnamPerformanceRow[];
};

export async function buildP2008PerformancePdfV2(
  input: BuildP2008PerformancePdfV2Input
) {
  return buildPerformancePdf({
    aircraft: "Tecnam P2008",
    registration: input.registration,
    mission: "",
    date: input.date,
    tecnam: input.mb,
    tecnamInput: input.mbInput,
    fuelPlan: input.fuelPlan,
    performanceResults: input.performanceResults.filter(
      (result) => result.leg.role !== "Alternate 2"
    ),
    pa28PerformanceRows: [],
    tecnamPerformanceRows: input.rows.filter(
      (row) => row.role !== "Alternate 2"
    ),
  });
}

export function downloadP2008PerformancePdfV2(
  bytes: Uint8Array,
  registration: string,
  date: string
) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `P2008_Performance_${registration}_${date}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
