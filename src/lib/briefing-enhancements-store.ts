export type BriefingAircraftOverride =
  | {
      enabled: boolean;
      aircraftType: "Tecnam P2006T";
      registration: "CS-EAQ" | "CS-EBX" | "D-GSEV";
    }
  | {
      enabled: boolean;
      aircraftType: "Cessna 152";
      registration: "CS-AVC";
    };

let missionObjectivesPdf: File | null = null;
let aircraftOverride: BriefingAircraftOverride | null = null;

export function setMissionObjectivesPdf(file: File | null) {
  missionObjectivesPdf = file;
}

export function getMissionObjectivesPdf() {
  return missionObjectivesPdf;
}

export function setBriefingAircraftOverride(
  value: BriefingAircraftOverride | null
) {
  aircraftOverride = value;
}

export function getBriefingAircraftOverride() {
  return aircraftOverride;
}
