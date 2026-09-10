"use client";

import Image from "next/image";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  AircraftPicker,
  type AircraftChoice,
} from "@/components/aircraft-picker";
import { ExportBlockedDialog } from "@/components/export-blocked-dialog";
import { PreparationPageHeader } from "@/components/preparation-page-header";
import { checkExportAccess } from "@/lib/export-access";
import type { NavlogAircraftType } from "@/lib/navlog";
import { NavlogStudio } from "./navlog-studio";

const AIRCRAFT = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
  "Cessna 152",
  "Custom aircraft",
] as const satisfies readonly NavlogAircraftType[];

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
const PAGE_DESCRIPTION =
  "Compose the route on one planning surface, verify it on the map, then review the calculated NavLog before the final Briefing.";

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function aircraftChoice(value: Aircraft) {
  return AIRCRAFT_CHOICES.find((choice) => choice.value === value)!;
}

function MissionContext({
  aircraft,
  imageSrc,
  pilotName,
  onPilotNameChange,
  onChangeAircraft,
}: {
  aircraft: string;
  imageSrc?: string;
  pilotName: string;
  onPilotNameChange: (value: string) => void;
  onChangeAircraft: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-y border-zinc-200 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-50">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={aircraft}
              fill
              sizes="64px"
              className="object-contain p-1"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xl text-zinc-400">✈</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">Aircraft</p>
          <p className="truncate text-sm font-semibold text-zinc-950">{aircraft}</p>
        </div>
        <button
          type="button"
          onClick={onChangeAircraft}
          className="ml-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Change
        </button>
      </div>

      <label className="flex min-w-0 flex-1 items-center gap-3 lg:max-w-xl">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
          Pilot · PDF
        </span>
        <input
          value={pilotName}
          onChange={(event) => onPilotNameChange(event.target.value)}
          autoComplete="name"
          placeholder="Real name required for export"
          className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-500"
        />
      </label>
    </div>
  );
}

export function NavlogClientStable() {
  const [aircraft, setAircraft] = useState<Aircraft>("Tecnam P2006T");
  const [started, setStarted] = useState(false);
  const [showPicker, setShowPicker] = useState(true);
  const [pilotName, setPilotName] = useState("");
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  useEffect(() => {
    setPilotName(window.localStorage.getItem(PILOT_STORAGE_KEY) ?? "");
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
    setStarted(true);
    setShowPicker(false);
  }

  const selected = aircraftChoice(aircraft);

  return (
    <div className="space-y-5" onClickCapture={handleClickCapture}>
      {showPicker ? (
        <div className="space-y-6">
          <PreparationPageHeader step={2} title="NavLog" description={PAGE_DESCRIPTION} />
          <AircraftPicker choices={AIRCRAFT_CHOICES} onSelect={choose} />
        </div>
      ) : null}

      {started ? (
        <div className={showPicker ? "hidden" : "space-y-5"}>
          <PreparationPageHeader step={2} title="NavLog" description={PAGE_DESCRIPTION} />
          <MissionContext
            aircraft={selected.name}
            imageSrc={selected.imageSrc}
            pilotName={pilotName}
            onPilotNameChange={updatePilotName}
            onChangeAircraft={() => setShowPicker(true)}
          />
          <NavlogStudio aircraftType={aircraft} />
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
