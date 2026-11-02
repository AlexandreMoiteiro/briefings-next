import cruiseOverlaysJson from "@/lib/performance/p2006t-climb-cruise-overlays.json";
import enrouteOverlaysJson from "@/lib/performance/p2006t-enroute-overlays.json";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

export const P2006T_ADDITIONAL_TABLE_STORAGE_KEY =
  "briefings_p2006_additional_table_mapper_v1";
export const P2006T_LEGACY_OEI_STORAGE_KEY =
  "briefings_p2006_oei_mapper_v1";

export type P2006TAdditionalTableId =
  | "enroute-vy"
  | "enroute-vx"
  | "oei-vyse"
  | "cruise-0"
  | "cruise-3000"
  | "cruise-6000"
  | "cruise-9000";

export type P2006TTableGrid = {
  columnCenters: number[];
  rowCenters: number[];
};

export type P2006TTableMapping = P2006TTableGrid & {
  confirmed: boolean;
  confidence: number;
  method: "afm-overlay" | "pixel-refine" | "manual-box" | "legacy-oei";
  savedAt: string | null;
};

export type P2006TAdditionalTableMappingStore = Record<
  string,
  P2006TTableMapping
>;

export type P2006TAdditionalTableSource = P2006TTableGrid & {
  image: string;
  sourceLabel: string;
};

export type P2006TAdditionalTableDefinition = {
  id: P2006TAdditionalTableId;
  shortTitle: string;
  title: string;
  group: "Enroute climb" | "OEI" | "Cruise";
  description: string;
  sourceByRegistration: Record<
    P2006TRegistration,
    P2006TAdditionalTableSource
  >;
};

type Overlay = { image: string; columns: number[]; rows: number[] };
type EnrouteOverlays = {
  vy: Record<P2006TRegistration, Overlay>;
  vx: Record<P2006TRegistration, Overlay>;
};
type CruiseAltitude = "0" | "3000" | "6000" | "9000";
type CruiseOverlays = {
  cruise: Record<
    P2006TRegistration,
    Record<CruiseAltitude, Overlay>
  >;
};
type LegacyOeiStore = Partial<
  Record<
    P2006TRegistration,
    {
      rect: { x: number; y: number; width: number; height: number };
      savedAt: string;
    }
  >
>;

const ENROUTE = enrouteOverlaysJson as EnrouteOverlays;
const CRUISE = cruiseOverlaysJson as CruiseOverlays;
const REGISTRATIONS: P2006TRegistration[] = ["CS-EAQ", "CS-EBX", "D-GSEV"];

export const P2006T_DEFAULT_OEI_GRID_RECT = {
  x: 0.285,
  y: 0.278,
  width: 0.61,
  height: 0.535,
};

function sourcePrefix(registration: P2006TRegistration) {
  return registration === "CS-EBX" ? "SW" : registration === "D-GSEV" ? "S" : "";
}

function printedPage(registration: P2006TRegistration, page: number) {
  return `${sourcePrefix(registration)}5-${page}`;
}

function gridFromRect(
  rect: { x: number; y: number; width: number; height: number },
  columns: number,
  rows: number
): P2006TTableGrid {
  return {
    columnCenters: Array.from(
      { length: columns },
      (_, index) => rect.x + (rect.width * (index + 0.5)) / columns
    ),
    rowCenters: Array.from(
      { length: rows },
      (_, index) => rect.y + (rect.height * (index + 0.5)) / rows
    ),
  };
}

function overlaySource(
  overlay: Overlay,
  sourceLabel: string
): P2006TAdditionalTableSource {
  return {
    image: overlay.image,
    columnCenters: [...overlay.columns],
    rowCenters: [...overlay.rows],
    sourceLabel,
  };
}

function sourceRecord(
  family: "vy" | "vx"
): Record<P2006TRegistration, P2006TAdditionalTableSource> {
  return Object.fromEntries(
    REGISTRATIONS.map((registration) => [
      registration,
      overlaySource(
        ENROUTE[family][registration],
        `AFM ${printedPage(registration, family === "vy" ? 12 : 13)}`
      ),
    ])
  ) as unknown as Record<P2006TRegistration, P2006TAdditionalTableSource>;
}

function oeiSourceRecord(): Record<
  P2006TRegistration,
  P2006TAdditionalTableSource
> {
  const grid = gridFromRect(P2006T_DEFAULT_OEI_GRID_RECT, 6, 24);
  return Object.fromEntries(
    REGISTRATIONS.map((registration) => [
      registration,
      {
        image: `/api/p2006-oei-source?registration=${encodeURIComponent(
          registration
        )}`,
        ...grid,
        sourceLabel: `AFM ${printedPage(registration, 14)}`,
      },
    ])
  ) as unknown as Record<P2006TRegistration, P2006TAdditionalTableSource>;
}

function cruiseSourceRecord(
  altitude: CruiseAltitude
): Record<P2006TRegistration, P2006TAdditionalTableSource> {
  const page = altitude === "0" ? 16 : altitude === "9000" ? 18 : 17;
  return Object.fromEntries(
    REGISTRATIONS.map((registration) => [
      registration,
      overlaySource(
        CRUISE.cruise[registration][altitude],
        `AFM ${printedPage(registration, page)} · ${altitude} ft`
      ),
    ])
  ) as unknown as Record<P2006TRegistration, P2006TAdditionalTableSource>;
}

