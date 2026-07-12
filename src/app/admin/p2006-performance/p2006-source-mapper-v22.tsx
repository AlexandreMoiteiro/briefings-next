"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { P2006TSourceMapper as StableMapper } from "./p2006-source-mapper-v17";
import type { CaptureStore } from "./p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const MIGRATION_KEY = "briefings_p2006_static_page_one_asset_v23";
const OLD_PAGE_ONE_PREFIX = "shared:form-page-1-fields:";
const NEW_PAGE_ONE_PREFIX = "shared:mass-balance-graph:";
const PAGE_ONE_SOURCE = "/p2006-form-pages/page-1.webp?v=23";

function migrateSavedCoordinates(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };

  for (const [key, capture] of Object.entries(input)) {
    if (!key.startsWith(OLD_PAGE_ONE_PREFIX)) continue;

    const newKey = `${NEW_PAGE_ONE_PREFIX}${key.slice(OLD_PAGE_ONE_PREFIX.length)}`;
    if (!next[newKey]) next[newKey] = capture;
    delete next[key];
  }

  return next;
}

function repairPageOneImage(root: HTMLElement) {
  const image = root.querySelector<HTMLImageElement>(
    "img[alt='P2006T form page 1']"
  );

  if (!image) return;

  const current = image.getAttribute("src") ?? "";
  if (current === PAGE_ONE_SOURCE) return;

  image.removeAttribute("srcset");
  image.setAttribute("src", PAGE_ONE_SOURCE);
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "auto";
  image.style.opacity = "1";
  image.style.visibility = "visible";
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
            JSON.stringify(migrateSavedCoordinates(parsed))
          );
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      window.localStorage.setItem(MIGRATION_KEY, "1");
    }

    setReady(true);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;

    repairPageOneImage(root);

    const observer = new MutationObserver(() => {
      repairPageOneImage(root);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    return () => observer.disconnect();
  }, [ready]);

  return (
    <div ref={rootRef}>
      {ready ? (
        <StableMapper />
      ) : (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sm font-semibold text-sky-900">
          Loading the original page-one form image…
        </div>
      )}
    </div>
  );
}
