"use client";

import Image from "next/image";
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
import { PreparationPageHeader } from "@/components/preparation-page-header";
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
  "Set the mission, build or load the route, verify it on the map, then review the calculated NavLog before the final Briefing.";

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

function setDisplayLabel(element: HTMLElement, label: string) {
  element.dataset.navlogDisplayLabel = label;
  element.setAttribute("aria-label", label);
}

function findButton(root: HTMLElement, values: string[]) {
  return Array.from(root.querySelectorAll("button")).find((button) => {
    const text = normalize(button.textContent);
    const aria = normalize(button.getAttribute("aria-label"));
    return values.some((value) => text === value || aria === value);
  }) as HTMLButtonElement | undefined;
}

function markSetupField(section: HTMLElement, labelText: string, role: string) {
  const label = Array.from(section.querySelectorAll("label")).find((candidate) =>
    normalize(candidate.textContent).startsWith(labelText)
  ) as HTMLElement | undefined;

  if (label) label.dataset.navlogSetupField = role;
}

function decorateSetup(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll("h2")).find((item) =>
    normalize(item.textContent).includes("flight setup and weather")
  ) as HTMLElement | undefined;

  if (!heading) return false;
  const section = heading.closest("section") as HTMLElement | null;
  if (!section) return false;

  section.dataset.navlogSetup = "true";
  setDisplayLabel(heading, "Mission setup");

  const noticeStrong = Array.from(section.querySelectorAll("strong")).find((item) =>
    normalize(item.textContent).includes("confirm the aircraft first")
  );
  const notice = noticeStrong?.closest("div") as HTMLElement | null;
  if (notice) notice.dataset.navlogSetupNotice = "true";

  markSetupField(section, "registration", "registration");
  markSetupField(section, "callsign", "callsign");
  markSetupField(section, "efob l", "efob");
  markSetupField(section, "off-blocks", "offblocks");
  markSetupField(section, "on-blocks", "onblocks");
  markSetupField(section, "lesson", "lesson");
  markSetupField(section, "instructor", "instructor");
  markSetupField(section, "student", "student");
  markSetupField(section, "wind from", "wind-from");
  markSetupField(section, "wind kt", "wind-kt");
  markSetupField(section, "alt add", "alt-add");
  markSetupField(section, "wind checked", "wind-check");

  const performanceButton = Array.from(section.querySelectorAll("button")).find(
    (button) => normalize(button.textContent) === "performance" || normalize(button.textContent) === "hide performance"
  );
  const performanceWrap = performanceButton?.parentElement;
  if (performanceWrap instanceof HTMLElement) {
    performanceWrap.dataset.navlogPerformanceToggle = "true";
  }

  return true;
}

function decorateReview(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (item) => normalize(item.textContent) === "working route plan"
  ) as HTMLElement | undefined;
  const section = heading?.closest("section") as HTMLElement | null;
  if (!section) return false;
  section.dataset.navlogReview = "true";
  return true;
}

function decorateWorkflow(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll("h2")).find((item) =>
    normalize(item.textContent).includes("complete each step before exporting")
  ) as HTMLElement | undefined;
  const section = heading?.closest("section") as HTMLElement | null;
  if (!section) return false;
  section.dataset.navlogLegacyWorkflow = "true";
  return true;
}

