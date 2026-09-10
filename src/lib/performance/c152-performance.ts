import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";

const FT_TO_M = 0.3048;
const US_GAL_TO_L = 3.785411784;
const KG_TO_LB = 2.2046226218;

export const C152_CS_AVC = {
  registration: "CS-AVC",
  serialNumber: "152-79621",
  year: 1978,
  basicEmptyWeightLb: 1237,
  basicEmptyMomentLbIn: 39911.85,
  basicEmptyCgDisplayIn: 32.27,
  maxTakeoffWeightLb: 1670,
  maxLandingWeightLb: 1670,
  frontSeatArmIn: 39,
  fuelArmIn: 42,
  baggageArea1ArmIn: 64,
  baggageArea2ArmIn: 84,
  baggageArea1RangeIn: [64, 84] as const,
  baggageArea2RangeIn: [84, 94] as const,
  baggageArea1MaxLb: 120,
  baggageArea2MaxLb: 40,
  baggageCombinedMaxLb: 120,
  standardFuelTotalGal: 26,
  standardFuelUsableGal: 24.5,
  standardFuelUsableL: 24.5 * US_GAL_TO_L,
  fuelDensityLbGal: 6,
  defaultStartTaxiRunupGal: 0.8,
  maxDemonstratedCrosswindKt: 12,
  cruiseMaxRpmExceptTakeoffClimb: 2440,
} as const;

export type C152WeightBalanceInput = {
  pilotLb: number;
  passengerLb: number;
  fuelGal: number;
  baggageArea1Lb: number;
  baggageArea2Lb: number;
  startTaxiRunupGal?: number;
};

export type C152LoadingRow = {
  label: string;
  weightLb: number;
  armIn: number;
  momentLbIn: number;
};

export type C152WeightBalanceResult = {
  rows: C152LoadingRow[];
  ramp: {
    weightLb: number;
    momentLbIn: number;
    cgIn: number;
  };
  takeoff: {
    weightLb: number;
    momentLbIn: number;
    cgIn: number;
    forwardLimitIn: number;
    aftLimitIn: number;
  };
  takeoffFuelGal: number;
  weightOk: boolean;
  cgOk: boolean;
  fuelOk: boolean;
  baggageOk: boolean;
  overallOk: boolean;
  warnings: string[];
};

type DistanceCell = {
  groundRollFt: number;
  total50FtFt: number;
};

type DistanceTable = {
  pressureAltitudesFt: readonly number[];
  temperaturesC: readonly number[];
  rows: readonly (readonly DistanceCell[])[];
};

const TAKEOFF_DISTANCE: DistanceTable = {
  pressureAltitudesFt: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000],
  temperaturesC: [0, 10, 20, 30, 40],
  rows: [
    [{ groundRollFt: 640, total50FtFt: 1190 }, { groundRollFt: 695, total50FtFt: 1290 }, { groundRollFt: 755, total50FtFt: 1390 }, { groundRollFt: 810, total50FtFt: 1495 }, { groundRollFt: 875, total50FtFt: 1605 }],
    [{ groundRollFt: 705, total50FtFt: 1310 }, { groundRollFt: 765, total50FtFt: 1420 }, { groundRollFt: 825, total50FtFt: 1530 }, { groundRollFt: 890, total50FtFt: 1645 }, { groundRollFt: 960, total50FtFt: 1770 }],
    [{ groundRollFt: 775, total50FtFt: 1445 }, { groundRollFt: 840, total50FtFt: 1565 }, { groundRollFt: 910, total50FtFt: 1690 }, { groundRollFt: 980, total50FtFt: 1820 }, { groundRollFt: 1055, total50FtFt: 1960 }],
    [{ groundRollFt: 855, total50FtFt: 1600 }, { groundRollFt: 925, total50FtFt: 1730 }, { groundRollFt: 1000, total50FtFt: 1870 }, { groundRollFt: 1080, total50FtFt: 2020 }, { groundRollFt: 1165, total50FtFt: 2185 }],
    [{ groundRollFt: 940, total50FtFt: 1775 }, { groundRollFt: 1020, total50FtFt: 1920 }, { groundRollFt: 1100, total50FtFt: 2080 }, { groundRollFt: 1190, total50FtFt: 2250 }, { groundRollFt: 1285, total50FtFt: 2440 }],
    [{ groundRollFt: 1040, total50FtFt: 1970 }, { groundRollFt: 1125, total50FtFt: 2140 }, { groundRollFt: 1215, total50FtFt: 2320 }, { groundRollFt: 1315, total50FtFt: 2525 }, { groundRollFt: 1420, total50FtFt: 2750 }],
    [{ groundRollFt: 1145, total50FtFt: 2200 }, { groundRollFt: 1245, total50FtFt: 2395 }, { groundRollFt: 1345, total50FtFt: 2610 }, { groundRollFt: 1455, total50FtFt: 2855 }, { groundRollFt: 1570, total50FtFt: 3125 }],
    [{ groundRollFt: 1270, total50FtFt: 2470 }, { groundRollFt: 1375, total50FtFt: 2705 }, { groundRollFt: 1490, total50FtFt: 2960 }, { groundRollFt: 1615, total50FtFt: 3255 }, { groundRollFt: 1745, total50FtFt: 3590 }],
    [{ groundRollFt: 1405, total50FtFt: 2800 }, { groundRollFt: 1525, total50FtFt: 3080 }, { groundRollFt: 1655, total50FtFt: 3395 }, { groundRollFt: 1795, total50FtFt: 3765 }, { groundRollFt: 1940, total50FtFt: 4195 }],
  ],
};

