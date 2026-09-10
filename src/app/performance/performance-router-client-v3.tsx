"use client";

import { useState } from "react";
import { P2006TMissionClient } from "./p2006t-mission-client";
import { StandardAircraftClientV3 } from "./standard-aircraft-client-v3";

type PerformanceMode = "P2006T" | "P2008" | "PA28";

const OPTIONS: Array<{
  value: PerformanceMode;
  label: string;
  subtitle: string;
}> = [
  {
    value: "P2006T",
    label: "Tecnam P2006T",
    subtitle: "Twin-engine mission performance",
  },
  {
    value: "P2008",
    label: "Tecnam P2008",
    subtitle: "Single-engine performance",
  },
  {
    value: "PA28",
    label: "Piper PA-28",
    subtitle: "Single-engine performance",
  },
];

export function PerformanceRouterClientV3() {
  const [mode, setMode] = useState<PerformanceMode>("P2006T");
  const selected = OPTIONS.find((option) => option.value === mode) ?? OPTIONS[0];

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-500">
              Flight preparation · Step 01
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              Performance
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
              Complete aircraft loading, fuel planning and runway performance before building the NavLog.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Selected aircraft
            </p>
            <p className="mt-1 font-semibold text-zinc-950">{selected.label}</p>
            <p className="text-xs text-zinc-500">{selected.subtitle}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="mb-3 px-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Aircraft
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            All aircraft use the same workspace structure; only aircraft-specific data and calculations change.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((option) => {
            const active = option.value === mode;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition",
                  active
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span
                  className={[
                    "mt-1 block text-xs",
                    active ? "text-zinc-300" : "text-zinc-500",
                  ].join(" ")}
                >
                  {option.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="space-y-4">
        {mode === "P2006T" ? <P2006TMissionClient /> : null}
        {mode === "P2008" ? (
          <StandardAircraftClientV3 aircraft="Tecnam P2008" />
        ) : null}
        {mode === "PA28" ? (
          <StandardAircraftClientV3 aircraft="Piper PA-28" />
        ) : null}
      </div>
    </div>
  );
}