function decorateRouteWorkspace(root: HTMLElement) {
  const previouslyDecorated = root.querySelector(
    '[data-navlog-route-title="true"]'
  ) as HTMLElement | null;
  const routeHeading =
    previouslyDecorated ??
    (Array.from(root.querySelectorAll("h2")).find((heading) =>
      normalize(heading.textContent).includes("build the route, manage saved routes")
    ) as HTMLElement | undefined);
  if (!routeHeading) return false;

  const section = routeHeading.closest("section") as HTMLElement | null;
  if (!section) return false;

  section.dataset.navlogRouteWorkspace = "true";
  routeHeading.dataset.navlogRouteTitle = "true";
  setDisplayLabel(routeHeading, "Build or load the route");

  const planningFlow = section.parentElement;
  if (planningFlow instanceof HTMLElement) {
    planningFlow.dataset.navlogPlanningFlow = "true";

    const siblingSections = Array.from(planningFlow.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    );

    const mapToolbar = siblingSections.find((child) => {
      if (child === section || child.tagName !== "SECTION") return false;
      const heading = child.querySelector("h2");
      return normalize(heading?.textContent).includes(
        "build and check the route around the map"
      );
    });

    if (mapToolbar) {
      mapToolbar.dataset.navlogMapToolbar = "true";
      const mapHeading = mapToolbar.querySelector("h2") as HTMLElement | null;
      if (mapHeading) setDisplayLabel(mapHeading, "Map workspace");

      Array.from(mapToolbar.querySelectorAll("button")).forEach((button) => {
        const text = normalize(button.textContent);
        if (text === "route workflow") setDisplayLabel(button, "Route tools");
        if (text === "layers") setDisplayLabel(button, "Map layers");
      });
    }

    const mapCanvas = siblingSections.find(
      (child) => child.tagName === "MAIN"
    );
    if (mapCanvas) mapCanvas.dataset.navlogMapCanvas = "true";

    const layersPanel = siblingSections.find((child) => {
      if (child === section || child === mapToolbar || child.tagName !== "SECTION") {
        return false;
      }
      return normalize(child.textContent).includes("reference layers");
    });
    if (layersPanel) {
      layersPanel.dataset.navlogLayersPanel = "true";
      const labels = Array.from(layersPanel.querySelectorAll("label"));
      const manual = labels.find((label) =>
        normalize(label.textContent).includes("manual map click")
      ) as HTMLElement | undefined;
      const references = labels.find((label) =>
        normalize(label.textContent).startsWith("reference points")
      ) as HTMLElement | undefined;
      if (manual) manual.dataset.navlogManualControl = "true";
      if (references) references.dataset.navlogReferenceControl = "true";
    }
  }

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

  if (buildCard) {
    buildCard.dataset.navlogRouteCard = "build";
    const heading = buildCard.querySelector("h3") as HTMLElement | null;
    if (heading) setDisplayLabel(heading, "Build route");
  }

  if (currentCard) {
    currentCard.dataset.navlogRouteCard = "current";
    const heading = currentCard.querySelector("h3") as HTMLElement | null;
    if (heading) setDisplayLabel(heading, "Working route");
  }

  if (!savedCard) return false;
  savedCard.dataset.navlogRouteCard = "saved";

  const savedHeading = savedCard.querySelector("h3") as HTMLElement | null;
  if (savedHeading) setDisplayLabel(savedHeading, "Route library");

  Array.from(savedCard.querySelectorAll("button")).forEach((button) => {
    const text = normalize(button.textContent);
    if (text === "load") setDisplayLabel(button, "Browse");
    if (text === "manage") setDisplayLabel(button, "Save / edit");
    if (text === "load into map/table") setDisplayLabel(button, "Use route");
  });

  const searchInput = savedCard.querySelector(
    'input[placeholder="Search saved routes..."]'
  );
  const browsePanel = searchInput?.closest("div.mt-4") as HTMLElement | null;
  if (browsePanel) browsePanel.dataset.navlogSavedPanel = "browse";

  const savedList = browsePanel
    ? (Array.from(browsePanel.querySelectorAll("div")).find((element) =>
        element.className.includes("max-h-80")
      ) as HTMLElement | undefined)
    : undefined;
  if (savedList) savedList.dataset.navlogSavedList = "true";

  const nameInput = savedCard.querySelector(
    'input[placeholder="Saved route name..."]'
  );
  const managePanel = nameInput?.closest("div.mt-4") as HTMLElement | null;
  if (managePanel) {
    managePanel.dataset.navlogSavedPanel = "manage";

    const selectedLabel = Array.from(managePanel.querySelectorAll("p")).find(
      (paragraph) => normalize(paragraph.textContent) === "selected saved route"
    );
    const selectionCard = selectedLabel?.closest("div.rounded-xl") as HTMLElement | null;
    if (selectionCard) selectionCard.dataset.navlogSavedSelection = "true";

    const danger = managePanel.querySelector("details") as HTMLElement | null;
    if (danger) danger.dataset.navlogSavedDanger = "true";
  }

  return true;
}

function decorateNavlog(root: HTMLElement) {
  decorateWorkflow(root);
  decorateSetup(root);
  decorateReview(root);
  return decorateRouteWorkspace(root);
}

