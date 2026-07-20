import type {
  PerformanceAerodrome,
  PerformanceRunway,
} from "@/lib/performance/aerodromes";

type RunwayOverride = Partial<PerformanceRunway> & { id: string };

type AerodromeOverride = {
  allowedRunwayIds?: string[];
  runways: RunwayOverride[];
  source: string;
  effectiveDate: string;
};

/**
 * Audited against the current NAV Portugal AIP/eVFR published in June 2026.
 * Only aerodromes used by the default performance workflow are overridden here.
 */
const AIP_OVERRIDES: Record<string, AerodromeOverride> = {
  LPSO: {
    source: "NAV Portugal AIP LPSO AD 2.12",
    effectiveDate: "2026-06-11",
    runways: [
      { id: "03", slope_pc: 0 },
      { id: "21", slope_pc: 0 },
    ],
  },
  LPEV: {
    source: "NAV Portugal AIP LPEV AD 2.12",
    effectiveDate: "2026-06-11",
    allowedRunwayIds: ["01", "19"],
    runways: [
      { id: "01", qfu: 4.25, slope_pc: 0 },
      { id: "19", qfu: 184.25, slope_pc: 0 },
    ],
  },
  LPBJ: {
    source: "NAV Portugal AIP LPBJ AD 2.12-2.13",
    effectiveDate: "2026-06-11",
    // 01R/19L are published as available only for taxi operations.
    allowedRunwayIds: ["01L", "19R"],
    runways: [
      { id: "01L", qfu: 5.93, toda: 3815, lda: 3450, slope_pc: 0 },
      { id: "19R", qfu: 185.93, toda: 4040, lda: 3450, slope_pc: 0 },
    ],
  },
  LPCB: {
    source: "NAV Portugal eVFR LPCB AD 2.12",
    effectiveDate: "2026-05-14",
    runways: [
      { id: "16", qfu: 157.43, slope_pc: 0 },
      { id: "34", qfu: 337.43, slope_pc: 0 },
    ],
  },
};

export type AuditedPerformanceAerodrome = PerformanceAerodrome & {
  aipSource?: string;
  aipEffectiveDate?: string;
};

export function applyAipRunwayOverrides(
  icao: string,
  aerodrome: PerformanceAerodrome
): AuditedPerformanceAerodrome {
  const override = AIP_OVERRIDES[icao];
  if (!override) return aerodrome;

  const allowed = override.allowedRunwayIds
    ? new Set(override.allowedRunwayIds)
    : null;
  const runwayOverrides = new Map(
    override.runways.map((runway) => [runway.id, runway])
  );
  const runways = aerodrome.runways
    .filter((runway) => !allowed || allowed.has(runway.id))
    .map((runway) => ({
      ...runway,
      ...(runwayOverrides.get(runway.id) ?? {}),
    }));

  return {
    ...aerodrome,
    runways,
    aipSource: override.source,
    aipEffectiveDate: override.effectiveDate,
  };
}
