import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  evaluatePerformanceLeg,
  type PerformanceLegInput,
} from "@/lib/performance/aerodrome-performance";
import {
  calculateP2006TPerformance,
  type P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import {
  calculateP2006TMission,
  DEFAULT_P2006T_FUEL_TIMES,
  massForRole,
} from "@/lib/performance/p2006t-mission";
import { getP2006TFleetAircraft } from "@/lib/performance/p2006t-fleet";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import { setP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import { buildP2006TPerformancePdfV2 } from "@/lib/pdf/p2006t-performance-pdf-v2";
import {
  calculateTecnamMb,
  type TecnamMbInput,
} from "@/lib/performance/mb";
import {
  calculateTecnamPerformance,
  type TecnamPerformanceRow,
} from "@/lib/performance/tecnam-performance";
import { defaultFuelPlanForAircraft } from "@/lib/performance/fuel-planning";
import { buildP2008PerformancePdfV2 } from "@/lib/pdf/p2008-performance-pdf-v2";

const P2006_FORM = "RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf";

function localResponse(bytes: Uint8Array, contentType: string) {
  const buffer = Uint8Array.from(bytes).buffer;
  return new Response(buffer, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

async function withLocalFetch<T>(action: () => Promise<T>) {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const value =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (value.startsWith("/api/p2006-form")) {
      return localResponse(
        await readFile(path.join(process.cwd(), P2006_FORM)),
        "application/pdf"
      );
    }
    if (value.startsWith("/p2006-performance-pages/")) {
      const relative = value.replace(/^\//, "");
      return localResponse(
        await readFile(path.join(process.cwd(), "public", relative)),
        relative.endsWith(".png") ? "image/png" : "text/plain; charset=utf-8"
      );
    }
    if (value.startsWith("/legacy/templates/")) {
      const relative = value.replace(/^\//, "");
      return localResponse(
        await readFile(path.join(process.cwd(), "public", relative)),
        "application/pdf"
      );
    }
    return nativeFetch(input, init);
  };

  try {
    return await action();
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

const LEGS: PerformanceLegInput[] = [
  { role: "Departure", icao: "LPSO", tempC: 15, qnhHpa: 1013, windFrom: 210, windKt: 8, forecastHourUtc: 9 },
  { role: "Arrival", icao: "LPEV", tempC: 18, qnhHpa: 1015, windFrom: 190, windKt: 7, forecastHourUtc: 10 },
  { role: "Alternate", icao: "LPBJ", tempC: 20, qnhHpa: 1012, windFrom: 180, windKt: 9, forecastHourUtc: 11 },
  { role: "Alternate 2", icao: "LPCB", tempC: 17, qnhHpa: 1014, windFrom: 160, windKt: 6, forecastHourUtc: 12 },
];

async function smokeP2006() {
  setP2006TPerformanceSettings({
    cruiseAltitudeFt: 3000,
    isaDeviationC: 0,
    cruiseRpm: 2100,
    cruisePowerPercent: 65,
  });
  const aircraft = getP2006TFleetAircraft("D-GSEV");
  const loading = {
    emptyMassKg: 879,
    emptyMomentKgm: 367,
    studentKg: 50,
    instructorKg: 80,
    rearSeatsKg: 0,
    baggageKg: 5,
    totalFuelInTanksL: 200,
  };
  const fuelTimes = {
    ...DEFAULT_P2006T_FUEL_TIMES,
    enrouteMin: 60,
    alternate1Min: 30,
    alternate2Min: 35,
  };
  const climb = p2006tClimbPerformance("D-GSEV", 1500, {
    weightKg: 1150,
    isaDeviationC: 0,
    cruiseRpm: 2100,
    cruisePowerPercent: 65,
  });
  const cruise = p2006tCruisePerformance("D-GSEV", 3000, {
    weightKg: 1150,
    isaDeviationC: 0,
    cruiseRpm: 2100,
    cruisePowerPercent: 65,
  });
  if (!climb || !cruise) throw new Error("P2006 climb/cruise data unavailable.");
  const mission = calculateP2006TMission({
    aircraft,
    loading,
    fuelTimes,
    rates: {
      climbLh: climb.fuelFlowLh,
      cruiseLh: cruise.fuelFlowLh,
      descentLh: cruise.fuelFlowLh,
    },
  });
  const calculated = await Promise.all(
    LEGS.map((leg) => {
      const evaluated = evaluatePerformanceLeg(leg);
      const weightKg = massForRole(mission, leg.role);
      return calculateP2006TPerformance({
        registration: "D-GSEV",
        result: evaluated,
        takeoffWeightKg: weightKg,
        landingWeightKg: weightKg,
        conditions: {
          surface: "paved",
          uphillSlopePct: Math.max(0, evaluated.bestRunway?.slope_pc ?? 0),
        },
      });
    })
  );
  const rows = calculated.filter(
    (result): result is P2006TPerformanceRow => result.ok
  );
  if (rows.length !== 4) throw new Error(`P2006 rows ${rows.length}/4.`);
  const bytes = await buildP2006TPerformancePdfV2({
    registration: "D-GSEV",
    date: "2026-07-18",
    loading,
    fuelTimes,
    mission,
    rows,
    cruiseTemperatureC: 9,
  });
  const pdf = await PDFDocument.load(bytes);
  const sizes = pdf.getPages().map((page) => page.getSize());
  if (pdf.getPageCount() !== 8) {
    throw new Error(`Expected 8 P2006 pages, got ${pdf.getPageCount()}.`);
  }
  if (sizes.slice(0, 2).some((size) => Math.abs(size.width - 595) > 2 || Math.abs(size.height - 842) > 2)) {
    throw new Error("P2006 official page size changed.");
  }
  if (sizes.slice(2).some((size) => Math.abs(size.width - 1191) > 2 || Math.abs(size.height - 842) > 2)) {
    throw new Error("P2006 grouped chart page size is invalid.");
  }
  return {
    rows: rows.length,
    pages: pdf.getPageCount(),
    bytes: bytes.length,
    massesKg: rows.map((row) => Math.round(row.takeoffWeightKg)),
    usableFuelL: Math.round(mission.fuel.usableLoadedL),
    tripFuelL: Math.round(mission.fuel.tripFuelL),
  };
}

async function smokeP2008() {
  const mbInput: TecnamMbInput = {
    emptyWeightKg: 435.75,
    emptyMomentKgM: 811.33,
    studentKg: 50,
    instructorKg: 80,
    pilotPassengerKg: 130,
    baggageKg: 5,
    fuelL: 120,
  };
  const mb = calculateTecnamMb(mbInput);
  const performanceResults = LEGS.map(evaluatePerformanceLeg);
  const rows = performanceResults
    .map((result) => calculateTecnamPerformance(result, mb.total.weightKg))
    .filter((row): row is TecnamPerformanceRow => Boolean(row));
  if (rows.length !== 4) throw new Error(`P2008 rows ${rows.length}/4.`);
  const fuelPlan = defaultFuelPlanForAircraft("Tecnam P2008", 120);
  const bytes = await buildP2008PerformancePdfV2({
    registration: "CS-DHS",
    date: "2026-07-18",
    mb,
    mbInput,
    fuelPlan,
    performanceResults,
    rows,
  });
  const pdf = await PDFDocument.load(bytes);
  if (pdf.getPageCount() < 1 || bytes.length < 100000) {
    throw new Error("P2008 PDF output is incomplete.");
  }
  return { rows: rows.length, pages: pdf.getPageCount(), bytes: bytes.length };
}

async function runSmokeTests() {
  return withLocalFetch(async () => {
    const p2006 = await smokeP2006();
    const p2008 = await smokeP2008();
    const summary = { p2006, p2008 };
    console.log("PERFORMANCE_PDF_V2_SMOKE_OK", JSON.stringify(summary));
    return summary;
  });
}

export default async function PerformancePdfV2SmokePage() {
  const summary = await runSmokeTests();
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Performance PDF v2 smoke test</h1>
      <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-zinc-950 p-4 text-xs text-white">
        {JSON.stringify(summary, null, 2)}
      </pre>
    </main>
  );
}
