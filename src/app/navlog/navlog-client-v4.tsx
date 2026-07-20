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
  const label = Array.from(root.querySelectorAll("label")).find((candidate) =>
    Array.from(candidate.querySelectorAll("span")).some(
      (span) => span.textContent?.trim() === "Aircraft"
    )
  );
  return label?.querySelector("select") as HTMLSelectElement | null;
}

function setNativeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function NavlogClientV4() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [aircraft, setAircraft] = useState<Aircraft>("Tecnam P2006T");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const select = findAircraftSelect(root);
      const value = select?.value as Aircraft | undefined;
      if (value && AIRCRAFT.includes(value)) {
        setAircraft((current) => (current === value ? current : value));
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    root.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      root.removeEventListener("change", sync);
    };
  }, []);

  function choose(next: Aircraft) {
    setAircraft(next);
    const root = rootRef.current;
    const select = root ? findAircraftSelect(root) : null;
    if (select) setNativeSelect(select, next);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Aircraft
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {AIRCRAFT.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              className={[
                "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                aircraft === option
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400",
              ].join(" ")}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <div ref={rootRef}>
        <NavlogClientV3 />
      </div>
    </div>
  );
}
