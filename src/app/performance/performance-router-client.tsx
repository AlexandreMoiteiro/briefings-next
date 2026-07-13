"use client";

import { useEffect, useRef, useState } from "react";
import { PerformanceClient } from "./performance-client";
import { P2006TClient } from "./p2006t-client";

type PerformanceAircraftSelection =
  | "Tecnam P2006T"
  | "Tecnam P2008"
  | "Piper PA-28";

const AIRCRAFT_OPTIONS: Array<{
  value: PerformanceAircraftSelection;
  title: string;
  subtitle: string;
}> = [
  {
    value: "Tecnam P2006T",
    title: "Tecnam P2006T",
    subtitle: "Three-aircraft guided AFM workflow",
  },
  {
    value: "Tecnam P2008",
    title: "Tecnam P2008",
    subtitle: "Existing Tecnam performance workflow",
  },
  {
    value: "Piper PA-28",
    title: "Piper PA-28",
    subtitle: "Existing graph-based workflow",
  },
];

function ExistingFleetWorkspace({
  aircraft,
}: {
  aircraft: "Tecnam P2008" | "Piper PA-28";
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
    const target = buttons.find(
      (button) => button.textContent?.trim() === aircraft
    );

    target?.click();

    const internalSelector = target?.parentElement;
    if (internalSelector) internalSelector.style.display = "none";
  }, [aircraft]);

  return (
    <div ref={rootRef}>
      <PerformanceClient />
    </div>
  );
}

export function PerformanceRouterClient() {
  const [aircraft, setAircraft] =
    useState<PerformanceAircraftSelection>("Tecnam P2006T");

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 bg-white print:hidden">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Performance & Mass Balance
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
                Choose aircraft
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                The P2006T is the default. Aircraft selection is kept visible because
                it changes the loading model, AFM source, performance method and PDF
                output.
              </p>
            </div>

            <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
              Default · Tecnam P2006T
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {AIRCRAFT_OPTIONS.map((option) => {
              const active = aircraft === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAircraft(option.value)}
                  className={[
                    "rounded-2xl border p-4 text-left transition",
                    active
                      ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  <span className="block text-base font-semibold">
                    {option.title}
                  </span>
                  <span
                    className={[
                      "mt-1 block text-xs leading-5",
                      active ? "text-zinc-300" : "text-zinc-500",
                    ].join(" ")}
                  >
                    {option.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {aircraft === "Tecnam P2006T" ? (
        <P2006TClient />
      ) : (
        <ExistingFleetWorkspace key={aircraft} aircraft={aircraft} />
      )}
    </div>
  );
}