const LANDING_DISTANCE: DistanceTable = {
  pressureAltitudesFt: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000],
  temperaturesC: [0, 10, 20, 30, 40],
  rows: [
    [{ groundRollFt: 450, total50FtFt: 1160 }, { groundRollFt: 465, total50FtFt: 1185 }, { groundRollFt: 485, total50FtFt: 1215 }, { groundRollFt: 500, total50FtFt: 1240 }, { groundRollFt: 515, total50FtFt: 1265 }],
    [{ groundRollFt: 465, total50FtFt: 1185 }, { groundRollFt: 485, total50FtFt: 1215 }, { groundRollFt: 500, total50FtFt: 1240 }, { groundRollFt: 520, total50FtFt: 1270 }, { groundRollFt: 535, total50FtFt: 1295 }],
    [{ groundRollFt: 485, total50FtFt: 1215 }, { groundRollFt: 500, total50FtFt: 1240 }, { groundRollFt: 520, total50FtFt: 1270 }, { groundRollFt: 535, total50FtFt: 1300 }, { groundRollFt: 555, total50FtFt: 1330 }],
    [{ groundRollFt: 500, total50FtFt: 1240 }, { groundRollFt: 520, total50FtFt: 1275 }, { groundRollFt: 540, total50FtFt: 1305 }, { groundRollFt: 560, total50FtFt: 1335 }, { groundRollFt: 575, total50FtFt: 1360 }],
    [{ groundRollFt: 520, total50FtFt: 1275 }, { groundRollFt: 540, total50FtFt: 1305 }, { groundRollFt: 560, total50FtFt: 1335 }, { groundRollFt: 580, total50FtFt: 1370 }, { groundRollFt: 600, total50FtFt: 1400 }],
    [{ groundRollFt: 540, total50FtFt: 1305 }, { groundRollFt: 560, total50FtFt: 1335 }, { groundRollFt: 580, total50FtFt: 1370 }, { groundRollFt: 600, total50FtFt: 1400 }, { groundRollFt: 620, total50FtFt: 1435 }],
    [{ groundRollFt: 560, total50FtFt: 1340 }, { groundRollFt: 580, total50FtFt: 1370 }, { groundRollFt: 605, total50FtFt: 1410 }, { groundRollFt: 625, total50FtFt: 1440 }, { groundRollFt: 645, total50FtFt: 1475 }],
    [{ groundRollFt: 585, total50FtFt: 1375 }, { groundRollFt: 605, total50FtFt: 1410 }, { groundRollFt: 625, total50FtFt: 1440 }, { groundRollFt: 650, total50FtFt: 1480 }, { groundRollFt: 670, total50FtFt: 1515 }],
    [{ groundRollFt: 605, total50FtFt: 1410 }, { groundRollFt: 630, total50FtFt: 1450 }, { groundRollFt: 650, total50FtFt: 1480 }, { groundRollFt: 675, total50FtFt: 1520 }, { groundRollFt: 695, total50FtFt: 1555 }],
  ],
};