const CRUISE_DEFINITIONS = (["0", "3000", "6000", "9000"] as const).map(
  (altitude): P2006TAdditionalTableDefinition => ({
    id: `cruise-${altitude}`,
    shortTitle: altitude === "0" ? "Cruise SL" : `Cruise ${Number(altitude) / 1000}k`,
    title: `Cruise performance · ${altitude} ft`,
    group: "Cruise",
    description:
      "Map the complete published cruise matrix for this pressure altitude, including RPM, MAP and the ISA -30, ISA and ISA +30 performance groups.",
    sourceByRegistration: cruiseSourceRecord(altitude),
  })
);

export const P2006T_ADDITIONAL_TABLES: P2006TAdditionalTableDefinition[] = [
  {
    id: "enroute-vy",
    shortTitle: "Climb Vy",
    title: "Enroute rate of climb at Vy",
    group: "Enroute climb",
    description:
      "Map the six published columns and the 24 rows covering maximum, 1080 kg and 930 kg. This is the source used for Vy and enroute rate-of-climb interpolation.",
    sourceByRegistration: sourceRecord("vy"),
  },
  {
    id: "enroute-vx",
    shortTitle: "Climb Vx",
    title: "Enroute rate of climb at Vx",
    group: "Enroute climb",
    description:
      "Map the six published columns and the 24 rows used for Vx and the associated rate-of-climb check.",
    sourceByRegistration: sourceRecord("vx"),
  },
  {
    id: "oei-vyse",
    shortTitle: "OEI VySE",
    title: "OEI rate of climb at VySE",
    group: "OEI",
    description:
      "Map the six columns and 24 rows on the aircraft-specific OEI page. The saved geometry is also used to highlight the gradient and 50 ft/min service-ceiling cells in the tables PDF.",
    sourceByRegistration: oeiSourceRecord(),
  },
  ...CRUISE_DEFINITIONS,
];

export function p2006TAdditionalTableKey(
  id: P2006TAdditionalTableId,
  registration: P2006TRegistration
) {
  return `${id}:${registration}`;
}

export function centersToOuterRect(grid: P2006TTableGrid) {
  const axisBounds = (centers: number[]) => {
    if (centers.length === 0) return [0, 1] as const;
    if (centers.length === 1) return [centers[0] - 0.01, centers[0] + 0.01] as const;
    return [
      Math.max(0, centers[0] - (centers[1] - centers[0]) / 2),
      Math.min(
        1,
        centers[centers.length - 1] +
          (centers[centers.length - 1] - centers[centers.length - 2]) / 2
      ),
    ] as const;
  };
  const [left, right] = axisBounds(grid.columnCenters);
  const [top, bottom] = axisBounds(grid.rowCenters);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function initialP2006TAdditionalTableMapping(
  definition: P2006TAdditionalTableDefinition,
  registration: P2006TRegistration
): P2006TTableMapping {
  const source = definition.sourceByRegistration[registration];
  return {
    columnCenters: [...source.columnCenters],
    rowCenters: [...source.rowCenters],
    confirmed: false,
    confidence: 1,
    method: "afm-overlay",
    savedAt: null,
  };
}

export function readP2006TAdditionalTableMappings() {
  if (typeof window === "undefined") return {} as P2006TAdditionalTableMappingStore;
  let store: P2006TAdditionalTableMappingStore = {};
  try {
    const raw = window.localStorage.getItem(P2006T_ADDITIONAL_TABLE_STORAGE_KEY);
    store = raw ? (JSON.parse(raw) as P2006TAdditionalTableMappingStore) : {};
  } catch {
    store = {};
  }

  try {
    const raw = window.localStorage.getItem(P2006T_LEGACY_OEI_STORAGE_KEY);
    const legacy = raw ? (JSON.parse(raw) as LegacyOeiStore) : {};
    for (const registration of REGISTRATIONS) {
      const key = p2006TAdditionalTableKey("oei-vyse", registration);
      const entry = legacy[registration];
      if (store[key] || !entry?.rect) continue;
      store[key] = {
        ...gridFromRect(entry.rect, 6, 24),
        confirmed: true,
        confidence: 0.8,
        method: "legacy-oei",
        savedAt: entry.savedAt,
      };
    }
  } catch {
    // A malformed legacy entry must not block the unified mapper.
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

export function syncLegacyP2006TOeiMapping(
  registration: P2006TRegistration,
  mapping: P2006TTableMapping
) {
  if (typeof window === "undefined") return;
  let legacy: LegacyOeiStore = {};
  try {
    const raw = window.localStorage.getItem(P2006T_LEGACY_OEI_STORAGE_KEY);
    legacy = raw ? (JSON.parse(raw) as LegacyOeiStore) : {};
  } catch {
    legacy = {};
  }
  legacy[registration] = {
    rect: centersToOuterRect(mapping),
    savedAt: mapping.savedAt ?? new Date().toISOString(),
  };
  window.localStorage.setItem(
    P2006T_LEGACY_OEI_STORAGE_KEY,
    JSON.stringify(legacy)
  );
}
