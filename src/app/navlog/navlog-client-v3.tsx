"use client";

import { useEffect, useRef } from "react";
import { NavlogClientV2 } from "./navlog-client-v2";
import { formatOperationalMinutes } from "@/lib/operational-duration";

function normalizeLongClock(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;

  const first = Number(match[1]);
  const second = Number(match[2]);

  // NavLog rounds HOLD MAX to five-minute increments. A non-zero second
  // component in a small clock value therefore represents HH:MM, not MM:SS.
  if (first < 24 && second > 0) {
    return formatOperationalMinutes(first * 60 + second);
  }

  return value;
}

function normalizeSummaryEte(root: HTMLElement) {
  const label = Array.from(root.querySelectorAll("p")).find(
    (item) => item.textContent?.trim() === "ETE"
  );
  const value = label?.parentElement?.querySelector("p.font-semibold");
  if (!(value instanceof HTMLElement)) return;

  const current = value.textContent?.trim() ?? "";
  const next = normalizeLongClock(current);
  if (next !== current) value.textContent = next;
}

function normalizeHoldMax(root: HTMLElement) {
  Array.from(root.querySelectorAll("div")).forEach((element) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text.startsWith("HOLD MAX")) return;

    const match = text.match(/HOLD MAX\s+(\d{1,2}:\d{2})/);
    if (!match) return;
    const normalized = normalizeLongClock(match[1]);
    if (normalized === match[1]) return;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.nodeValue?.includes(match[1])) {
        node.nodeValue = node.nodeValue.replace(match[1], normalized);
        break;
      }
    }
  });
}

export function NavlogClientV3() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => {
      normalizeSummaryEte(root);
      normalizeHoldMax(root);
    };

    apply();
    const observer = new MutationObserver(() => queueMicrotask(apply));
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <NavlogClientV2 />
    </div>
  );
}
