"use client";

import { PerformanceUsageTracker } from "./performance-usage-tracker";
import { P2006TMissionClientV8 } from "./p2006t-mission-client-v8";

export function P2006TMissionClientV9() {
  return (
    <PerformanceUsageTracker aircraft="Tecnam P2006T">
      <P2006TMissionClientV8 />
    </PerformanceUsageTracker>
  );
}
