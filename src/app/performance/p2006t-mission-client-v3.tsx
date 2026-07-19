"use client";

import { useEffect, useRef } from "react";
import { P2006TMissionClientV2 } from "./p2006t-mission-client-v2";

function updateControlledSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function replacePlanningCopy(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  nodes.forEach((node) => {
    const current = node.nodeValue ?? "";
    const next = current
      .replace(/OM\/POH planning margin/gi, "25% briefing/planning buffer")
      .replace(/OM\/POH/gi, "planning")
      .replace(/operational margin/gi, "briefing/planning buffer")
      .replace(/NOT COMPLIANT/g, "MARGIN NOT MET")
      .replace(/COMPLIANT/g, "MARGIN OK")
      .replace(
        /One page per aerodrome with takeoff and landing source tables\./gi,
        "Two readable pages per aerodrome: take-off tables and landing tables."
      );
    if (next !== current) node.nodeValue = next;
  });
}

function applySecondAlternateDefault(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll("p, h3, h4")).find(
    (element) => element.textContent?.trim() === "Alternate 2"
  );
  const card = heading?.closest("div.rounded-2xl") ?? heading?.parentElement;
  const select = card?.querySelector("select") as HTMLSelectElement | null;
  if (select && select.value === "LPBJ") {
    updateControlledSelect(select, "LPCB");
  }
}

export function P2006TMissionClientV3() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => {
      applySecondAlternateDefault(root);
      replacePlanningCopy(root);
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="space-y-4">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        The 25% figure is shown as a briefing/planning buffer. It is not an
        additional AFM correction and does not replace the applicable OM rule.
        Paved-runway corrections are applied from the published P2006T tables.
      </section>
      <P2006TMissionClientV2 />
    </div>
  );
}
