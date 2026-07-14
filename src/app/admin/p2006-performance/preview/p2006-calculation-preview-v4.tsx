"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  PERFORMANCE_SOURCES,
  type PerformanceSourceDefinition,
} from "../p2006-mapper-definitions";
import { ensureBundledP2006Form } from "../p2006-form-storage";
import { P2006TCalculationPreview as BaseCalculationPreview } from "./p2006-calculation-preview";

const TEMPERATURES = [-25, 0, 25, 50] as const;
const ALTITUDES = Array.from({ length: 11 }, (_, index) => index * 1000);

type DistanceControls = {
  registration: P2006TRegistration;
  sourceId: string;
  altitudeFt: number;
  temperatureC: number;
  output: "ground-roll" | "50ft";
  windKt: number;
  paved: boolean;
  slopePercent: number;
};

type DistanceTable = {
  rows: number[][];
  corrections: {
    headwindMetersPerKt: number;
    tailwindMetersPerKt: number;
    pavedPercent: number;
    slopePercentPerOnePercent: number;
  };
};

type DistanceResult = {
  tableMeters: number;
  finalMeters: number;
  adjustments: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function bracket(value: number, values: readonly number[]) {
  const clamped = clamp(value, values[0], values[values.length - 1]);
  let lower = 0;
  let upper = values.length - 1;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] <= clamped) lower = index;
    if (values[index] >= clamped) {
      upper = index;
      break;
    }
  }
  const low = values[lower];
  const high = values[upper];
  return {
    lower,
    upper,
    ratio: high === low ? 0 : (clamped - low) / (high - low),
  };
}

