import rawDataset from "./p2006t-distance-tables.json";

export const P2006T_DISTANCE_KINDS = [
  "takeoff-ground-roll",
  "takeoff-50ft",
  "landing-ground-roll",
  "landing-50ft",
] as const;

export type P2006TDistanceKind = (typeof P2006T_DISTANCE_KINDS)[number];

export type P2006TDistanceTable = {
  id: string;
  kind: P2006TDistanceKind;
  sourcePage: string;
  notes?: string;
  axes: {
    weightKg: number[];
    pressureAltitudeFt: number[];
    oatC: number[];
  };
  /** Matrix order: valuesM[weightIndex][pressureAltitudeIndex][oatIndex]. */
  valuesM: number[][][];
};

export type P2006TDistanceDataset = {
  aircraft: "Tecnam P2006T";
  status: "awaiting-afm-data" | "draft" | "verified";
  source: {
    document: string;
    revision: string;
    date: string;
    notes?: string;
  };
  tables: P2006TDistanceTable[];
};

export type P2006TDistanceInput = {
  kind: P2006TDistanceKind;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
};

export type P2006TDistanceSuccess = {
  ok: true;
  distanceM: number;
  tableId: string;
  sourcePage: string;
  datasetStatus: P2006TDistanceDataset["status"];
};

export type P2006TDistanceFailure = {
  ok: false;
  reason: string;
  issues?: string[];
};

export type P2006TDistanceResult =
  | P2006TDistanceSuccess
  | P2006TDistanceFailure;

export type P2006TDistanceReadiness = {
  ready: boolean;
  status: P2006TDistanceDataset["status"];
  tableCount: number;
  availableKinds: P2006TDistanceKind[];
  missingKinds: P2006TDistanceKind[];
  issues: string[];
  source: P2006TDistanceDataset["source"];
};

const dataset = rawDataset as unknown as P2006TDistanceDataset;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStrictlyAscending(values: number[]) {
  return values.every(
    (value, index) => index === 0 || value > values[index - 1]
  );
}

function validateAxis(
  values: unknown,
  label: string,
  tableId: string,
  issues: string[]
): values is number[] {
  if (!Array.isArray(values) || values.length === 0) {
    issues.push(`${tableId}: ${label} axis is empty.`);
    return false;
  }

  if (!values.every(isFiniteNumber)) {
    issues.push(`${tableId}: ${label} axis contains a non-finite value.`);
    return false;
  }

  if (!isStrictlyAscending(values)) {
    issues.push(`${tableId}: ${label} axis must be strictly ascending.`);
    return false;
  }

  return true;
}

export function validateP2006TDistanceDataset(
  value: unknown = dataset
): string[] {
  const issues: string[] = [];

  if (!value || typeof value !== "object") {
    return ["P2006T distance dataset is not an object."];
  }

  const candidate = value as Partial<P2006TDistanceDataset>;

  if (candidate.aircraft !== "Tecnam P2006T") {
    issues.push('Dataset aircraft must be "Tecnam P2006T".');
  }

  if (
    candidate.status !== "awaiting-afm-data" &&
    candidate.status !== "draft" &&
    candidate.status !== "verified"
  ) {
    issues.push("Dataset status is invalid.");
  }

  if (!candidate.source || typeof candidate.source !== "object") {
    issues.push("Dataset source metadata is missing.");
  }

  if (!Array.isArray(candidate.tables)) {
    issues.push("Dataset tables must be an array.");
    return issues;
  }

  const ids = new Set<string>();

  candidate.tables.forEach((table, tableIndex) => {
    const fallbackId = `table-${tableIndex + 1}`;
    const tableId =
      table && typeof table === "object" && typeof table.id === "string"
        ? table.id
        : fallbackId;

    if (!table || typeof table !== "object") {
      issues.push(`${fallbackId}: table is not an object.`);
      return;
    }

    if (!table.id?.trim()) {
      issues.push(`${tableId}: id is required.`);
    } else if (ids.has(table.id)) {
      issues.push(`${tableId}: duplicate table id.`);
    } else {
      ids.add(table.id);
    }

    if (!P2006T_DISTANCE_KINDS.includes(table.kind)) {
      issues.push(`${tableId}: unsupported distance kind.`);
    }

    if (!table.sourcePage?.trim()) {
      issues.push(`${tableId}: AFM/POH source page is required.`);
    }

    if (!table.axes || typeof table.axes !== "object") {
      issues.push(`${tableId}: axes are missing.`);
      return;
    }

    const weightOk = validateAxis(
      table.axes.weightKg,
      "weightKg",
      tableId,
      issues
    );
    const altitudeOk = validateAxis(
      table.axes.pressureAltitudeFt,
      "pressureAltitudeFt",
      tableId,
      issues
    );
    const oatOk = validateAxis(table.axes.oatC, "oatC", tableId, issues);

    if (!Array.isArray(table.valuesM)) {
      issues.push(`${tableId}: valuesM must be a three-dimensional array.`);
      return;
    }

    if (!weightOk || !altitudeOk || !oatOk) return;

    if (table.valuesM.length !== table.axes.weightKg.length) {
      issues.push(`${tableId}: valuesM weight dimension does not match weightKg.`);
      return;
    }

    table.valuesM.forEach((altitudeMatrix, weightIndex) => {
      if (
        !Array.isArray(altitudeMatrix) ||
        altitudeMatrix.length !== table.axes.pressureAltitudeFt.length
      ) {
        issues.push(
          `${tableId}: valuesM[${weightIndex}] altitude dimension does not match pressureAltitudeFt.`
        );
        return;
      }

      altitudeMatrix.forEach((oatRow, altitudeIndex) => {
        if (!Array.isArray(oatRow) || oatRow.length !== table.axes.oatC.length) {
          issues.push(
            `${tableId}: valuesM[${weightIndex}][${altitudeIndex}] temperature dimension does not match oatC.`
          );
          return;
        }

        if (!oatRow.every((distance) => isFiniteNumber(distance) && distance > 0)) {
          issues.push(
            `${tableId}: valuesM[${weightIndex}][${altitudeIndex}] contains an invalid distance.`
          );
        }
      });
    });
  });

  return issues;
}

