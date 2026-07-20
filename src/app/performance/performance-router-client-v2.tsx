"use client";

import { useEffect, useRef } from "react";
import { PerformanceRouterClient as BasePerformanceRouterClient } from "./performance-router-client";
import { formatOperationalMinutes } from "@/lib/operational-duration";

function formatLongMinuteText(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "OPTION"].includes(parent.tagName)) return;

    const current = node.nodeValue ?? "";
    const next = current.replace(/\b(\d+)\s+min\b/g, (match, rawMinutes) => {
      const minutes = Number(rawMinutes);
      return Number.isFinite(minutes) && minutes >= 60
        ? formatOperationalMinutes(minutes)
        : match;
    });

    if (next !== current) node.nodeValue = next;
  });
}

export function PerformanceRouterClientV2() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => formatLongMinuteText(root);
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <BasePerformanceRouterClient />
    </div>
  );
}
