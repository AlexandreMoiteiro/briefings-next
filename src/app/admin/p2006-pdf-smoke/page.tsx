import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  evaluatePerformanceLeg,
  type PerformanceLegInput,
} from "@/lib/performance/aerodrome-performance";
import { recalculateFuelPlan } from "@/lib/performance/fuel-planning";
import {
  calculateP2006TPerformance,
  type P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import { setP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import { buildP2006TPerformancePdf } from "@/lib/pdf/p2006t-performance-pdf";

const FORM_FILENAME =
  "RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf";

function localResponse(bytes: Uint8Array, contentType: string) {
  return new Response(bytes, {
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
        await readFile(path.join(process.cwd(), FORM_FILENAME)),
        "application/pdf"
      );
    }

    if (value.startsWith("/p2006-performance-pages/")) {
      const relative = value.replace(/^\//, "");
      const bytes = await readFile(path.join(process.cwd(), "public", relative));
      return localResponse(
        bytes,
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

    const legs: PerformanceLegInput[] = [
      {
        role: "Departure",
        icao: "LPSO",
        tempC: 15,
        qnhHpa: 1013,
        windFrom: 240,
        windKt: 8,
      },
      {
        role: "Arrival",
        icao: "LPST",
        tempC: 18,
        qnhHpa: 1015,
        windFrom: 280,
        windKt: 10,
      },
      {
        role: "Alternate",
        icao: "LPEV",
        tempC: 17,
        qnhHpa: 1012,
        windFrom: 230,
        windKt: 7,
      },
      {
        role: "Alternate 2",
        icao: "LPBJ",
        tempC: 19,
        qnhHpa: 1014,
        windFrom: 250,
        windKt: 9,
      },
    ];

    const results = await Promise.all(
      legs.map((leg) =>
        calculateP2006TPerformance({
          registration: "CS-EBX",
          result: evaluatePerformanceLeg(leg),
          takeoffWeightKg: 1150,
          landingWeightKg: 1080,
          conditions: { surface: "paved", uphillSlopePct: 0 },
        })
      )
    );
    const rows = results.filter(
      (result): result is P2006TPerformanceRow => result.ok
    );

    if (rows.length !== 4) {
      throw new Error(
        `Expected four valid performance rows, received ${rows.length}.`
      );
    }

    const fuelPlan = recalculateFuelPlan({
      rateLh: 36,
      fuelLoadedL: 180,
      taxiMin: 20,
      climbMin: 10,
      enrouteMin: 100,
      descentMin: 10,
      alternateMin: 45,
      reserveMin: 45,
    });
    const bytes = await buildP2006TPerformancePdf({
      registration: "CS-EBX",
      date: "2026-07-18",
      loading: {
        emptyMassKg: 820,
        emptyMomentKgm: 170,
        pilotFrontKg: 150,
        rearSeatsKg: 40,
        fuelLoadedL: 180,
        baggageKg: 10,
      },
      fuelPlan,
      rows,
    });
    const pdf = await PDFDocument.load(bytes);
    const sizes = pdf.getPages().map((page) => page.getSize());
    const invalidSize = sizes.some(
      (size) => Math.abs(size.width - 595) > 1 || Math.abs(size.height - 842) > 1
    );

    if (pdf.getPageCount() < 20 || invalidSize) {
      throw new Error(
        `Invalid generated PDF: ${pdf.getPageCount()} pages, invalidSize=${invalidSize}.`
      );
    }

    const summary = {
      rows: rows.length,
      pages: pdf.getPageCount(),
      bytes: bytes.length,
      firstThreePages: [
        "Official M&B form",
        "Official performance form - Alternate 1",
        "Official performance form - Alternate 2",
      ],
      appended: [
        "Takeoff tables",
        "Landing tables",
        "Climb tables",
        "Cruise tables",
      ],
    };

    console.log("P2006_PDF_SMOKE_OK", JSON.stringify(summary));
    return summary;
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

export default async function P2006PdfSmokePage() {
  const summary = await runSmokeTest();

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">P2006T PDF smoke test</h1>
      <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-zinc-950 p-4 text-xs text-white">
        {JSON.stringify(summary, null, 2)}
      </pre>
    </main>
  );
}
