"use client";

import { useEffect, useRef } from "react";
import type { PerformanceAircraft } from "@/lib/performance/mb";
import { StandardAircraftClient as BaseStandardAircraftClient } from "./standard-aircraft-client";

function normalizeP2008Alternate(root: HTMLElement) {
  const headings = Array.from(root.querySelectorAll("p, h3, h4"));
  const alternate1 = headings.find(
    (element) => element.textContent?.trim() === "Alternate 1"
  );
  if (alternate1) alternate1.textContent = "Alternate";

  const alternate2 = headings.find(
    (element) => element.textContent?.trim() === "Alternate 2"
  );
  const card = alternate2?.closest("div.rounded-2xl") as HTMLElement | null;
  if (card) card.hidden = true;
}

export function StandardAircraftClientV2({
  aircraft,
}: {
  aircraft: PerformanceAircraft;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aircraft !== "Tecnam P2008") return;
    const root = rootRef.current;
    if (!root) return;

    const apply = () => normalizeP2008Alternate(root);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, [aircraft]);

  return (
    <div ref={rootRef}>
      <BaseStandardAircraftClient aircraft={aircraft} />
    </div>
  );
}
