"use client";

import { useEffect, useRef, useState } from "react";
import { NavlogClientV3 } from "./navlog-client-v3";
import { C152_NAVLOG_PRESET } from "@/lib/c152-operational-presets";

const AIRCRAFT = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
  "Cessna 152",
  "Custom aircraft",
] as const;

type Aircraft = (typeof AIRCRAFT)[number];

function findAircraftSelect(root: HTMLElement) {
  return Array.from(root.querySelectorAll("select")).find((select) => {
    const values = Array.from(select.options).map((option) => option.value);
    return AIRCRAFT.every((aircraft) => values.includes(aircraft));
  }) as HTMLSelectElement | undefined;
}

function hideOriginalAircraftControl(select: HTMLSelectElement) {
  const label = select.closest("label");
  if (!(label instanceof HTMLElement)) return;

  label.hidden = true;
  label.setAttribute("aria-hidden", "true");
}

function changeSelect(select: HTMLSelectElement, value: Aircraft) {
  const optionIndex = Array.from(select.options).findIndex(
    (option) => option.value === value
  );
  if (optionIndex < 0) return false;

  select.focus();
  select.selectedIndex = optionIndex;

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(select, value);

  select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  select.blur();
  return true;
}

function refreshProfileHelp(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const value = node.nodeValue ?? "";

    if (value.includes("Tecnam/Piper profiles load generic starting values")) {
      node.nodeValue = value.replace(
        /Tecnam\/Piper profiles load generic starting values, including 20 min ground\/taxi time and default climb\/descent rates\. Review TAS, ROC\/ROD, fuel flow, EFOB and ground\/taxi time for the actual aircraft, mission and conditions\./,
        "Aircraft profiles load starting values. Cessna 152 / CS-AVC uses its dedicated preset; Tecnam and Piper keep their existing presets. Review TAS, ROC/ROD, fuel flow, EFOB and ground/taxi time for the actual mission and conditions."
      );
    }

    if (value.includes("The Tecnam/Piper default is 20 minutes")) {
      node.nodeValue = value.replace(
        /The Tecnam\/Piper default is 20 minutes, but this is only a starting point\./,
        "The Cessna 152 default is 10 minutes; Tecnam and Piper remain at 20 minutes. These are starting points."
      );
    }
  }
}

export function NavlogClientV5() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [aircraft, setAircraft] = useState<Aircraft>("Tecnam P2006T");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const select = findAircraftSelect(root);
      if (!select) return;

      hideOriginalAircraftControl(select);
      refreshProfileHelp(root);

      const value = select.value as Aircraft;
      if (AIRCRAFT.includes(value)) {
        setAircraft((current) => (current === value ? current : value));
      }
    };

    sync();
    root.addEventListener("change", sync, true);
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true });

    return () => {
      root.removeEventListener("change", sync, true);
      observer.disconnect();
    };
  }, []);

  function choose(next: Aircraft) {
    setAircraft(next);
    const root = rootRef.current;
    const select = root ? findAircraftSelect(root) : undefined;
    if (!select) return;

    changeSelect(select, next);
    window.requestAnimationFrame(() => {
      if (select.value !== next) changeSelect(select, next);
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Aircraft
          </span>
          <select
            value={aircraft}
            onChange={(event) => choose(event.target.value as Aircraft)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-950"
          >
            {AIRCRAFT.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {aircraft === "Cessna 152" ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold">CS-AVC preset loaded</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Taxi 10 min only for C152
              </p>
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <p className="rounded-xl bg-white px-3 py-2">
                TAS C/C/D: {C152_NAVLOG_PRESET.climbTasKt} / {C152_NAVLOG_PRESET.cruiseTasKt} / {C152_NAVLOG_PRESET.descentTasKt} kt
              </p>
              <p className="rounded-xl bg-white px-3 py-2">
                Fuel flow: {C152_NAVLOG_PRESET.fuelFlowLh} L/h
              </p>
              <p className="rounded-xl bg-white px-3 py-2">
                ROC / ROD: {C152_NAVLOG_PRESET.rocFpm} / {C152_NAVLOG_PRESET.rodFpm} fpm
              </p>
              <p className="rounded-xl bg-white px-3 py-2">
                EFOB / altitude: {C152_NAVLOG_PRESET.startEfobL} L / {C152_NAVLOG_PRESET.defaultAltitudeFt} ft
              </p>
            </div>
            <p className="mt-3 text-xs leading-5 text-sky-800">
              CS-AVC uses its dedicated NavLog profile. Tecnam and Piper keep their existing presets, including the 20 min taxi default. All values remain editable for the actual mission.
            </p>
          </div>
        ) : null}
      </section>

      <div ref={rootRef}>
        <NavlogClientV3 />
      </div>
    </div>
  );
}
