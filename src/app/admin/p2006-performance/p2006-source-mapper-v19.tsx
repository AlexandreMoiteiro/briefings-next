"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { P2006TSourceMapper as PreviousMapper } from "./p2006-source-mapper-v17";
import type { CaptureStore } from "./p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const GRID_META_KEY = "briefings_p2006_auto_grid_meta_v17";
const MIGRATION_KEY = "briefings_p2006_stable_form_surface_v19";

function removeStaleAutomaticGrids(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };

  for (const key of Object.keys(next)) {
    if (key.startsWith("performance-") && key.endsWith(":auto-grid-detection")) {
      delete next[key];
    }
  }

  return next;
}

function formPageFromImage(image: HTMLImageElement): "1" | "2" {
  return image.alt.trim().endsWith("2") ? "2" : "1";
}

function stabilizeFormSurface(image: HTMLImageElement) {
  const page = formPageFromImage(image);
  const source = `/api/p2006-form-page-${page}?v=19`;
  const surface = image.parentElement;

  if (!surface) return;

  surface.dataset.formPageSurface = page;
  surface.style.aspectRatio = "595.28 / 841.89";
  surface.style.backgroundImage = `url("${source}")`;
  surface.style.backgroundPosition = "center top";
  surface.style.backgroundRepeat = "no-repeat";
  surface.style.backgroundSize = "100% 100%";
  surface.style.minHeight = "420px";

  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "auto";
  image.style.minHeight = "420px";
  image.style.objectFit = "contain";
  image.style.opacity = "0";

  if (image.getAttribute("src") !== source) {
    image.setAttribute("src", source);
  }

  image.onload = () => {
    image.style.opacity = "1";
    image.style.minHeight = "0";
    surface.style.minHeight = "0";
  };

  image.onerror = () => {
    // The CSS background uses the same validated endpoint and keeps the
    // coordinate surface visible even when the image element itself fails.
    image.style.opacity = "0";
    image.style.minHeight = "420px";
    surface.style.minHeight = "420px";
  };
}

function stabilizeAllFormSurfaces(root: HTMLElement) {
  const images = root.querySelectorAll<HTMLImageElement>(
    "img[alt^='P2006T form page']"
  );

  images.forEach(stabilizeFormSurface);
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

    stabilizeAllFormSurfaces(root);

    const observer = new MutationObserver(() => {
      stabilizeAllFormSurfaces(root);
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
        <PreviousMapper />
      ) : (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sm font-semibold text-sky-900">
          Restoring the visual audit mapper…
        </div>
      )}
    </div>
  );
}
