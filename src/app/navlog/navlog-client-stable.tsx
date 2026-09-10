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
import { PilotDownloadCard } from "@/components/pilot-download-card";
import { PreparationPageHeader } from "@/components/preparation-page-header";
import { SelectedAircraftCard } from "@/components/selected-aircraft-card";
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
const PAGE_DESCRIPTION =
  "Choose the aircraft, load or build the route, confirm wind and fuel, then review the calculated NavLog before the final Briefing.";

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

function decorateRouteWorkspace(root: HTMLElement) {
  const routeHeading = Array.from(root.querySelectorAll("h2")).find((heading) =>
    normalize(heading.textContent).includes("build the route, manage saved routes")
  );
  if (!routeHeading) return false;

  const section = routeHeading.closest("section") as HTMLElement | null;
  if (!section) return false;

  section.dataset.navlogRouteWorkspace = "true";
  routeHeading.textContent = "Saved routes, route builder and working route";

  const grid = Array.from(section.querySelectorAll("div.grid")).find((candidate) => {
    const text = normalize(candidate.textContent);
    return (
      text.includes("create the working route") &&
      text.includes("load or manage supabase routes") &&
      text.includes("current map/table route")
    );
  }) as HTMLElement | undefined;

  if (!grid) return false;
  grid.dataset.navlogRouteGrid = "true";

  const cards = Array.from(grid.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  const buildCard = cards.find((card) =>
    normalize(card.textContent).includes("create the working route")
  );
  const savedCard = cards.find((card) =>
    normalize(card.textContent).includes("load or manage supabase routes")
  );
  const currentCard = cards.find((card) =>
    normalize(card.textContent).includes("current map/table route")
  );

  if (buildCard) buildCard.dataset.navlogRouteCard = "build";
  if (currentCard) currentCard.dataset.navlogRouteCard = "current";

  if (!savedCard) return false;
  savedCard.dataset.navlogRouteCard = "saved";

  const savedHeading = savedCard.querySelector("h3");
  if (savedHeading) savedHeading.textContent = "Choose, save or update routes";

  Array.from(savedCard.querySelectorAll("button")).forEach((button) => {
    const text = normalize(button.textContent);
    if (text === "load") button.textContent = "Browse routes";
    if (text === "manage") button.textContent = "Save / edit";
    if (text === "load into map/table") button.textContent = "Use route";
  });

  const searchInput = savedCard.querySelector(
    'input[placeholder="Search saved routes..."]'
  );
  const loadPanel = searchInput?.closest("div.mt-4") as HTMLElement | null;
  const savedList = loadPanel
    ? (Array.from(loadPanel.querySelectorAll("div")).find((element) =>
        element.className.includes("max-h-80")
      ) as HTMLElement | undefined)
    : undefined;

  if (savedList) savedList.dataset.navlogSavedList = "true";

  return true;
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

    const syncUi = () => {
      if (cancelled) return;

      const root = rootRef.current;
      const select = root ? findAircraftSelect(root) : undefined;
      const routeWorkspaceReady = root ? decorateRouteWorkspace(root) : false;

      if (select) {
        setControlledSelect(select, aircraft);
        hideBaseAircraftControl(select);
      }

      attempt += 1;
      const minimumDecorationPasses = attempt < 10;
      if (
        attempt < 24 &&
        (minimumDecorationPasses || !select || !routeWorkspaceReady)
      ) {
        syncTimerRef.current = window.setTimeout(syncUi, 120);
      }
    };

    syncUi();

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
        <div className="space-y-6">
          <PreparationPageHeader
            step={2}
            title="NavLog"
            description={PAGE_DESCRIPTION}
          />
          <AircraftPicker choices={AIRCRAFT_CHOICES} onSelect={choose} />
        </div>
      ) : null}

      {started ? (
        <div className={showPicker ? "hidden" : "space-y-5"}>
          <PreparationPageHeader
            step={2}
            title="NavLog"
            description={PAGE_DESCRIPTION}
          />

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

          <div ref={rootRef} className="navlog-base-ui">
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
