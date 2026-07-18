"use client";

import { useState } from "react";
import { PerformanceClient } from "./performance-client";
import { P2006TCompleteClient } from "./p2006t-complete-client";

type PerformanceMode = "P2006T" | "Existing";

export function PerformanceRouterClient() {
  const [mode, setMode] = useState<PerformanceMode>("P2006T");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("P2006T")}
            className={[
              "rounded-2xl border p-4 text-left transition",
              mode === "P2006T"
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400",
            ].join(" ")}
          >
            <span className="block font-semibold">Tecnam P2006T</span>
            <span className="mt-1 block text-xs opacity-75">
              Official form, aircraft-specific AFM tables and two alternates
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("Existing")}
            className={[
              "rounded-2xl border p-4 text-left transition",
              mode === "Existing"
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400",
            ].join(" ")}
          >
            <span className="block font-semibold">Tecnam P2008 / Piper PA-28</span>
            <span className="mt-1 block text-xs opacity-75">
              Existing workflow preserved without changes
            </span>
          </button>
        </div>
      </section>

      {mode === "P2006T" ? <P2006TCompleteClient /> : <PerformanceClient />}
    </div>
  );
}
