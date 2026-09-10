"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AircraftPicker,
  type AircraftChoice,
} from "@/components/aircraft-picker";
import { ExportBlockedDialog } from "@/components/export-blocked-dialog";
import { checkExportAccess } from "@/lib/export-access";
import { NavlogClient } from "./navlog-client";

const AIRCRAFT = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
  "Cessna 152",
  "Custom aircraft",
] as const;

type Aircraft = (typeof AIRCRAFT)[number];

const AIRCRAFT_CHOICES: readonly AircraftChoice<Aircraft>[] = [
  {
    value: "Tecnam P2006T",
    name: "Tecnam P2006T",
    registrations: "CS-EAQ · CS-EBX · D-GSEV",
    imageSrc: "/aircraft/p2006.png",
  },
  {
    value: "Tecnam P2008",
    name: "Tecnam P2008",
    registrations: "CS-DHS · CS-DHT · CS-DHU · CS-DHV · CS-DHW · CS-ECC · CS-ECD",
    imageSrc: "/aircraft/p2008.png",
  },
  {
    value: "Piper PA-28",
    name: "Piper PA-28",
    registrations: "OE-KPD · OE-KPE · OE-KPJ · OE-KPP · OE-KPG · OE-KPF · OE-KPH",
    imageSrc: "/aircraft/pa28.png",
  },
  {
    value: "Cessna 152",
    name: "Cessna 152",
    registrations: "CS-AVC",
    imageSrc: "/aircraft/c152.png",
  },
  {
    value: "Custom aircraft",
    name: "Custom aircraft",
    registrations: "Enter the aircraft data manually",
    badge: "Generic",
  },
];

const PILOT_STORAGE_KEY = "briefings_performance_pilot_name";

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function aircraftChoice(value: Aircraft) {
  return AIRCRAFT_CHOICES.find((choice) => choice.value === value)!;
}

function findAircraftSelect(root: HTMLElement) {
  return Array.from(root.querySelectorAll("select")).find((select) => {
    const values = Array.from(select.options).map((option) => option.value);
    return AIRCRAFT.every((aircraft) => values.includes(aircraft));
  }) as HTMLSelectElement | undefined;
}

function setControlledSelect(select: HTMLSelectElement, value: Aircraft) {
  if (select.value === value) return;

  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  setter?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function hideBaseAircraftControl(select: HTMLSelectElement) {
  const label = select.closest("label");
  if (!(label instanceof HTMLElement)) return;
  label.hidden = true;
  label.setAttribute("aria-hidden", "true");
}

export function NavlogClientStable() {
  const rootRef = useRef<HTMLDivElement>(null);
  const syncTimerRef = useRef<number | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft>("Tecnam P2006T");
  const [started, setStarted] = useState(false);
  const [showPicker, setShowPicker] = useState(true);
  const [pilotName, setPilotName] = useState("");
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  useEffect(() => {
    setPilotName(window.localStorage.getItem(PILOT_STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (!started) return;

    let cancelled = false;
    let attempt = 0;

    const syncAircraft = () => {
      if (cancelled) return;

      const root = rootRef.current;
      const select = root ? findAircraftSelect(root) : undefined;

      if (select) {
        setControlledSelect(select, aircraft);
        hideBaseAircraftControl(select);
        return;
      }

      attempt += 1;
      if (attempt < 16) {
        syncTimerRef.current = window.setTimeout(syncAircraft, 120);
      }
    };

    syncAircraft();

    return () => {
      cancelled = true;
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [aircraft, started]);

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
    setStarted(true);
    setShowPicker(false);
  }

  const selected = aircraftChoice(aircraft);

  return (
    <div className="navlog-consumer space-y-5" onClickCapture={handleClickCapture}>
      {showPicker ? (
        <AircraftPicker title="NavLog" choices={AIRCRAFT_CHOICES} onSelect={choose} />
      ) : null}

      {started ? (
        <div className={showPicker ? "hidden" : "space-y-5"}>
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl bg-zinc-50 p-2">
                  {selected.imageSrc ? (
                    <img
                      src={selected.imageSrc}
                      alt={selected.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-3xl text-zinc-400" aria-hidden="true">
                      ✈
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Flight preparation · Step 2
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-950">
                    {selected.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="mt-1 text-sm font-semibold text-zinc-500 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950"
                  >
                    Change aircraft
                  </button>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Pilot name <span className="text-red-600">*</span>
                </span>
                <input
                  value={pilotName}
                  onChange={(event) => updatePilotName(event.target.value)}
                  required
                  autoComplete="name"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-950"
                  placeholder="Required for PDF download"
                />
              </label>
            </div>
          </section>

          <div ref={rootRef}>
            <NavlogClient />
          </div>
        </div>
      ) : null}

      <ExportBlockedDialog
        open={blockedDialogOpen}
        pilotName={pilotName}
        onPilotNameChange={updatePilotName}
        onClose={() => setBlockedDialogOpen(false)}
      />
    </div>
  );
}
