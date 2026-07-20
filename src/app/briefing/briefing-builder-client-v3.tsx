"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { BriefingBuilderClient as BaseBriefingBuilderClient } from "./briefing-builder-client";
import {
  setBriefingAircraftOverride,
  setMissionObjectivesPdf,
  type BriefingAircraftOverride,
} from "@/lib/briefing-enhancements-store";

const P2006T_REGISTRATIONS = ["CS-EAQ", "CS-EBX", "D-GSEV"] as const;
const P2008_REGISTRATIONS = [
  "CS-DHS",
  "CS-DHT",
  "CS-DHU",
  "CS-DHV",
  "CS-DHW",
  "CS-ECC",
  "CS-ECD",
] as const;
const PA28_REGISTRATIONS = [
  "OE-KPD",
  "OE-KPE",
  "OE-KPJ",
  "OE-KPP",
  "OE-KPG",
  "OE-KPF",
  "OE-KPH",
] as const;

type AircraftTypeValue = "P2006T" | "P2008" | "PA28";

function nativeSelectValue(select: HTMLSelectElement, value: string) {
  if (select.value === value) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function findSelectByLabel(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll("label")).find((candidate) =>
    Array.from(candidate.querySelectorAll("span")).some(
      (span) => span.textContent?.trim() === labelText
    )
  );
  return label?.querySelector("select") as HTMLSelectElement | null;
}

function findMissionSection(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll("h3")).find(
    (candidate) => candidate.textContent?.trim() === "Mission details"
  );
  return (heading?.closest("section") as HTMLElement | null) ?? null;
}

function ensureOption(
  select: HTMLSelectElement,
  value: string,
  label: string,
  groupLabel?: string
) {
  if (select.querySelector(`option[value="${value}"]`)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  if (!groupLabel) {
    select.appendChild(option);
    return;
  }
  let group = Array.from(select.querySelectorAll("optgroup")).find(
    (item) => item.label === groupLabel
  );
  if (!group) {
    group = document.createElement("optgroup");
    group.label = groupLabel;
    select.appendChild(group);
  }
  group.appendChild(option);
}

function ensureAircraftOptions(root: HTMLElement) {
  const aircraftType = findSelectByLabel(root, "Aircraft type");
  const registration = findSelectByLabel(root, "Registration");
  if (aircraftType) {
    ensureOption(aircraftType, "P2006T", "Tecnam P2006T");
  }
  if (registration) {
    P2006T_REGISTRATIONS.forEach((value) =>
      ensureOption(registration, value, value, "Tecnam P2006T")
    );
  }
}

function aircraftTypeForRegistration(registration: string): AircraftTypeValue | null {
  if ((P2006T_REGISTRATIONS as readonly string[]).includes(registration)) {
    return "P2006T";
  }
  if ((P2008_REGISTRATIONS as readonly string[]).includes(registration)) {
    return "P2008";
  }
  if ((PA28_REGISTRATIONS as readonly string[]).includes(registration)) {
    return "PA28";
  }
  return null;
}

function defaultRegistrationFor(type: AircraftTypeValue) {
  if (type === "P2006T") return "D-GSEV";
  if (type === "P2008") return "CS-DHS";
  return "OE-KPE";
}

function registrationMatchesType(registration: string, type: AircraftTypeValue) {
  return aircraftTypeForRegistration(registration) === type;
}

function syncOverride(
  aircraftTypeSelect: HTMLSelectElement | null,
  registrationSelect: HTMLSelectElement | null
) {
  const registration = registrationSelect?.value ?? "";
  if (
    aircraftTypeSelect?.value === "P2006T" &&
    (P2006T_REGISTRATIONS as readonly string[]).includes(registration)
  ) {
    setBriefingAircraftOverride({
      enabled: true,
      aircraftType: "Tecnam P2006T",
      registration: registration as BriefingAircraftOverride["registration"],
    });
  } else {
    setBriefingAircraftOverride(null);
  }
}

export function BriefingBuilderClientV3() {
  const rootRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [missionSection, setMissionSection] = useState<HTMLElement | null>(null);
  const [objectivesName, setObjectivesName] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      ensureAircraftOptions(root);
      const aircraftTypeSelect = findSelectByLabel(root, "Aircraft type");
      const registrationSelect = findSelectByLabel(root, "Registration");

      if (!initializedRef.current && aircraftTypeSelect && registrationSelect) {
        initializedRef.current = true;
        nativeSelectValue(aircraftTypeSelect, "P2006T");
        nativeSelectValue(registrationSelect, "D-GSEV");
      }

      syncOverride(aircraftTypeSelect, registrationSelect);
      const section = findMissionSection(root);
      setMissionSection((current) => (current === section ? current : section));
    };

    const handleChange = (event: Event) => {
      const aircraftTypeSelect = findSelectByLabel(root, "Aircraft type");
      const registrationSelect = findSelectByLabel(root, "Registration");
      const target = event.target;

      queueMicrotask(() => {
        ensureAircraftOptions(root);
        if (!aircraftTypeSelect || !registrationSelect) {
          sync();
          return;
        }

        if (target === aircraftTypeSelect) {
          const type = aircraftTypeSelect.value as AircraftTypeValue;
          if (!registrationMatchesType(registrationSelect.value, type)) {
            nativeSelectValue(registrationSelect, defaultRegistrationFor(type));
          }
        } else if (target === registrationSelect) {
          const type = aircraftTypeForRegistration(registrationSelect.value);
          if (type && aircraftTypeSelect.value !== type) {
            nativeSelectValue(aircraftTypeSelect, type);
          }
        }
        syncOverride(aircraftTypeSelect, registrationSelect);
      });
    };

    sync();
    root.addEventListener("change", handleChange);
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true });

    return () => {
      root.removeEventListener("change", handleChange);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      setBriefingAircraftOverride(null);
      setMissionObjectivesPdf(null);
    };
  }, []);

  const objectivesUpload = (
    <div className="mt-6 border-t border-zinc-200 pt-6">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
        Mission objectives PDF
      </h3>
      <p className="mt-1 text-sm leading-6 text-zinc-500">
        Optional. The selected PDF is inserted directly after the mission summary.
      </p>
      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-6 text-center hover:bg-zinc-100">
        <span className="text-sm font-semibold text-zinc-950">
          {objectivesName || "Choose mission objectives PDF"}
        </span>
        <span className="mt-1 text-xs text-zinc-500">PDF only</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setMissionObjectivesPdf(file);
            setObjectivesName(file?.name ?? "");
            event.currentTarget.value = "";
          }}
        />
      </label>
      {objectivesName ? (
        <button
          type="button"
          onClick={() => {
            setMissionObjectivesPdf(null);
            setObjectivesName("");
          }}
          className="mt-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-red-600"
        >
          Remove objectives PDF
        </button>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef}>
      <BaseBriefingBuilderClient />
      {missionSection ? createPortal(objectivesUpload, missionSection) : null}
    </div>
  );
}
