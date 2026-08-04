"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  P2006T_ADDITIONAL_TABLES,
  P2006T_ADDITIONAL_TABLE_STORAGE_KEY,
  P2006T_LEGACY_OEI_STORAGE_KEY,
} from "@/lib/performance/p2006t-additional-table-mapper";
import { P2006TSourceMapper } from "./p2006-source-mapper";
import {
  STAGES,
  type Capture,
  type CaptureStore,
  type GuidedStep,
  type Stage,
} from "./p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const GRID_META_KEY = "briefings_p2006_auto_grid_meta_v17";
const MIGRATION_KEY = "briefings_p2006_merged_page_one_shell_v11";
const OLD_PAGE_ONE_PREFIX = "shared:form-page-1-fields:";
const NEW_PAGE_ONE_PREFIX = "shared:mass-balance-graph:";
const LEGACY_PANEL_TOKEN = "shared:mass-balance-graph:panel-";
const GUIDE_IDS = [
  "front-seat-max-guide",
  "rear-seat-max-guide",
  "fuel-max-guide",
  "baggage-max-guide",
];

type ImportSummary = {
  kept: number;
  removed: number;
  migrated: number;
  source: string;
};

function mappingKey(
  stage: Stage,
  registration: P2006TRegistration,
  step: GuidedStep
) {
  return stage.type === "performance"
    ? `${stage.id}:${registration}:${step.id}`
    : `shared:${stage.id}:${step.id}`;
}

function validKeys() {
  const keys = new Set<string>();

  for (const stage of STAGES) {
    if (stage.type === "performance") {
      for (const registration of P2006T_REGISTRATIONS) {
        for (const step of stage.steps) {
          keys.add(mappingKey(stage, registration, step));
        }
      }
    } else {
      for (const step of stage.steps) {
        keys.add(mappingKey(stage, "CS-EAQ", step));
      }
    }
  }

  return keys;
}

function looksLikeCapture(value: unknown): value is Capture {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Capture>;
  return (
    typeof candidate.kind === "string" &&
    Array.isArray(candidate.points) &&
    typeof candidate.confirmed === "boolean"
  );
}

function flattenImportedPayload(payload: unknown): CaptureStore {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const captures: CaptureStore = {};

  const addRecord = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, candidate] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (looksLikeCapture(candidate)) {
        captures[key] = {
          kind: candidate.kind,
          points: candidate.points,
          rect: candidate.rect,
          confirmed: candidate.confirmed,
        };
      }
    }
  };

  addRecord(root.captures);
  addRecord(root.sharedFormAndGraph);

  if (
    root.performanceByRegistration &&
    typeof root.performanceByRegistration === "object"
  ) {
    for (const value of Object.values(
      root.performanceByRegistration as Record<string, unknown>
    )) {
      addRecord(value);
    }
  }

  if (Object.keys(captures).length === 0) addRecord(root);
  return captures;
}

function migratePageOneCaptures(input: CaptureStore) {
  const next: CaptureStore = { ...input };
  let migrated = 0;

  for (const [key, capture] of Object.entries(input)) {
    if (!key.startsWith(OLD_PAGE_ONE_PREFIX)) continue;

    const newKey = `${NEW_PAGE_ONE_PREFIX}${key.slice(OLD_PAGE_ONE_PREFIX.length)}`;
    if (!next[newKey]) {
      next[newKey] = capture;
      migrated += 1;
    }
    delete next[key];
  }

  return { captures: next, migrated };
}

function cleanCaptures(input: CaptureStore) {
  const migratedInput = migratePageOneCaptures(input);
  const allowed = validKeys();
  const hadLegacyPanels = Object.keys(migratedInput.captures).some((key) =>
    key.includes(LEGACY_PANEL_TOKEN)
  );
  const cleaned: CaptureStore = {};

  for (const [key, capture] of Object.entries(migratedInput.captures)) {
    if (!allowed.has(key)) continue;
    if (
      hadLegacyPanels &&
      GUIDE_IDS.some((guideId) => key.endsWith(`:${guideId}`))
    ) {
      continue;
    }
    cleaned[key] = capture;
  }

  return {
    captures: cleaned,
    kept: Object.keys(cleaned).length,
    removed: Object.keys(input).length - Object.keys(cleaned).length,
    migrated: migratedInput.migrated,
  };
}

export function P2006TSourceMapperShellV11() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [mapperKey, setMapperKey] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const totalExpected = useMemo(() => {
    const shared = STAGES.filter((stage) => stage.type !== "performance").reduce(
      (sum, stage) => sum + stage.steps.length,
      0
    );
    const perAircraft = STAGES.filter(
      (stage) => stage.type === "performance"
    ).reduce((sum, stage) => sum + stage.steps.length, 0);
    const additionalPerAircraft = P2006T_ADDITIONAL_TABLES.length;
    return (
      shared +
      (perAircraft + additionalPerAircraft) * P2006T_REGISTRATIONS.length
    );
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const alreadyMigrated = window.localStorage.getItem(MIGRATION_KEY) === "1";

    if (saved && !alreadyMigrated) {
      try {
        const cleaned = cleanCaptures(JSON.parse(saved) as CaptureStore);
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(cleaned.captures)
        );
        window.localStorage.setItem(MIGRATION_KEY, "1");
        setSummary({
          kept: cleaned.kept,
          removed: cleaned.removed,
          migrated: cleaned.migrated,
          source: "existing browser progress",
        });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setReady(true);
  }, []);

  async function importJson(file: File) {
    try {
      const flattened = flattenImportedPayload(
        JSON.parse(await file.text()) as unknown
      );
      const cleaned = cleanCaptures(flattened);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(cleaned.captures)
      );
      window.localStorage.setItem(MIGRATION_KEY, "1");
      setSummary({
        kept: cleaned.kept,
        removed: cleaned.removed,
        migrated: cleaned.migrated,
        source: file.name,
      });
      setMapperKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      setSummary({
        kept: 0,
        removed: 0,
        migrated: 0,
        source: "Invalid JSON file",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearProgress() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(GRID_META_KEY);
    window.localStorage.removeItem(P2006T_ADDITIONAL_TABLE_STORAGE_KEY);
    window.localStorage.removeItem(P2006T_LEGACY_OEI_STORAGE_KEY);
    window.localStorage.setItem(MIGRATION_KEY, "1");
    setSummary({ kept: 0, removed: 0, migrated: 0, source: "blank map" });
    setMapperKey((value) => value + 1);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Resume existing audit work
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">
              Form page 1 and M&amp;B now share one physical page
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-600">
              Importing an older JSON moves the four page-one field rectangles into
              the M&amp;B page automatically. Existing graph points, guide lines and
              page-two fields are preserved. Starting blank now clears all take-off,
              landing, climb, OEI and cruise mappings together.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importJson(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Import coordinate JSON
            </button>
            <button
              type="button"
              onClick={clearProgress}
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800"
            >
              Start blank
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span className="rounded-full bg-white px-3 py-1 font-semibold">
            {totalExpected} mapping items
          </span>
          {summary ? (
            <span className="rounded-full bg-white px-3 py-1 font-semibold">
              {summary.source}: {summary.kept} kept · {summary.migrated} moved to
              page 1 · {summary.removed} removed
            </span>
          ) : null}
        </div>
      </section>

      {ready ? <P2006TSourceMapper key={mapperKey} /> : null}
    </div>
  );
}
