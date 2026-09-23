"use client";

import { useMemo, useState } from "react";
import {
  AircraftPicker,
  type AircraftChoice,
} from "@/components/aircraft-picker";
import { PreparationPageHeader } from "@/components/preparation-page-header";
import { SelectedAircraftCard } from "@/components/selected-aircraft-card";
import { C152ClientV3 } from "./c152-client-v3";
import { P2006TMissionClient } from "./p2006t-mission-client";
import { PerformanceUsageTracker } from "./performance-usage-tracker";
import { PerformanceWorkspace } from "./performance-workspace";
import { StandardAircraftClientV4 } from "./standard-aircraft-client-v4";

type PerformanceMode = "P2006T" | "P2008" | "PA28" | "C152";

const OPTIONS: readonly AircraftChoice<PerformanceMode>[] = [
  {
    value: "P2006T",
    name: "Tecnam P2006T",
    registrations: "CS-EAQ · CS-EBX · D-GSEV",
    imageSrc: "/aircraft/p2006.png",
    imageAlt: "Tecnam P2006T",
  },
  {
    value: "P2008",
    name: "Tecnam P2008",
    registrations: "CS-DHS · CS-DHT · CS-DHU · CS-DHV · CS-DHW · CS-ECC · CS-ECD",
    imageSrc: "/aircraft/p2008.png",
    imageAlt: "Tecnam P2008",
  },
  {
    value: "PA28",
    name: "Piper PA-28",
    registrations: "OE-KPD · OE-KPE · OE-KPJ · OE-KPP · OE-KPG · OE-KPF · OE-KPH",
    imageSrc: "/aircraft/pa28.png",
    imageAlt: "Piper PA-28",
  },
  {
    value: "C152",
    name: "Cessna 152",
    registrations: "CS-AVC",
    imageSrc: "/aircraft/c152.png",
    imageAlt: "Cessna 152",
  },
];

const PAGE_DESCRIPTION =
  "Complete aircraft loading, fuel planning and runway performance first. The NavLog and final Briefing come afterwards.";

export function PerformanceRouterClient() {
  const [mode, setMode] = useState<PerformanceMode | null>(null);
  const selected = useMemo(
    () => OPTIONS.find((option) => option.value === mode) ?? null,
    [mode]
  );

  if (!mode || !selected) {
    return (
      <div className="space-y-6">
        <PreparationPageHeader
          step={1}
          title="Performance"
          description={PAGE_DESCRIPTION}
        />
        <AircraftPicker choices={OPTIONS} onSelect={setMode} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PreparationPageHeader
        step={1}
        title="Performance"
        description={PAGE_DESCRIPTION}
      />

      <SelectedAircraftCard
        name={selected.name}
        registrations={selected.registrations}
        imageSrc={selected.imageSrc}
        onChange={() => setMode(null)}
      />

      <div
        className="performance-consumer space-y-4"
        data-performance-mode={mode}
      >
        <PerformanceWorkspace mode={mode}>
          {mode === "P2006T" ? <P2006TMissionClient /> : null}
          {mode === "P2008" ? (
            <StandardAircraftClientV4 aircraft="Tecnam P2008" />
          ) : null}
          {mode === "PA28" ? (
            <StandardAircraftClientV4 aircraft="Piper PA-28" />
          ) : null}
          {mode === "C152" ? (
            <PerformanceUsageTracker aircraft="Cessna 152">
              <C152ClientV3 />
            </PerformanceUsageTracker>
          ) : null}
        </PerformanceWorkspace>
      </div>
    </div>
  );
}