function parseDistanceTable(text: string): DistanceTable | null {
  const rows = text
    .split(/\r?\n/)
    .filter((line) => /Ground Roll|At 50 ft AGL/.test(line))
    .map((line) =>
      Array.from(line.matchAll(/(\d+(?:\.\d+)?)\s*\(\s*\d+/g)).map(
        (match) => Number(match[1])
      )
    )
    .filter((values) => values.length >= 5)
    .map((values) => values.slice(0, 5));

  if (rows.length < 22) return null;
  const normalized = text.replace(/\s+/g, " ");
  const number = (expression: RegExp, fallback = 0) => {
    const match = normalized.match(expression);
    return match ? Number(match[1]) : fallback;
  };
  const slopeMatch = normalized.match(
    /Runway slope:\s*([+-])\s*([\d.]+)%[^%]*each\s*\+?1%/i
  );

  return {
    rows: rows.slice(0, 22),
    corrections: {
      headwindMetersPerKt: number(/Headwind:\s*-\s*([\d.]+)m/i),
      tailwindMetersPerKt: number(/Tailwind:\s*\+\s*([\d.]+)m/i),
      pavedPercent: number(/Paved Runway:\s*-\s*([\d.]+)%/i),
      slopePercentPerOnePercent: slopeMatch
        ? (slopeMatch[1] === "-" ? -1 : 1) * Number(slopeMatch[2])
        : 0,
    },
  };
}

function labelledControl(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find(
    (candidate) => candidate.textContent?.includes(labelText)
  );
  return (
    label?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select") ??
    null
  );
}

function numberValue(root: HTMLElement, label: string) {
  const value = labelledControl(root, label)?.value;
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readControls(root: HTMLElement): DistanceControls | null {
  const source = labelledControl(root, "Source page");
  const aircraft = labelledControl(root, "Aircraft");
  const result = labelledControl(root, "Result");
  const altitudeFt = numberValue(root, "Pressure altitude ft");
  const temperatureC = numberValue(root, "OAT °C");
  if (
    !(source instanceof HTMLSelectElement) ||
    !(aircraft instanceof HTMLSelectElement) ||
    !(result instanceof HTMLSelectElement) ||
    altitudeFt === null ||
    temperatureC === null
  ) {
    return null;
  }

  const registration = aircraft.value as P2006TRegistration;
  if (!P2006T_REGISTRATIONS.includes(registration)) return null;

  return {
    registration,
    sourceId: source.value,
    altitudeFt,
    temperatureC,
    output: result.value === "50ft" ? "50ft" : "ground-roll",
    windKt: numberValue(root, "Wind kt") ?? 0,
    paved: Boolean(
      (labelledControl(root, "Paved runway") as HTMLInputElement | null)?.checked
    ),
    slopePercent: numberValue(root, "Runway slope %") ?? 0,
  };
}

function calculateDistance(
  table: DistanceTable,
  controls: DistanceControls
): DistanceResult | null {
  const altitude = bracket(controls.altitudeFt, ALTITUDES);
  const temperature = bracket(controls.temperatureC, TEMPERATURES);
  const offset = controls.output === "ground-roll" ? 0 : 1;
  const lowerRow = altitude.lower * 2 + offset;
  const upperRow = altitude.upper * 2 + offset;
  const lowerLow = table.rows[lowerRow]?.[temperature.lower];
  const lowerHigh = table.rows[lowerRow]?.[temperature.upper];
  const upperLow = table.rows[upperRow]?.[temperature.lower];
  const upperHigh = table.rows[upperRow]?.[temperature.upper];
  if (
    [lowerLow, lowerHigh, upperLow, upperHigh].some(
      (value) => value === undefined
    )
  ) {
    return null;
  }

  const atLowerAltitude = lerp(lowerLow, lowerHigh, temperature.ratio);
  const atUpperAltitude = lerp(upperLow, upperHigh, temperature.ratio);
  const tableMeters = lerp(
    atLowerAltitude,
    atUpperAltitude,
    altitude.ratio
  );
  const corrections = table.corrections;
  const windCorrection =
    controls.windKt >= 0
      ? -corrections.headwindMetersPerKt * controls.windKt
      : corrections.tailwindMetersPerKt * Math.abs(controls.windKt);
  const afterWind = Math.max(0, tableMeters + windCorrection);
  const pavedFactor =
    controls.output === "ground-roll" && controls.paved
      ? 1 - corrections.pavedPercent / 100
      : 1;
  const slopeFactor =
    controls.output === "ground-roll"
      ? 1 +
        (corrections.slopePercentPerOnePercent / 100) *
          controls.slopePercent
      : 1;
  const finalMeters = Math.max(0, afterWind * pavedFactor * slopeFactor);

  const adjustments: string[] = [];
  if (controls.windKt > 0) {
    adjustments.push(`${controls.windKt.toFixed(0)} kt headwind`);
  } else if (controls.windKt < 0) {
    adjustments.push(`${Math.abs(controls.windKt).toFixed(0)} kt tailwind`);
  }
  if (controls.output === "ground-roll" && controls.paved) {
    adjustments.push("paved-runway correction");
  }
  if (controls.output === "ground-roll" && controls.slopePercent !== 0) {
    adjustments.push(
      `${controls.slopePercent > 0 ? "+" : ""}${controls.slopePercent.toFixed(
        1
      )}% runway slope`
    );
  }

  return { tableMeters, finalMeters, adjustments };
}

function calculationCard(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLDivElement>("div")).find(
    (candidate) => {
      const title = candidate.querySelector<HTMLElement>(":scope > p");
      return title?.textContent?.trim() === "Calculation";
    }
  );
}

function polishPreview(root: HTMLElement) {
  root
    .querySelectorAll<HTMLDivElement>(
      "div.pointer-events-none.absolute.bottom-3.left-3"
    )
    .forEach((summary) => {
      summary.style.display = "none";
    });

  const card = calculationCard(root);
  if (card) card.style.display = "none";

  root.querySelectorAll<SVGTextElement>("svg text").forEach((label) => {
    if (!/^Max\s+\d+\s+kg$/i.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    const preceding = label.previousElementSibling;
    if (preceding?.tagName.toLowerCase() === "rect") {
      (preceding as SVGRectElement).style.display = "none";
    }
  });

  root.querySelectorAll<SVGGElement>("svg g").forEach((group) => {
    const label = group.querySelector<SVGTextElement>(":scope > text");
    if (!label || !/^[1-4]$/.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    group
      .querySelector<SVGCircleElement>(":scope > circle")
      ?.style.setProperty("display", "none");
  });

  root
    .querySelectorAll<SVGLineElement>("svg line[marker-end]")
    .forEach((line) => line.style.setProperty("display", "none"));
}

function sourceFor(controls: DistanceControls | null) {
  if (!controls) return null;
  return (
    PERFORMANCE_SOURCES.find((source) => source.id === controls.sourceId) ??
    null
  );
}

function resultLabel(output: DistanceControls["output"]) {
  return output === "ground-roll" ? "Ground roll" : "Distance to 50 ft";
}

export function P2006TCalculationPreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [formWarning, setFormWarning] = useState("");
  const [controls, setControls] = useState<DistanceControls | null>(null);
  const [table, setTable] = useState<DistanceTable | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureBundledP2006Form()
      .catch((error) => {
        console.warn("Unable to prepare bundled P2006T form pages", error);
        if (!cancelled) {
          setFormWarning(
            "The bundled form background could not be cached. The calculation viewer remains available."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;

    const apply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = readControls(root);
        setControls((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next
        );
        polishPreview(root);
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("input", apply);
    root.addEventListener("change", apply);
    root.addEventListener("click", apply);

    return () => {
      observer.disconnect();
      root.removeEventListener("input", apply);
      root.removeEventListener("change", apply);
      root.removeEventListener("click", apply);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ready]);

  const selectedSource = sourceFor(controls);

  useEffect(() => {
    if (!controls || !selectedSource) {
      setTable(null);
      return;
    }
    const controller = new AbortController();
    const asset = selectedSource.manifest[controls.registration];
    setTable(null);
    void fetch(asset.text, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Source text unavailable");
        return response.text();
      })
      .then((text) => setTable(parseDistanceTable(text)))
      .catch(() => {
        if (!controller.signal.aborted) setTable(null);
      });
    return () => controller.abort();
  }, [controls?.registration, controls?.sourceId, selectedSource]);

  const result = useMemo(
    () => (controls && table ? calculateDistance(table, controls) : null),
    [controls, table]
  );

  return (
    <div ref={rootRef}>
      {!ready ? (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5 text-sm font-semibold text-sky-900">
          Preparing the official P2006T form background…
        </div>
      ) : (
        <>
          {formWarning ? (
            <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              {formWarning}
            </p>
          ) : null}

          {controls && selectedSource && result ? (
            <section className="mb-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Performance result
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                {selectedSource.shortTitle} · {controls.registration}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-700">
                At {controls.altitudeFt.toFixed(0)} ft and {controls.temperatureC.toFixed(1)} °C,
                the table interpolation is {result.tableMeters.toFixed(1)} m
                {result.adjustments.length
                  ? ` before ${result.adjustments.join(", ")}.`
                  : "."}
              </p>
              <p className="mt-1 text-base font-semibold leading-6 text-emerald-950">
                {resultLabel(controls.output)} is {result.finalMeters.toFixed(0)} m.
              </p>
            </section>
          ) : null}

          <BaseCalculationPreview />
        </>
      )}
    </div>
  );
}
