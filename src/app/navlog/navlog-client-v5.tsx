"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { NavlogClientV3 } from "./navlog-client-v3";
import { checkExportAccess } from "@/lib/export-access";
import { ExportBlockedDialog } from "@/components/export-blocked-dialog";

const AIRCRAFT_OPTIONS = [
  { value: "Tecnam P2006T", detail: "Twin engine" },
  { value: "Tecnam P2008", detail: "Single engine" },
  { value: "Piper PA-28", detail: "Single engine" },
  { value: "Cessna 152", detail: "CS-AVC" },
  { value: "Custom aircraft", detail: "Enter your own values" },
] as const;

const AIRCRAFT = AIRCRAFT_OPTIONS.map((item) => item.value);
const PILOT_STORAGE_KEY = "briefings_performance_pilot_name";

type Aircraft = (typeof AIRCRAFT)[number];

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

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

function cleanProfileHelp(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const value = node.nodeValue ?? "";

    if (
      value.includes("Tecnam/Piper profiles load generic starting values") ||
      value.includes("Cessna 152 / CS-AVC uses its dedicated preset")
    ) {
      node.nodeValue = value.replace(
        /Tecnam\/Piper profiles load generic starting values, including 20 min ground\/taxi time and default climb\/descent rates\. Review TAS, ROC\/ROD, fuel flow, EFOB and ground\/taxi time for the actual aircraft, mission and conditions\.|Aircraft profiles load starting values\. Cessna 152 \/ CS-AVC uses its dedicated preset; Tecnam and Piper keep their existing presets\. Review TAS, ROC\/ROD, fuel flow, EFOB and ground\/taxi time for the actual mission and conditions\./,
        "Review the loaded aircraft values for this flight and adjust speeds, fuel flow, EFOB or ground time when required."
      );
    }

    if (
      value.includes("The Tecnam/Piper default is 20 minutes") ||
      value.includes("The Cessna 152 default is 10 minutes")
    ) {
      node.nodeValue = value.replace(
        /The Tecnam\/Piper default is 20 minutes, but this is only a starting point\.|The Cessna 152 default is 10 minutes; Tecnam and Piper remain at 20 minutes\. These are starting points\./,
        "Use the planned ground/taxi time for this flight."
      );
    }
  }
}

export function NavlogClientV5() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [aircraft, setAircraft] = useState<Aircraft>("Tecnam P2006T");
  const [pilotName, setPilotName] = useState("");
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  useEffect(() => {
    setPilotName(window.localStorage.getItem(PILOT_STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const select = findAircraftSelect(root);
      if (!select) return;

      hideOriginalAircraftControl(select);
      cleanProfileHelp(root);

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

  function updatePilotName(value: string) {
    setPilotName(value);
    window.localStorage.setItem(PILOT_STORAGE_KEY, value);
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button");
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    if (normalize(button.textContent) !== "export navlog pdf") return;

    if (button.dataset.briefingsAccessAllowed === "1") {
      delete button.dataset.briefingsAccessAllowed;
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!pilotName.trim()) {
      window.alert("Enter your real name before downloading the NavLog PDF.");
      return;
    }

    if (button.dataset.briefingsAccessChecking === "1") return;
    button.dataset.briefingsAccessChecking = "1";

    void checkExportAccess().then(({ allowed }) => {
      delete button.dataset.briefingsAccessChecking;

      if (!allowed) {
        setBlockedDialogOpen(true);
        return;
      }

      button.dataset.briefingsAccessAllowed = "1";
      button.click();
    });
  }

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

  function openSavedRoutes() {
    const root = rootRef.current;
    if (!root) return;

    const heading = Array.from(root.querySelectorAll("h2, h3, h4")).find((element) =>
      /saved routes/i.test(element.textContent ?? "")
    );
    const target = heading?.closest("section") ?? heading;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4" onClickCapture={handleClickCapture}>
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Start here
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Choose the aircraft first
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
            Aircraft selection controls the speeds, fuel assumptions and calculations used by the NavLog.
          </p>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-label="Aircraft">
          {AIRCRAFT_OPTIONS.map((option) => {
            const selected = aircraft === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(option.value)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition",
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-400 hover:bg-white",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{option.value}</span>
                <span className={[
                  "mt-1 block text-xs",
                  selected ? "text-zinc-300" : "text-zinc-500",
                ].join(" ")}>
                  {option.detail}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <label className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Pilot name · required to export
            </span>
            <input
              value={pilotName}
              onChange={(event) => updatePilotName(event.target.value)}
              required
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-950"
              placeholder="Your real name"
            />
            <span className="mt-2 block text-xs leading-5 text-zinc-500">
              Use your real name. It is required for exports so this free tool can remain open and abuse can be managed. Deliberately false names may block this device from PDF exports.
            </span>
          </label>

          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Reusing a route?
            </p>
            <h2 className="mt-1 text-base font-semibold text-zinc-950">
              Start from Saved routes
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Saved routes are reusable route templates. Load one first, then update the flight-specific wind, altitude, timings and fuel.
            </p>
            <button
              type="button"
              onClick={openSavedRoutes}
              className="mt-3 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Open Saved routes
            </button>
          </div>
        </div>
      </section>

      <div ref={rootRef}>
        <NavlogClientV3 />
      </div>

      <ExportBlockedDialog
        open={blockedDialogOpen}
        pilotName={pilotName}
        onPilotNameChange={updatePilotName}
        onClose={() => setBlockedDialogOpen(false)}
      />
    </div>
  );
}
