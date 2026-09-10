"use client";

import { useEffect, useRef } from "react";
import type { PerformanceAircraft } from "@/lib/performance/mb";
import { PerformanceUsageTracker } from "./performance-usage-tracker";
import { StandardAircraftClientV3 } from "./standard-aircraft-client-v3";
import { enhanceAerodromePerformance } from "./aerodrome-performance-ui";

export function StandardAircraftClientV4({
  aircraft,
}: {
  aircraft: PerformanceAircraft;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => enhanceAerodromePerformance(root);
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [aircraft]);

  return (
    <div ref={rootRef}>
      <PerformanceUsageTracker aircraft={aircraft}>
        <StandardAircraftClientV3 aircraft={aircraft} />
      </PerformanceUsageTracker>
    </div>
  );
}
