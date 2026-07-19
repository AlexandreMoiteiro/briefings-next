"use client";

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
  const [useP2006T, setUseP2006T] = useState(false);
  const [registration, setRegistration] =
    useState<BriefingAircraftOverride["registration"]>("D-GSEV");
  const [objectivesName, setObjectivesName] = useState("");

  useEffect(() => {
    const root = legacyRootRef.current;
    if (!root) return;

    const sync = () => {
      ensureP2006Options(root);
      if (!useP2006T) return;
      const registrationSelect = findSelectByLabel(root, "Registration");
      const aircraftTypeSelect = findSelectByLabel(root, "Aircraft type");
      if (registrationSelect && registrationSelect.value !== registration) {
        nativeSelectValue(registrationSelect, registration);
      }
      if (aircraftTypeSelect && aircraftTypeSelect.value !== "P2006T") {
        nativeSelectValue(aircraftTypeSelect, "P2006T");
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, [registration, useP2006T]);

  useEffect(() => {
    setBriefingAircraftOverride(
      useP2006T
        ? {
            enabled: true,
            aircraftType: "Tecnam P2006T",
            registration,
          }
        : null
    );
  }, [registration, useP2006T]);

  useEffect(() => {
    return () => {
      setBriefingAircraftOverride(null);
      setMissionObjectivesPdf(null);
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Tecnam P2006T
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Enable the P2006T and choose the registration to be used in the
              mission summary and final briefing PDF.
            </p>
            <label className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-200 p-3">
              <input
                type="checkbox"
                checked={useP2006T}
                onChange={(event) => setUseP2006T(event.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-zinc-800">
                Use Tecnam P2006T
              </span>
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Registration
              </span>
              <select
                value={registration}
                disabled={!useP2006T}
                onChange={(event) =>
                  setRegistration(
                    event.target.value as BriefingAircraftOverride["registration"]
                  )
                }
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm disabled:bg-zinc-100"
              >
                {P2006T_REGISTRATIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Mission objectives PDF
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Optional. When supplied, this PDF is placed directly after the
              mission summary in the generated briefing.
            </p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-7 text-center hover:bg-zinc-100">
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
        </div>
      </section>

      <div ref={legacyRootRef}>
        <BaseBriefingBuilderClient />
      </div>
    </div>
  );
}
