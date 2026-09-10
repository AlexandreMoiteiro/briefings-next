"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  AircraftPicker,
  type AircraftChoice,
} from "@/components/aircraft-picker";
import { C152ClientV3 } from "./c152-client-v3";
import { P2006TMissionClient } from "./p2006t-mission-client";
import { PerformanceUsageTracker } from "./performance-usage-tracker";
import { StandardAircraftClientV4 } from "./standard-aircraft-client-v4";

type PerformanceMode = "P2006T" | "P2008" | "PA28" | "C152";

const OPTIONS: readonly AircraftChoice<PerformanceMode>[] = [
  {
    value: "P2006T",
    name: "Tecnam P2006T",
    registrations: "CS-EAQ · CS-EBX · D-GSEV",
    imageSrc: "/aircraft/p2006.png",
    imageAlt: "Tecnam P2006T",
  },
  {
    value: "P2008",
    name: "Tecnam P2008",
    registrations: "CS-DHS · CS-DHT · CS-DHU · CS-DHV · CS-DHW · CS-ECC · CS-ECD",
    imageSrc: "/aircraft/p2008.png",
    imageAlt: "Tecnam P2008",
  },
  {
    value: "PA28",
    name: "Piper PA-28",
    registrations: "OE-KPD · OE-KPE · OE-KPJ · OE-KPP · OE-KPG · OE-KPF · OE-KPH",
    imageSrc: "/aircraft/pa28.png",
    imageAlt: "Piper PA-28",
  },
  {
    value: "C152",
    name: "Cessna 152",
    registrations: "CS-AVC",
    imageSrc: "/aircraft/c152.png",
    imageAlt: "Cessna 152",
  },
];

function PerformanceHeader() {
  return (
    <header className="border-b border-zinc-200 pb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
        Flight preparation · Step 1
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
        Performance
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 sm:text-base">
        Complete aircraft loading, fuel planning and runway performance first. The NavLog and final Briefing come afterwards.
      </p>
    </header>
  );
}

export function PerformanceRouterClient() {
  const [mode, setMode] = useState<PerformanceMode | null>(null);
  const selected = useMemo(
    () => OPTIONS.find((option) => option.value === mode) ?? null,
    [mode]
  );

  if (!mode || !selected) {
    return (
      <div className="space-y-5">
        <PerformanceHeader />
        <AircraftPicker
          title="Choose aircraft"
          choices={OPTIONS}
          onSelect={setMode}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PerformanceHeader />

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 p-2">
              <Image
                src={selected.imageSrc || "/aircraft/p2006.png"}
                alt={selected.imageAlt || selected.name}
                fill
                sizes="112px"
                className="object-contain p-2"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Selected aircraft
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-950">
                {selected.name}
              </h2>
              <p className="mt-1 truncate text-xs text-zinc-500">
                {selected.registrations}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMode(null)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            Change aircraft
          </button>
        </div>
      </section>

      <div className="performance-consumer space-y-4">
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
    </div>
  );
}
