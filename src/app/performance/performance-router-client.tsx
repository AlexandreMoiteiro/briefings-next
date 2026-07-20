"use client";

import { useState } from "react";
import { P2006TMissionClient } from "./p2006t-mission-client";
import { StandardAircraftClientV2 } from "./standard-aircraft-client-v2";

type PerformanceMode = "P2006T" | "P2008" | "PA28";

const OPTIONS: Array<{ value: PerformanceMode; label: string }> = [
  { value: "P2006T", label: "Tecnam P2006T" },
  { value: "P2008", label: "Tecnam P2008" },
  { value: "PA28", label: "Piper PA-28" },
];

export function PerformanceRouterClient() {
  const [mode, setMode] = useState<PerformanceMode>("P2006T");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={[
                "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                mode === option.value
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {mode === "P2006T" ? <P2006TMissionClient /> : null}
      {mode === "P2008" ? (
        <StandardAircraftClientV2 aircraft="Tecnam P2008" />
      ) : null}
      {mode === "PA28" ? (
        <StandardAircraftClientV2 aircraft="Piper PA-28" />
      ) : null}
    </div>
  );
}
