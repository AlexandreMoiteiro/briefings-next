"use client";

import { useState } from "react";
import { PerformanceClient } from "./performance-client";
import { P2006TCsEaqClient } from "./p2006t-cs-eaq-client";

type PerformanceWorkspace = "existing-fleet" | "cs-eaq";

export function PerformanceRouterClient() {
  const [workspace, setWorkspace] =
    useState<PerformanceWorkspace>("existing-fleet");

  return (
    <>
      <div className="border-b border-zinc-200 bg-white print:hidden">
        <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Aircraft selector
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setWorkspace("existing-fleet")}
              className={[
                "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                workspace === "existing-fleet"
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
            >
              Piper PA-28 / Tecnam P2008
              <span className="mt-1 block text-xs font-normal opacity-70">
                Existing performance workspace
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWorkspace("cs-eaq")}
              className={[
                "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                workspace === "cs-eaq"
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100",
              ].join(" ")}
            >
              Tecnam P2006T · CS-EAQ
              <span className="mt-1 block text-xs font-normal opacity-70">
                Aircraft-specific AFM calculation
              </span>
            </button>
          </div>
        </div>
      </div>

      {workspace === "cs-eaq" ? <P2006TCsEaqClient /> : <PerformanceClient />}
    </>
  );
}