const ROC_PRESSURE_ALTITUDES_FT = [0, 2000, 4000, 6000, 8000, 10000, 12000] as const;
const ROC_TEMPERATURES_C = [-20, 0, 20, 40] as const;
const ROC_FPM = [
  [835, 765, 700, 630],
  [735, 670, 600, 535],
  [635, 570, 505, 445],
  [535, 475, 415, 355],
  [440, 380, 320, 265],
  [340, 285, 230, 175],
  [245, 190, 135, 85],
] as const;

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function bracket(levels: readonly number[], value: number) {
  if (value <= levels[0]) return { lower: 0, upper: 0, alpha: 0 };
  const last = levels.length - 1;
  if (value >= levels[last]) return { lower: last, upper: last, alpha: 0 };

  for (let index = 0; index < last; index += 1) {
    const low = levels[index];
    const high = levels[index + 1];
    if (low <= value && value <= high) {
      return {
        lower: index,
        upper: index + 1,
        alpha: (value - low) / (high - low),
      };
    }
  }

  return { lower: last, upper: last, alpha: 0 };
}

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

function interpolateDistance(table: DistanceTable, pressureAltitudeFt: number, oatC: number) {
  const warnings: string[] = [];
  const maxPa = table.pressureAltitudesFt[table.pressureAltitudesFt.length - 1];
  const maxTemp = table.temperaturesC[table.temperaturesC.length - 1];

  if (pressureAltitudeFt > maxPa || oatC > maxTemp) {
    return {
      value: null as DistanceCell | null,
      usedPressureAltitudeFt: pressureAltitudeFt,
      usedTemperatureC: oatC,
      warnings: [
        `Fora da tabela do POH: PA ${round(pressureAltitudeFt)} ft / OAT ${round(oatC)} °C (máx. ${maxPa} ft / ${maxTemp} °C).`,
      ],
    };
  }

  const usedPa = Math.max(0, pressureAltitudeFt);
  const usedTemp = Math.max(0, oatC);

  if (pressureAltitudeFt < 0) {
    warnings.push("PA abaixo de sea level: usada a linha SL (0 ft), sem extrapolação.");
  }
  if (oatC < 0) {
    warnings.push("OAT abaixo de 0 °C: usada a coluna 0 °C, de forma conservadora e sem extrapolação.");
  }

  const paBracket = bracket(table.pressureAltitudesFt, usedPa);
  const tempBracket = bracket(table.temperaturesC, usedTemp);

  const cell = (paIndex: number, tempIndex: number) => table.rows[paIndex][tempIndex];
  const interpolateField = (field: keyof DistanceCell) => {
    const atLowerPa = lerp(
      cell(paBracket.lower, tempBracket.lower)[field],
      cell(paBracket.lower, tempBracket.upper)[field],
      tempBracket.alpha
    );
    const atUpperPa = lerp(
      cell(paBracket.upper, tempBracket.lower)[field],
      cell(paBracket.upper, tempBracket.upper)[field],
      tempBracket.alpha
    );
    return lerp(atLowerPa, atUpperPa, paBracket.alpha);
  };

  return {
    value: {
      groundRollFt: interpolateField("groundRollFt"),
      total50FtFt: interpolateField("total50FtFt"),
    },
    usedPressureAltitudeFt: usedPa,
    usedTemperatureC: usedTemp,
    warnings,
  };
}

function windCorrectionFactor(headwindKt: number) {
  if (headwindKt >= 0) {
    return {
      factor: Math.max(0, 1 - 0.1 * (headwindKt / 9)),
      warning: "",
    };
  }

  const tailwindKt = Math.abs(headwindKt);
  if (tailwindKt > 10) {
    return {
      factor: null as number | null,
      warning: `Componente de cauda ${round(tailwindKt, 1)} kt excede os 10 kt cobertos pela nota do POH; distância não calculada por extrapolação.`,
    };
  }

  return {
    factor: 1 + 0.1 * (tailwindKt / 2),
    warning: "",
  };
}

