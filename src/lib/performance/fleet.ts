import type { PerformanceAircraft } from "@/lib/performance/mb";

export const PA28_FLEET = {
  "OE-KPD": {
    emptyWeightLb: 1690.2,
    emptyMomentInLb: 151319.5,
    notes: "",
  },
  "OE-KPE": {
    emptyWeightLb: 1686.2,
    emptyMomentInLb: 150880.7,
    notes: "",
  },
  "OE-KPG": {
    emptyWeightLb: 1689.2,
    emptyMomentInLb: 150344.1,
    notes: "",
  },
  "OE-KPP": {
    emptyWeightLb: 1686.2,
    emptyMomentInLb: 150408.5,
    notes: "",
  },
  "OE-KPJ": {
    emptyWeightLb: 1680.2,
    emptyMomentInLb: 150379.9,
    notes: "",
  },
  "OE-KPF": {
    emptyWeightLb: 1687.2,
    emptyMomentInLb: 150833.0,
    notes: "",
  },
} as const;

export const TECNAM_FLEET = {
  "CS-DHS": { emptyWeightKg: 435.75, emptyMomentKgM: 811.33 },
  "CS-DHT": { emptyWeightKg: 426.5, emptyMomentKgM: 784.7 },
  "CS-DHU": { emptyWeightKg: 427.0, emptyMomentKgM: 786.2 },
  "CS-DHV": { emptyWeightKg: 426.0, emptyMomentKgM: 784.0 },
  "CS-DHW": { emptyWeightKg: 427.0, emptyMomentKgM: 788.0 },
  "CS-ECC": { emptyWeightKg: 430.0, emptyMomentKgM: 795.7 },
  "CS-ECD": { emptyWeightKg: 430.0, emptyMomentKgM: 796.5 },
} as const;

export function getFleetDefaults(
  aircraft: PerformanceAircraft,
  registration: string
) {
  if (aircraft === "Piper PA-28") {
    return PA28_FLEET[registration as keyof typeof PA28_FLEET] ?? null;
  }

  return TECNAM_FLEET[registration as keyof typeof TECNAM_FLEET] ?? null;
}
