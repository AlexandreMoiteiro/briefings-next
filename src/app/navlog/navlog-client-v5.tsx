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
import { NavlogClientV3 } from "./navlog-client-v3";
import { checkExportAccess } from "@/lib/export-access";
import { ExportBlockedDialog } from "@/components/export-blocked-dialog";

const AIRCRAFT = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
  "Cessna 152",
  "Custom aircraft",
] as const;

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

type Aircraft = (typeof AIRCRAFT)[number];

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
  if (optionIndex < 0 || select.value === value) return false;

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  return true;
}

function textElement(root: HTMLElement, selector: string, value: string) {
  return Array.from(root.querySelectorAll(selector)).find(
    (element) => element.textContent?.replace(/\s+/g, " ").trim() === value
  ) as HTMLElement | undefined;
}

function replaceText(root: HTMLElement, from: string, to: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue?.includes(from)) {
      node.nodeValue = node.nodeValue.replace(from, to);
    }
  }
}

function polishNavlogUi(root: HTMLElement) {
  const aircraftWarning = Array.from(root.querySelectorAll("strong")).find(
    (element) => element.textContent?.trim() === "Confirm the aircraft first."
  );
  const warningCard = aircraftWarning?.closest("div.rounded-2xl") as HTMLElement | null;
  if (warningCard) warningCard.hidden = true;

  replaceText(
    root,
    "Ground/taxi time is included in block time and taxi fuel. The Tecnam/Piper default is 20 minutes, but this is only a starting point. Set it to 0 if you only want airborne NavLog time, or adjust it to your own operation.",
    "Ground/taxi time is included in block time and taxi fuel. Review the value for the planned flight."
  );

  const routeHeading = textElement(
    root,
    "h2",
    "Build the route, manage saved routes, then check the current route"
  );
  if (routeHeading) {
    routeHeading.textContent = "Choose or build the route, then review it";
    const section = routeHeading.closest("section") as HTMLElement | null;
    if (section) section.dataset.navlogRouteWorkflow = "true";
  }

  const savedLabel = textElement(root, "p", "Saved routes");
  const savedCard = savedLabel?.closest("div.rounded-2xl") as HTMLElement | null;
  if (savedCard) {
    savedCard.dataset.navlogRouteCard = "saved";
    const parent = savedCard.parentElement;
    if (parent) {
      parent.dataset.navlogRouteGrid = "true";
      Array.from(parent.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === savedCard) return;
        const text = child.textContent?.replace(/\s+/g, " ") ?? "";
        if (text.includes("Create the working route")) {
          child.dataset.navlogRouteCard = "build";
        } else if (text.includes("Current map/table route")) {
          child.dataset.navlogRouteCard = "current";
        }
      });
    }

    const heading = savedCard.querySelector("h3");
    if (heading) heading.textContent = "Start from a saved route";
    const description = Array.from(savedCard.querySelectorAll("p")).find((item) =>
      (item.textContent ?? "").includes("Saved routes are stored separately")
    );
    if (description) {
      description.textContent =
        "Choose a saved route to load it into the working route. Use Save / edit only when you want to manage the saved copy.";
    }

    Array.from(savedCard.querySelectorAll("button")).forEach((button) => {
      const text = button.textContent?.trim();
      if (text === "Load") button.textContent = "Use saved route";
      if (text === "Manage") button.textContent = "Save / edit";
      if (text === "Load into map/table") button.textContent = "Use route";
    });

    Array.from(savedCard.querySelectorAll("p")).forEach((paragraph) => {
      const text = paragraph.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text.startsWith("Loading a saved route replaces")) {
        paragraph.textContent =
          "Using a saved route replaces the current working route. The saved copy is unchanged.";
      }
      if (text.includes("Select a saved route in Load before updating")) {
        paragraph.textContent =
          "Choose a saved route first if you want to update or delete it.";
      }
      if (text.includes("permanently deletes the selected saved route from Supabase")) {
        paragraph.textContent =
          "This permanently deletes the selected saved route. It does not clear only the working route.";
      }
    });

    const savedList = Array.from(savedCard.querySelectorAll("div")).find((element) =>
      element.className.includes("max-h-80")
    ) as HTMLElement | undefined;
    if (savedList) savedList.dataset.navlogSavedList = "true";
  }
}

export function NavlogClientV5() {
  const rootRef = useRef<HTMLDivElement>(null);
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
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const select = findAircraftSelect(root);
      if (select) {
        hideOriginalAircraftControl(select);
        if (select.value !== aircraft) changeSelect(select, aircraft);
      }
      polishNavlogUi(root);
    };

    sync();
    root.addEventListener("change", sync, true);
    const observer = new MutationObserver(() => queueMicrotask(sync));
    observer.observe(root, { subtree: true, childList: true });

    return () => {
      root.removeEventListener("change", sync, true);
      observer.disconnect();
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
                    <span className="text-3xl text-zinc-400">✈</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    NavLog aircraft
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
                <span className="block text-xs text-zinc-500">
                  Use your real name. Deliberately false names may be blocked from exports.
                </span>
              </label>
            </div>
          </section>

          <div ref={rootRef}>
            <NavlogClientV3 />
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
