"use client";

import type { PerformanceAircraft } from "@/lib/performance/mb";
import { PerformanceUsageTracker } from "./performance-usage-tracker";
import { StandardAircraftClientV3 } from "./standard-aircraft-client-v3";

export function StandardAircraftClientV4({
  aircraft,
}: {
  aircraft: PerformanceAircraft;
}) {
  return (
    <PerformanceUsageTracker aircraft={aircraft}>
      <StandardAircraftClientV3 aircraft={aircraft} />
    </PerformanceUsageTracker>
  );
}
