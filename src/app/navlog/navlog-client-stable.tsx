"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  AircraftPicker,
  type AircraftChoice,
} from "@/components/aircraft-picker";
import { ExportBlockedDialog } from "@/components/export-blocked-dialog";
import { PilotDownloadCard } from "@/components/pilot-download-card";
import { PreparationPageHeader } from "@/components/preparation-page-header";
import { SelectedAircraftCard } from "@/components/selected-aircraft-card";
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

          <SelectedAircraftCard
            name={selected.name}
            registrations={selected.registrations}
            imageSrc={selected.imageSrc}
            onChange={() => setShowPicker(true)}
          />

          <PilotDownloadCard
            value={pilotName}
            onChange={updatePilotName}
            documentLabel="NavLog"
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
