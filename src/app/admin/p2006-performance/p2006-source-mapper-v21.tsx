"use client";

import { useEffect, useState } from "react";
import { P2006TSourceMapper as StableMapper } from "./p2006-source-mapper-v17";
import type { CaptureStore } from "./p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const MIGRATION_KEY = "briefings_p2006_merged_page_one_direct_image_v22";
const OLD_PAGE_ONE_PREFIX = "shared:form-page-1-fields:";
const NEW_PAGE_ONE_PREFIX = "shared:mass-balance-graph:";

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

export function P2006TSourceMapper() {
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

  if (!ready) {
    return (
      <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sm font-semibold text-sky-900">
        Restoring the page-one form and M&amp;B coordinates…
      </div>
    );
  }

  return <StableMapper />;
}
