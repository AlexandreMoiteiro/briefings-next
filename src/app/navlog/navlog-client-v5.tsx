"use client";

import { useEffect, useRef, useState } from "react";
import { NavlogClientV3 } from "./navlog-client-v3";

const AIRCRAFT = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
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
      </section>

      <div ref={rootRef}>
        <NavlogClientV3 />
      </div>
    </div>
  );
}
