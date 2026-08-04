import correctedOeiJson from "@/lib/performance/p2006t-oei-overlays.json";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  P2006T_ADDITIONAL_TABLES as BASE_TABLES,
  P2006T_LEGACY_OEI_STORAGE_KEY,
  centersToOuterRect,
  initialP2006TAdditionalTableMapping as initialBaseMapping,
  p2006TAdditionalTableKey,
  readP2006TAdditionalTableMappings as readBaseMappings,
  syncLegacyP2006TOeiMapping,
  type P2006TAdditionalTableDefinition,
  type P2006TAdditionalTableId,
  type P2006TAdditionalTableMappingStore,
  type P2006TAdditionalTableSource,
  type P2006TTableGrid,
  type P2006TTableMapping,
} from "./p2006t-additional-table-mapper";

export type {
  P2006TAdditionalTableDefinition,
  P2006TAdditionalTableId,
  P2006TAdditionalTableMappingStore,
  P2006TAdditionalTableSource,
  P2006TTableGrid,
  P2006TTableMapping,
};
export {
  P2006T_LEGACY_OEI_STORAGE_KEY,
  centersToOuterRect,
  p2006TAdditionalTableKey,
  syncLegacyP2006TOeiMapping,
};

export const P2006T_ADDITIONAL_TABLE_STORAGE_KEY =
  "briefings_p2006_additional_table_mapper_v2";

const REGISTRATIONS: P2006TRegistration[] = ["CS-EAQ", "CS-EBX", "D-GSEV"];

type CorrectedMapping = {
  columnCenters: number[];
  rowCenters: number[];
  confirmed: boolean;
  confidence: number;
  method: "pixel-refine";
  savedAt: string;
};

type CorrectedPayload = {
  version: number;
  mappings: Record<string, CorrectedMapping>;
};

const CORRECTED = correctedOeiJson as CorrectedPayload;

function correctedKey(registration: P2006TRegistration) {
  return p2006TAdditionalTableKey("oei-vyse", registration);
}

function correctedMapping(registration: P2006TRegistration): P2006TTableMapping {
  const source = CORRECTED.mappings[correctedKey(registration)];
  return {
    columnCenters: [...source.columnCenters],
    rowCenters: [...source.rowCenters],
    confirmed: true,
    confidence: source.confidence,
    method: "pixel-refine",
    savedAt: source.savedAt,
  };
}

function correctedSource(
  definition: P2006TAdditionalTableDefinition,
  registration: P2006TRegistration
): P2006TAdditionalTableSource {
  const source = definition.sourceByRegistration[registration];
  const mapping = correctedMapping(registration);
  return {
    image: source.image,
    sourceLabel: source.sourceLabel,
    columnCenters: [...mapping.columnCenters],
    rowCenters: [...mapping.rowCenters],
  };
}

export const P2006T_ADDITIONAL_TABLES: P2006TAdditionalTableDefinition[] =
  BASE_TABLES.map((definition) =>
    definition.id !== "oei-vyse"
      ? definition
      : {
          ...definition,
          description:
            "Map the aircraft-specific 6 × 24 OEI VySE matrix. The bundled geometry is the corrected, confirmed mapping supplied for each registration and remains directly draggable for later refinements.",
          sourceByRegistration: Object.fromEntries(
            REGISTRATIONS.map((registration) => [
              registration,
              correctedSource(definition, registration),
            ])
          ) as Record<P2006TRegistration, P2006TAdditionalTableSource>,
        }
  );

export function initialP2006TAdditionalTableMapping(
  definition: P2006TAdditionalTableDefinition,
  registration: P2006TRegistration
): P2006TTableMapping {
  return definition.id === "oei-vyse"
    ? correctedMapping(registration)
    : initialBaseMapping(definition, registration);
}

function parseStore(raw: string | null): P2006TAdditionalTableMappingStore {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as P2006TAdditionalTableMappingStore;
  } catch {
    return {};
  }
}

function savedAtMs(value: string | null | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readP2006TAdditionalTableMappings() {
  if (typeof window === "undefined") {
    return {} as P2006TAdditionalTableMappingStore;
  }

  const stored = parseStore(
    window.localStorage.getItem(P2006T_ADDITIONAL_TABLE_STORAGE_KEY)
  );
  const migratingToV2 = Object.keys(stored).length === 0;
  const store = migratingToV2 ? readBaseMappings() : stored;
  let changed = migratingToV2;

  for (const registration of REGISTRATIONS) {
    const key = correctedKey(registration);
    const corrected = correctedMapping(registration);
    const current = store[key];

    if (
      migratingToV2 ||
      !current ||
      savedAtMs(current.savedAt) <= savedAtMs(corrected.savedAt)
    ) {
      store[key] = corrected;
      changed = true;
    }
  }

  if (changed) {
    window.localStorage.setItem(
      P2006T_ADDITIONAL_TABLE_STORAGE_KEY,
      JSON.stringify(store)
    );
    for (const registration of REGISTRATIONS) {
      syncLegacyP2006TOeiMapping(
        registration,
        store[correctedKey(registration)]
      );
    }
  }

  return store;
}

export function writeP2006TAdditionalTableMappings(
  store: P2006TAdditionalTableMappingStore
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    P2006T_ADDITIONAL_TABLE_STORAGE_KEY,
    JSON.stringify(store)
  );
}
