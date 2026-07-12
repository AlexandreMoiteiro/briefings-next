"use client";

import { useEffect, useState } from "react";
import { P2006TSourceMapper as EndpointGridMapper } from "./p2006-source-mapper-v13";
import type { CaptureStore } from "./p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const MIGRATION_KEY = "briefings_p2006_endpoint_grid_v14";

function removeObsoletePerformanceGridSeeds(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };

  for (const key of Object.keys(next)) {
    const isPerformanceKey = key.startsWith("performance-");
    const isOldGridGeometry =
      key.endsWith(":column-seed") ||
      key.endsWith(":row-seed") ||
      key.endsWith(":grid-confirmation");

    if (isPerformanceKey && isOldGridGeometry) {
      delete next[key];
    }
  }

  return next;
}

export function P2006TSourceMapper() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const migrated = window.localStorage.getItem(MIGRATION_KEY) === "1";

    if (!migrated) {
      const saved = window.localStorage.getItem(STORAGE_KEY);

      if (saved) {
        try {
          const parsed = JSON.parse(saved) as CaptureStore;
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(removeObsoletePerformanceGridSeeds(parsed))
          );
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      window.localStorage.setItem(MIGRATION_KEY, "1");
    }

    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sm font-semibold text-sky-900">
        Updating table calibration…
      </div>
    );
  }

  return <EndpointGridMapper />;
}