function correctedDistance(table: DistanceTable, pressureAltitudeFt: number, oatC: number, headwindKt: number) {
  const base = interpolateDistance(table, pressureAltitudeFt, oatC);
  const wind = windCorrectionFactor(headwindKt);
  const warnings = [...base.warnings];

  if (wind.warning) warnings.push(wind.warning);
  if (!base.value || wind.factor === null) {
    return {
      groundRollFt: null as number | null,
      total50FtFt: null as number | null,
      factor: wind.factor,
      warnings,
    };
  }

  return {
    groundRollFt: base.value.groundRollFt * wind.factor,
    total50FtFt: base.value.total50FtFt * wind.factor,
    factor: wind.factor,
    warnings,
  };
}

function interpolateRoc(pressureAltitudeFt: number, oatC: number) {
  const warnings: string[] = [];
  const maxPa = ROC_PRESSURE_ALTITUDES_FT[ROC_PRESSURE_ALTITUDES_FT.length - 1];
  const maxTemp = ROC_TEMPERATURES_C[ROC_TEMPERATURES_C.length - 1];

  if (pressureAltitudeFt > maxPa || oatC > maxTemp) {
    return {
      rocFpm: null as number | null,
      warnings: [
        `ROC fora da tabela do POH: PA ${round(pressureAltitudeFt)} ft / OAT ${round(oatC)} °C (máx. ${maxPa} ft / ${maxTemp} °C).`,
      ],
    };
  }

  const usedPa = Math.max(0, pressureAltitudeFt);
  const usedTemp = Math.max(-20, oatC);
  if (pressureAltitudeFt < 0) warnings.push("ROC: usada a linha SL para PA abaixo de 0 ft.");
  if (oatC < -20) warnings.push("ROC: usada a coluna -20 °C, sem extrapolação.");

  const paBracket = bracket(ROC_PRESSURE_ALTITUDES_FT, usedPa);
  const tempBracket = bracket(ROC_TEMPERATURES_C, usedTemp);
  const valueAt = (paIndex: number, tempIndex: number) => Number(ROC_FPM[paIndex][tempIndex]);

  const atLowerPa = lerp(
    valueAt(paBracket.lower, tempBracket.lower),
    valueAt(paBracket.lower, tempBracket.upper),
    tempBracket.alpha
  );
  const atUpperPa = lerp(
    valueAt(paBracket.upper, tempBracket.lower),
    valueAt(paBracket.upper, tempBracket.upper),
    tempBracket.alpha
  );

  return {
    rocFpm: lerp(atLowerPa, atUpperPa, paBracket.alpha),
    warnings,
  };
}

export function c152ForwardCgLimitIn(weightLb: number) {
  if (weightLb <= 1350) return 31;
  if (weightLb >= 1670) return 32.65;
  return 31 + ((weightLb - 1350) / (1670 - 1350)) * (32.65 - 31);
}

