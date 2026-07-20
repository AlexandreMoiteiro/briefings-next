"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { BriefingBuilderClient as BaseBriefingBuilderClient } from "./briefing-builder-client";
import {
  setBriefingAircraftOverride,
  setMissionObjectivesPdf,
  type BriefingAircraftOverride,
} from "@/lib/briefing-enhancements-store";

const P2006T_REGISTRATIONS: BriefingAircraftOverride["registration"][] = [
  "CS-EAQ",
  "CS-EBX",
  "D-GSEV",
];

function nativeSelectValue(select: HTMLSelectElement, value: string) {
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

function ensureP2006Options(root: HTMLElement) {
  const aircraftType = findSelectByLabel(root, "Aircraft type");
  if (aircraftType && !aircraftType.querySelector('option[value="P2006T"]')) {
    const option = document.createElement("option");
    option.value = "P2006T";
    option.textContent = "Tecnam P2006T";
    aircraftType.appendChild(option);
  }

  const registration = findSelectByLabel(root, "Registration");
  if (!registration) return;
  let group = Array.from(registration.querySelectorAll("optgroup")).find(
    (item) => item.label === "Tecnam P2006T"
  );
  if (!group) {
    group = document.createElement("optgroup");
    group.label = "Tecnam P2006T";
    registration.appendChild(group);
  }
  P2006T_REGISTRATIONS.forEach((value) => {
    if (registration.querySelector(`option[value="${value}"]`)) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    group?.appendChild(option);
  });
}

export function BriefingBuilderClientV2() {
  const legacyRootRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [missionSection, setMissionSection] = useState<HTMLElement | null>(null);
  const [objectivesName, setObjectivesName] = useState("");

  useEffect(() => {
    const root = legacyRootRef.current;
    if (!root) return;

    const sync = () => {
      ensureP2006Options(root);
      const registrationSelect = findSelectByLabel(root, "Registration");
      const aircraftTypeSelect = findSelectByLabel(root, "Aircraft type");

      if (!initializedRef.current && registrationSelect && aircraftTypeSelect) {
        initializedRef.current = true;
        nativeSelectValue(aircraftTypeSelect, "P2006T");
        nativeSelectValue(registrationSelect, "D-GSEV");
      }

      const registration = registrationSelect?.value;
      if (
        registrationSelect &&
        aircraftTypeSelect &&
        registration &&
        P2006T_REGISTRATIONS.includes(
          registration as BriefingAircraftOverride["registration"]
        ) &&
        aircraftTypeSelect.value !== "P2006T"
      ) {
        nativeSelectValue(aircraftTypeSelect, "P2006T");
      }

      if (
        aircraftTypeSelect?.value === "P2006T" &&
        registration &&
        P2006T_REGISTRATIONS.includes(
          registration as BriefingAircraftOverride["registration"]
        )
      ) {
        setBriefingAircraftOverride({
          enabled: true,
          aircraftType: "Tecnam P2006T",
          registration: registration as BriefingAircraftOverride["registration"],
        });
      } else {
        setBriefingAircraftOverride(null);
      }

      const section = findMissionSection(root);
      setMissionSection((current) => (current === section ? current : section));
    };

    const handleChange = () => queueMicrotask(sync);
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
    <div ref={legacyRootRef}>
      <BaseBriefingBuilderClient />
      {missionSection ? createPortal(objectivesUpload, missionSection) : null}
    </div>
  );
}
