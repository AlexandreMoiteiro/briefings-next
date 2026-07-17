"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { NavlogClient } from "./navlog-client";

const P2006T_PROFILE_FIELDS = new Set([
  "Climb TAS",
  "Cruise TAS",
  "Descent TAS",
  "Fuel L/h",
  "ROC",
  "ROD",
]);

function labelledSelect(root: HTMLElement, label: string) {
  for (const element of root.querySelectorAll("label")) {
    const heading = element.querySelector("span")?.textContent?.trim();
    if (heading === label) {
      return element.querySelector("select") as HTMLSelectElement | null;
    }
  }
  return null;
}

function applyProfileFieldVisibility(root: HTMLElement, useStandardProfile: boolean) {
  for (const element of root.querySelectorAll("label")) {
    const heading = element.querySelector("span")?.textContent?.trim() ?? "";
    if (!P2006T_PROFILE_FIELDS.has(heading)) continue;
    (element as HTMLElement).style.display = useStandardProfile ? "none" : "";
  }
}

function selectP2006TDefault(root: HTMLElement) {
  const aircraftSelect = labelledSelect(root, "Aircraft");
  if (!aircraftSelect || aircraftSelect.value === "Tecnam P2006T") return false;

  aircraftSelect.value = "Tecnam P2006T";
  aircraftSelect.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function ConditionedNavlogClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const defaultAppliedRef = useRef(false);
  const [aircraft, setAircraft] = useState("Tecnam P2006T");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      if (!defaultAppliedRef.current) {
        const applied = selectP2006TDefault(root);
        if (applied || labelledSelect(root, "Aircraft")?.value === "Tecnam P2006T") {
          defaultAppliedRef.current = true;
        }
      }

      const selectedAircraft = labelledSelect(root, "Aircraft")?.value ?? "";
      setAircraft(selectedAircraft);
      applyProfileFieldVisibility(root, selectedAircraft === "Tecnam P2006T");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  function handleCapturedChange(event: ChangeEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLSelectElement)) return;

    window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const selectedAircraft = labelledSelect(root, "Aircraft")?.value ?? "";
      setAircraft(selectedAircraft);
      applyProfileFieldVisibility(root, selectedAircraft === "Tecnam P2006T");
    });
  }

  return (
    <div ref={rootRef} onChangeCapture={handleCapturedChange} className="space-y-5">
      {aircraft === "Tecnam P2006T" ? (
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
                Default
              </span>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-950">
                P2006T standard NavLog profile
              </h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-600">
                The NavLog uses the Sevenair Standard Profiles rather than the AFM performance tables. Detailed table interpolation remains exclusive to the Performance page and its PDF.
              </p>
            </div>

            <div className="grid min-w-[320px] grid-cols-3 gap-2 rounded-2xl border border-sky-200 bg-white p-3 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Climb</p>
                <p className="mt-1 text-lg font-semibold text-zinc-950">100 kt</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Cruise</p>
                <p className="mt-1 text-lg font-semibold text-zinc-950">125 kt</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Descent</p>
                <p className="mt-1 text-lg font-semibold text-zinc-950">120 kt</p>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Reference settings: normal climb 27 MAP / 2200 RPM; cruise 24 MAP / 2100 RPM. Existing fuel, climb-rate and descent-rate planning defaults remain available to the calculation engine.
          </p>
        </section>
      ) : null}

      <NavlogClient />
    </div>
  );
}