export function calculateC152WeightBalance(input: C152WeightBalanceInput): C152WeightBalanceResult {
  const pilotLb = Math.max(0, Number(input.pilotLb || 0));
  const passengerLb = Math.max(0, Number(input.passengerLb || 0));
  const fuelGal = Math.max(0, Number(input.fuelGal || 0));
  const baggageArea1Lb = Math.max(0, Number(input.baggageArea1Lb || 0));
  const baggageArea2Lb = Math.max(0, Number(input.baggageArea2Lb || 0));
  const requestedTaxiGal = Math.max(0, Number(input.startTaxiRunupGal ?? C152_CS_AVC.defaultStartTaxiRunupGal));
  const startTaxiRunupGal = Math.min(fuelGal, requestedTaxiGal);

  const fuelWeightLb = fuelGal * C152_CS_AVC.fuelDensityLbGal;
  const occupantsLb = pilotLb + passengerLb;

  const rows: C152LoadingRow[] = [
    {
      label: "Basic Empty Weight",
      weightLb: C152_CS_AVC.basicEmptyWeightLb,
      armIn: C152_CS_AVC.basicEmptyMomentLbIn / C152_CS_AVC.basicEmptyWeightLb,
      momentLbIn: C152_CS_AVC.basicEmptyMomentLbIn,
    },
    {
      label: "Usable Fuel",
      weightLb: fuelWeightLb,
      armIn: C152_CS_AVC.fuelArmIn,
      momentLbIn: fuelWeightLb * C152_CS_AVC.fuelArmIn,
    },
    {
      label: "Pilot & Passenger",
      weightLb: occupantsLb,
      armIn: C152_CS_AVC.frontSeatArmIn,
      momentLbIn: occupantsLb * C152_CS_AVC.frontSeatArmIn,
    },
    {
      label: "Baggage Area 1",
      weightLb: baggageArea1Lb,
      armIn: C152_CS_AVC.baggageArea1ArmIn,
      momentLbIn: baggageArea1Lb * C152_CS_AVC.baggageArea1ArmIn,
    },
    {
      label: "Baggage Area 2",
      weightLb: baggageArea2Lb,
      armIn: C152_CS_AVC.baggageArea2ArmIn,
      momentLbIn: baggageArea2Lb * C152_CS_AVC.baggageArea2ArmIn,
    },
  ];

  const rampWeightLb = rows.reduce((sum, row) => sum + row.weightLb, 0);
  const rampMomentLbIn = rows.reduce((sum, row) => sum + row.momentLbIn, 0);
  const rampCgIn = rampWeightLb > 0 ? rampMomentLbIn / rampWeightLb : 0;

  const taxiFuelWeightLb = startTaxiRunupGal * C152_CS_AVC.fuelDensityLbGal;
  const takeoffWeightLb = rampWeightLb - taxiFuelWeightLb;
  const takeoffMomentLbIn = rampMomentLbIn - taxiFuelWeightLb * C152_CS_AVC.fuelArmIn;
  const takeoffCgIn = takeoffWeightLb > 0 ? takeoffMomentLbIn / takeoffWeightLb : 0;
  const forwardLimitIn = c152ForwardCgLimitIn(takeoffWeightLb);
  const aftLimitIn = 36.5;

  const warnings: string[] = [];
  const fuelOk = fuelGal <= C152_CS_AVC.standardFuelUsableGal;
  const baggageOk =
    baggageArea1Lb <= C152_CS_AVC.baggageArea1MaxLb &&
    baggageArea2Lb <= C152_CS_AVC.baggageArea2MaxLb &&
    baggageArea1Lb + baggageArea2Lb <= C152_CS_AVC.baggageCombinedMaxLb;
  const weightOk = takeoffWeightLb <= C152_CS_AVC.maxTakeoffWeightLb;
  const cgOk = takeoffCgIn >= forwardLimitIn && takeoffCgIn <= aftLimitIn;

  if (!fuelOk) warnings.push(`Fuel utilizável excede ${C152_CS_AVC.standardFuelUsableGal} US gal (standard tanks).`);
  if (!baggageOk) warnings.push("Limite de bagagem excedido: Area 1 120 lb, Area 2 40 lb, combinado 120 lb.");
  if (!weightOk) warnings.push(`Takeoff weight ${round(takeoffWeightLb)} lb excede MTOW ${C152_CS_AVC.maxTakeoffWeightLb} lb.`);
  if (!cgOk) warnings.push(`CG de descolagem ${round(takeoffCgIn, 2)} in fora de ${round(forwardLimitIn, 2)}–${aftLimitIn.toFixed(2)} in.`);
  if (requestedTaxiGal > fuelGal) warnings.push("Fuel de start/taxi/run-up superior ao fuel carregado; limitado ao fuel disponível.");
  if (rampWeightLb > C152_CS_AVC.maxTakeoffWeightLb) {
    warnings.push("Ramp weight acima de 1670 lb: confirmar que o combustível previsto para start/taxi/run-up reduz o peso para MTOW antes da descolagem.");
  }

  return {
    rows,
    ramp: {
      weightLb: round(rampWeightLb, 1),
      momentLbIn: round(rampMomentLbIn, 1),
      cgIn: round(rampCgIn, 2),
    },
    takeoff: {
      weightLb: round(takeoffWeightLb, 1),
      momentLbIn: round(takeoffMomentLbIn, 1),
      cgIn: round(takeoffCgIn, 2),
      forwardLimitIn: round(forwardLimitIn, 2),
      aftLimitIn,
    },
    takeoffFuelGal: round(fuelGal - startTaxiRunupGal, 2),
    weightOk,
    cgOk,
    fuelOk,
    baggageOk,
    overallOk: weightOk && cgOk && fuelOk && baggageOk,
    warnings,
  };
}

