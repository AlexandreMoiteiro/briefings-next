"use client";

import { useState } from "react";
import { C152ClientV3 } from "./c152-client-v3";
import { P2006TMissionClient } from "./p2006t-mission-client";
import { PerformanceUsageTracker } from "./performance-usage-tracker";
import { StandardAircraftClientV4 } from "./standard-aircraft-client-v4";

type PerformanceMode = "P2006T" | "P2008" | "PA28" | "C152";

const OPTIONS: Array<{
  value: PerformanceMode;
  label: string;
  detail: string;
}> = [
  { value: "P2006T", label: "Tecnam P2006T", detail: "Twin engine" },
  { value: "P2008", label: "Tecnam P2008", detail: "Single engine" },
  { value: "PA28", label: "Piper PA-28", detail: "Single engine" },
  { value: "C152", label: "Cessna 152", detail: "CS-AVC" },
];

const FLOW = [
  "Aircraft",
  "Flight date & UTC",
  "Weather",
  "Loading & fuel",
  "Runway performance",
  "PDF",
];

export function PerformanceRouterClient() {
  const [mode, setMode] = useState<PerformanceMode>("P2006T");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Start here
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              Select the aircraft
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              The selected aircraft changes the calculator, limits and PDF. Confirm it before entering flight data.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Aircraft">
          {OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(option.value)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition",
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-400 hover:bg-white",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className={[
                  "mt-1 block text-xs",
                  selected ? "text-zinc-300" : "text-zinc-500",
                ].join(" ")}>
                  {option.detail}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Before updating weather, confirm the <strong>flight date</strong> and the <strong>UTC hour for each aerodrome</strong>. The forecast is fetched for those values.
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500" aria-label="Performance workflow">
          {FLOW.map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                {step}
              </span>
              {index < FLOW.length - 1 ? <span className="text-zinc-300">→</span> : null}
            </div>
          ))}
        </div>
      </section>

      {mode === "P2006T" ? <P2006TMissionClient /> : null}
      {mode === "P2008" ? (
        <StandardAircraftClientV4 aircraft="Tecnam P2008" />
      ) : null}
      {mode === "PA28" ? (
        <StandardAircraftClientV4 aircraft="Piper PA-28" />
      ) : null}
      {mode === "C152" ? (
        <PerformanceUsageTracker aircraft="Cessna 152">
          <C152ClientV3 />
        </PerformanceUsageTracker>
      ) : null}
    </div>
  );
}