function MissionIdentityBar({
  aircraft,
  pilotName,
  imageSrc,
  onPilotNameChange,
  onChangeAircraft,
}: {
  aircraft: string;
  pilotName: string;
  imageSrc?: string;
  onPilotNameChange: (value: string) => void;
  onChangeAircraft: () => void;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm sm:px-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(320px,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50">
            {imageSrc ? (
              <Image
                src={imageSrc}
                alt={aircraft}
                fill
                sizes="80px"
                className="object-contain p-1.5"
              />
            ) : (
              <span className="text-2xl text-zinc-400" aria-hidden="true">✈</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Aircraft
            </p>
            <p className="mt-0.5 truncate text-base font-semibold text-zinc-950">
              {aircraft}
            </p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Pilot name · required for PDF
          </span>
          <input
            value={pilotName}
            onChange={(event) => onPilotNameChange(event.target.value)}
            autoComplete="name"
            placeholder="Enter your real name"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 outline-none transition focus:border-zinc-950"
          />
        </label>

        <div className="flex items-center gap-2 lg:justify-end">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              PDF identity
            </summary>
            <div className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-600 shadow-xl">
              Use your real name. It helps keep PDF exports available to everyone and protects the service from abuse. Deliberately false names may block PDF export access on this device.
            </div>
          </details>
          <button
            type="button"
            onClick={onChangeAircraft}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            Change aircraft
          </button>
        </div>
      </div>
    </section>
  );
}

function WorkbenchDock({ onAction }: { onAction: (action: string) => void }) {
  const actions = [
    { key: "setup", title: "Mission setup", note: "times · fuel · wind" },
    { key: "route", title: "Build or load", note: "route text · search · saved" },
    { key: "manual", title: "Add point on map", note: "manual waypoint mode" },
    { key: "layers", title: "Map layers", note: "reference points · overlays" },
    { key: "review", title: "Review NavLog", note: "waypoints · headings · EFOB" },
  ];

  return (
    <nav className="navlog-workbench-dock rounded-2xl border border-zinc-200 bg-zinc-950 p-2 shadow-sm" aria-label="NavLog workbench">
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => onAction(action.key)}
            className="rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10"
          >
            <span className="block text-sm font-semibold text-white">{action.title}</span>
            <span className="mt-0.5 block text-[11px] text-zinc-400">{action.note}</span>
          </button>
        ))}
      </div>
    </nav>
  );
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
      const routeWorkspaceReady = root ? decorateNavlog(root) : false;

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

  function redecorateSoon() {
    window.setTimeout(() => {
      const root = rootRef.current;
      if (root) decorateNavlog(root);
    }, 40);
  }

  function activateBaseMode(mode: "route" | "layers", after?: () => void) {
    const root = rootRef.current;
    if (!root) return;
    decorateNavlog(root);

    const button =
      mode === "route"
        ? findButton(root, ["route workflow", "route tools"])
        : findButton(root, ["layers", "map layers"]);

    button?.click();
    window.setTimeout(() => {
      const currentRoot = rootRef.current;
      if (currentRoot) decorateNavlog(currentRoot);
      after?.();
    }, 60);
  }

  function scrollTo(selector: string) {
    const element = rootRef.current?.querySelector(selector);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleWorkbenchAction(action: string) {
    const root = rootRef.current;
    if (!root) return;
    decorateNavlog(root);

    if (action === "setup") {
      scrollTo('[data-navlog-setup="true"]');
      return;
    }

    if (action === "route") {
      activateBaseMode("route", () =>
        scrollTo('[data-navlog-route-workspace="true"]')
      );
      return;
    }

    if (action === "layers") {
      activateBaseMode("layers", () =>
        scrollTo('[data-navlog-layers-panel="true"]')
      );
      return;
    }

    if (action === "manual") {
      activateBaseMode("layers", () => {
        const currentRoot = rootRef.current;
        const control = currentRoot?.querySelector(
          '[data-navlog-manual-control="true"] input[type="checkbox"]'
        );
        if (control instanceof HTMLInputElement && !control.checked) {
          control.click();
        }
        scrollTo('[data-navlog-map-canvas="true"]');
      });
      return;
    }

    if (action === "review") {
      scrollTo('[data-navlog-review="true"]');
    }
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    redecorateSoon();

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
        <div className={showPicker ? "hidden" : "space-y-4"}>
          <PreparationPageHeader
            step={2}
            title="NavLog"
            description={PAGE_DESCRIPTION}
          />

          <MissionIdentityBar
            aircraft={selected.name}
            pilotName={pilotName}
            imageSrc={selected.imageSrc}
            onPilotNameChange={updatePilotName}
            onChangeAircraft={() => setShowPicker(true)}
          />

          <WorkbenchDock onAction={handleWorkbenchAction} />

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