type AxisBracket = {
  lowerIndex: number;
  upperIndex: number;
  fraction: number;
};

function findAxisBracket(axis: number[], value: number): AxisBracket | null {
  if (!isFiniteNumber(value) || value < axis[0] || value > axis[axis.length - 1]) {
    return null;
  }

  const exactIndex = axis.indexOf(value);
  if (exactIndex >= 0) {
    return {
      lowerIndex: exactIndex,
      upperIndex: exactIndex,
      fraction: 0,
    };
  }

  for (let upperIndex = 1; upperIndex < axis.length; upperIndex += 1) {
    const upperValue = axis[upperIndex];
    if (value > upperValue) continue;

    const lowerIndex = upperIndex - 1;
    const lowerValue = axis[lowerIndex];

    return {
      lowerIndex,
      upperIndex,
      fraction: (value - lowerValue) / (upperValue - lowerValue),
    };
  }

  return null;
}

function lerp(start: number, end: number, fraction: number) {
  return start + (end - start) * fraction;
}

function interpolateTable(
  table: P2006TDistanceTable,
  input: P2006TDistanceInput
): number | null {
  const weight = findAxisBracket(table.axes.weightKg, input.weightKg);
  const altitude = findAxisBracket(
    table.axes.pressureAltitudeFt,
    input.pressureAltitudeFt
  );
  const oat = findAxisBracket(table.axes.oatC, input.oatC);

  if (!weight || !altitude || !oat) return null;

  const valueAt = (weightIndex: number, altitudeIndex: number, oatIndex: number) =>
    table.valuesM[weightIndex][altitudeIndex][oatIndex];

  const interpolateAtWeightAndAltitude = (
    weightIndex: number,
    altitudeIndex: number
  ) =>
    lerp(
      valueAt(weightIndex, altitudeIndex, oat.lowerIndex),
      valueAt(weightIndex, altitudeIndex, oat.upperIndex),
      oat.fraction
    );

  const interpolateAtWeight = (weightIndex: number) =>
    lerp(
      interpolateAtWeightAndAltitude(weightIndex, altitude.lowerIndex),
      interpolateAtWeightAndAltitude(weightIndex, altitude.upperIndex),
      altitude.fraction
    );

  return lerp(
    interpolateAtWeight(weight.lowerIndex),
    interpolateAtWeight(weight.upperIndex),
    weight.fraction
  );
}

export function getP2006TDistanceReadiness(): P2006TDistanceReadiness {
  const issues = validateP2006TDistanceDataset(dataset);
  const availableKinds = P2006T_DISTANCE_KINDS.filter((kind) =>
    dataset.tables.some((table) => table.kind === kind)
  );
  const missingKinds = P2006T_DISTANCE_KINDS.filter(
    (kind) => !availableKinds.includes(kind)
  );

  return {
    ready:
      issues.length === 0 &&
      dataset.status === "verified" &&
      missingKinds.length === 0,
    status: dataset.status,
    tableCount: dataset.tables.length,
    availableKinds,
    missingKinds,
    issues,
    source: dataset.source,
  };
}

export function calculateP2006TDistance(
  input: P2006TDistanceInput
): P2006TDistanceResult {
  const readiness = getP2006TDistanceReadiness();

  if (readiness.issues.length > 0) {
    return {
      ok: false,
      reason: "The P2006T AFM dataset is invalid.",
      issues: readiness.issues,
    };
  }

  if (dataset.status !== "verified") {
    return {
      ok: false,
      reason:
        "P2006T performance is not operational because the AFM dataset has not been verified.",
    };
  }

  const table = dataset.tables.find((candidate) => candidate.kind === input.kind);

  if (!table) {
    return {
      ok: false,
      reason: `No verified P2006T table is available for ${input.kind}.`,
    };
  }

  const distanceM = interpolateTable(table, input);

  if (distanceM === null) {
    return {
      ok: false,
      reason:
        "The requested P2006T weight, pressure altitude or temperature is outside the verified AFM table range. Extrapolation is not permitted.",
    };
  }

  return {
    ok: true,
    distanceM,
    tableId: table.id,
    sourcePage: table.sourcePage,
    datasetStatus: dataset.status,
  };
}