export type C152PerformanceRow = {
  role: string;
  icao: string;
  label: string;
  runway: string;
  qfu: number;
  paFt: number;
  daFt: number;
  todaM: number;
  ldaM: number;
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | "";
  takeoffGroundRollM: number | null;
  takeoff50FtM: number | null;
  landingGroundRollM: number | null;
  landing50FtM: number | null;
  rocFpm: number | null;
  takeoffPohOk: boolean | null;
  landingPohOk: boolean | null;
  takeoff125M: number | null;
  landing125M: number | null;
  takeoff125Ok: boolean | null;
  landing125Ok: boolean | null;
  warnings: string[];
};

export function calculateC152Performance(result: PerformanceLegResult): C152PerformanceRow | null {
  const runway = result.bestRunway;
  const aerodrome = result.aerodrome;
  if (!runway || !aerodrome) return null;

  const takeoff = correctedDistance(
    TAKEOFF_DISTANCE,
    result.pressureAltitudeFt,
    result.leg.tempC,
    result.headwindKt
  );
  const landing = correctedDistance(
    LANDING_DISTANCE,
    result.pressureAltitudeFt,
    result.leg.tempC,
    result.headwindKt
  );
  const roc = interpolateRoc(result.pressureAltitudeFt, result.leg.tempC);
  const warnings = [...takeoff.warnings, ...landing.warnings, ...roc.warnings];

  if (runway.paved === false) {
    warnings.push("A tabela base assume pista pavimentada, nivelada e seca. A pista está marcada como não pavimentada; nenhuma correção de superfície foi aplicada automaticamente.");
  }
  if (Math.abs(runway.slope_pc ?? 0) > 0.01) {
    warnings.push(`A tabela base assume pista nivelada. Slope ${round(runway.slope_pc ?? 0, 1)}% não foi corrigido automaticamente.`);
  }
  if (result.crosswindKt > C152_CS_AVC.maxDemonstratedCrosswindKt) {
    warnings.push(`Componente de vento cruzado ${round(result.crosswindKt, 1)} kt excede o máximo demonstrado de ${C152_CS_AVC.maxDemonstratedCrosswindKt} kt.`);
  }

  const takeoffGroundRollM = takeoff.groundRollFt === null ? null : takeoff.groundRollFt * FT_TO_M;
  const takeoff50FtM = takeoff.total50FtFt === null ? null : takeoff.total50FtFt * FT_TO_M;
  const landingGroundRollM = landing.groundRollFt === null ? null : landing.groundRollFt * FT_TO_M;
  const landing50FtM = landing.total50FtFt === null ? null : landing.total50FtFt * FT_TO_M;
  const takeoff125M = takeoff50FtM === null ? null : takeoff50FtM * 1.25;
  const landing125M = landing50FtM === null ? null : landing50FtM * 1.25;

  return {
    role: result.leg.role,
    icao: result.leg.icao,
    label: aerodrome.name,
    runway: runway.id,
    qfu: runway.qfu,
    paFt: result.pressureAltitudeFt,
    daFt: result.densityAltitudeFt,
    todaM: runway.toda,
    ldaM: runway.lda,
    headwindKt: result.headwindKt,
    crosswindKt: result.crosswindKt,
    crosswindSide: result.crosswindSide,
    takeoffGroundRollM: takeoffGroundRollM === null ? null : round(takeoffGroundRollM),
    takeoff50FtM: takeoff50FtM === null ? null : round(takeoff50FtM),
    landingGroundRollM: landingGroundRollM === null ? null : round(landingGroundRollM),
    landing50FtM: landing50FtM === null ? null : round(landing50FtM),
    rocFpm: roc.rocFpm === null ? null : round(roc.rocFpm),
    takeoffPohOk: takeoff50FtM === null ? null : runway.toda >= takeoff50FtM,
    landingPohOk: landing50FtM === null ? null : runway.lda >= landing50FtM,
    takeoff125M: takeoff125M === null ? null : round(takeoff125M),
    landing125M: landing125M === null ? null : round(landing125M),
    takeoff125Ok: takeoff125M === null ? null : runway.toda >= takeoff125M,
    landing125Ok: landing125M === null ? null : runway.lda >= landing125M,
    warnings: Array.from(new Set(warnings)),
  };
}

export function c152KgToLb(valueKg: number) {
  return Number(valueKg || 0) * KG_TO_LB;
}

export function c152LitersToGallons(valueL: number) {
  return Number(valueL || 0) / US_GAL_TO_L;
}

export function c152GallonsToLiters(valueGal: number) {
  return Number(valueGal || 0) * US_GAL_TO_L;
}
