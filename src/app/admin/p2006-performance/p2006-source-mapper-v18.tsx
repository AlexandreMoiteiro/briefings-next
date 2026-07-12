"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { P2006TSourceMapper as PreviousMapper } from "./p2006-source-mapper-v17";
import type { CaptureStore } from "./p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const GRID_META_KEY = "briefings_p2006_auto_grid_meta_v17";
const MIGRATION_KEY = "briefings_p2006_continuous_grid_v18";

function removeStaleAutomaticGrids(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };
  for (const key of Object.keys(next)) {
    if (key.startsWith("performance-") && key.endsWith(":auto-grid-detection")) {
      delete next[key];
    }
  }
  return next;
}

function replaceFormImages(root: HTMLElement) {
  const images = root.querySelectorAll<HTMLImageElement>("img[alt^='P2006T form page']");
  images.forEach((image) => {
    const page = image.alt.endsWith("2") ? "2" : "1";
    const target = `/api/p2006-form-page-${page}?v=18`;
    if (image.getAttribute("src") !== target) image.setAttribute("src", target);
  });
}

export function P2006TSourceMapper() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(MIGRATION_KEY) !== "1") {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as CaptureStore;
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(removeStaleAutomaticGrids(parsed))
          );
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      window.localStorage.removeItem(GRID_META_KEY);
      window.localStorage.setItem(MIGRATION_KEY, "1");
    }
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;

    replaceFormImages(root);
    const observer = new MutationObserver(() => replaceFormImages(root));
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div ref={rootRef}>
      {ready ? <PreviousMapper /> : <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sm font-semibold text-sky-900">Refreshing automatic table geometry…</div>}
    </div>
  );
}
