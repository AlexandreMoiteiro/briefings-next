"use client";

import { useEffect, useState } from "react";
import { ensureBundledP2006Form } from "./p2006-form-storage";
import { P2006TSourceMapper as SharedFormMapper } from "./p2006-source-mapper-v26";
import type { Capture, CaptureStore } from "./p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const MIGRATION_KEY = "briefings_p2006_single_robust_mb_v27";
const DESTINATION_PREFIX = "shared:mass-balance-graph:";
const SOURCE_PREFIXES = [
  DESTINATION_PREFIX,
  "shared:form-page-1-fields:",
  "shared:form-page-1-cs-eaq:",
  "shared:form-page-1-cs-ebx:",
  "shared:form-page-1-d-gsev:",
] as const;

const REUSABLE_STEP_IDS = [
  "pilot-front-seat-mass",
  "rear-seats-mass",
  "fuel-mass",
  "baggage-mass",
  "front-seat-max-guide",
  "rear-seat-max-guide",
  "fuel-max-guide",
  "baggage-max-guide",
  "cg-16-5-mac",
  "cg-23-mac",
  "cg-31-mac",
  "mass-limit-1180",
  "mass-limit-1230",
] as const;

function firstCapture(
  input: CaptureStore,
  stepId: string
): Capture | undefined {
  for (const prefix of SOURCE_PREFIXES) {
    const candidate = input[`${prefix}${stepId}`];
    if (candidate?.confirmed) return candidate;
  }

  for (const prefix of SOURCE_PREFIXES) {
    const candidate = input[`${prefix}${stepId}`];
    if (candidate) return candidate;
  }

  return undefined;
}

function migrateCaptures(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };

  for (const stepId of REUSABLE_STEP_IDS) {
    const destination = `${DESTINATION_PREFIX}${stepId}`;
    if (next[destination]?.confirmed) continue;

    const candidate = firstCapture(input, stepId);
    if (candidate) next[destination] = candidate;
  }

  return next;
}

export function P2006TSourceMapper() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      if (window.localStorage.getItem(MIGRATION_KEY) !== "1") {
        const raw = window.localStorage.getItem(STORAGE_KEY);

        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CaptureStore;
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(migrateCaptures(parsed))
            );
          } catch {
            window.localStorage.removeItem(STORAGE_KEY);
          }
        }

        window.localStorage.setItem(MIGRATION_KEY, "1");
      }

      try {
        await ensureBundledP2006Form();
      } catch (error) {
        console.warn("Unable to prepare bundled P2006T form pages", error);
      }

      if (!cancelled) setReady(true);
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5 text-sm font-semibold text-sky-900">
        Preparing the official P2006T form and shared M&amp;B geometry…
      </div>
    );
  }

  return <SharedFormMapper />;
}
