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
import {
  buildP2006TPerformancePdfV3,
  DEFAULT_P2006T_PDF_OPTIONS,
} from "@/lib/pdf/p2006t-performance-pdf-v3";

const FORM = "RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf";

function localResponse(bytes: Uint8Array, contentType: string) {
  return new Response(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

async function runSmokeTest() {
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
        await readFile(path.join(process.cwd(), FORM)),
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
    return nativeFetch(input, init);
  };

  try {
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
    const climb = p2006tClimbPerformance("D-GSEV", 3000, {
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
    if (!climb || !cruise) throw new Error("AFM data unavailable.");

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
    const legs: PerformanceLegInput[] = [
      { role: "Departure", icao: "LPSO", tempC: 15, qnhHpa: 1013, windFrom: 210, windKt: 8 },
      { role: "Arrival", icao: "LPSO", tempC: 15, qnhHpa: 1013, windFrom: 210, windKt: 8 },
      { role: "Alternate", icao: "LPEV", tempC: 15, qnhHpa: 1013, windFrom: 190, windKt: 7 },
      { role: "Alternate 2", icao: "LPCB", tempC: 15, qnhHpa: 1013, windFrom: 160, windKt: 6 },
    ];
    const calculated = await Promise.all(
      legs.map((leg) => {
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
    if (rows.length !== 4) throw new Error(`Expected 4 rows, got ${rows.length}.`);

    const bytes = await buildP2006TPerformancePdfV3({
      registration: "D-GSEV",
      date: "2026-07-20",
      loading,
      fuelTimes,
      mission,
      rows,
      cruiseTemperatureC: 9,
      options: DEFAULT_P2006T_PDF_OPTIONS,
    });
    const pdf = await PDFDocument.load(bytes);
    if (pdf.getPageCount() !== 8) {
      throw new Error(`Expected 8 pages, got ${pdf.getPageCount()}.`);
    }
    const sizes = pdf.getPages().map((page) => page.getSize());
    const aerodromePages = sizes.filter(
      ({ width, height }) => Math.round(width) === 842 && Math.round(height) === 1191
    ).length;
    if (aerodromePages !== 4) {
      throw new Error(`Expected 4 A3 portrait aerodrome pages, got ${aerodromePages}.`);
    }
    return { pages: pdf.getPageCount(), bytes: bytes.length, sizes };
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

export default async function PdfV6SmokePage() {
  const result = await runSmokeTest();
  console.log("PDF_V6_SMOKE_OK", JSON.stringify(result));
  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}
