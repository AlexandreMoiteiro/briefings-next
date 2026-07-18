export type BriefingStepId =
  | "mission"
  | "weather"
  | "notam"
  | "performance"
  | "fpl"
  | "routes"
  | "generate";

export type MissionForm = {
  pilot: string;
  callsign: string;
  aircraftType: string;
  registration: string;
  missionNumber: string;
  flightDate: string;
  timeUtc: string;
};

export const missionDefaults: MissionForm = {
  pilot: "",
  callsign: "RVP",
  aircraftType: "PA28",
  registration: "OE-KPE",
  missionNumber: "",
  flightDate: "",
  timeUtc: "",
};

export const aircraftRegistrations = [
  "OE-KPD",
  "OE-KPE",
  "OE-KPJ",
  "OE-KPP",
  "OE-KPG",
  "OE-KPF",
  "OE-KPH",
  "CS-DHS",
  "CS-DHT",
  "CS-DHU",
  "CS-DHV",
  "CS-DHW",
  "CS-ECC",
  "CS-ECD",
];

export const briefingSteps: {
  id: BriefingStepId;
  title: string;
  shortTitle: string;
  description: string;
}[] = [
  {
    id: "mission",
    title: "Mission",
    shortTitle: "Mission",
    description: "Mission objective, time slot, callsign and aircraft details.",
  },
  {
    id: "fpl",
    title: "Flight Plan",
    shortTitle: "FPL",
    description: "Submitted flight plan and related confirmation.",
  },
  {
    id: "weather",
    title: "Weather",
    shortTitle: "Weather",
    description: "Weather briefing material organised by type.",
  },
  {
    id: "performance",
    title: "Mass & Balance and Performance",
    shortTitle: "M&B / Perf",
    description: "Mass & balance and aircraft performance sheets.",
  },
  {
    id: "notam",
    title: "NOTAM",
    shortTitle: "NOTAM",
    description: "PIB, SUP and NOTAM information for the operational areas.",
  },
  {
    id: "routes",
    title: "Mission details and NavLog",
    shortTitle: "Details / NavLog",
    description: "Mission-specific details, remaining questions, NavLog and VFR map.",
  },
  {
    id: "generate",
    title: "Generate PDF",
    shortTitle: "Generate",
    description: "Final review and PDF generation in briefing order.",
  },
];

export type UploadSectionId =
  | "weather"
  | "notam"
  | "performance"
  | "fpl"
  | "attachments";

export type UploadBucketId =
  | "pressure"
  | "sigwx"
  | "wind"
  | "weather_other"
  | "pib"
  | "sup"
  | "performance"
  | "fpl"
  | "attachments";

export type UploadTarget = {
  sectionId: UploadSectionId;
  bucketId: UploadBucketId;
  label: string;
  shortLabel: string;
};

export const uploadTargets: UploadTarget[] = [
  {
    sectionId: "weather",
    bucketId: "pressure",
    label: "Weather · Pressure chart",
    shortLabel: "Pressure chart",
  },
  {
    sectionId: "weather",
    bucketId: "sigwx",
    label: "Weather · SIGWX chart",
    shortLabel: "SIGWX chart",
  },
  {
    sectionId: "weather",
    bucketId: "wind",
    label: "Weather · Wind chart",
    shortLabel: "Wind chart",
  },
  {
    sectionId: "weather",
    bucketId: "weather_other",
    label: "Weather · Other",
    shortLabel: "Other",
  },
  {
    sectionId: "notam",
    bucketId: "pib",
    label: "NOTAM · PIB",
    shortLabel: "PIB",
  },
  {
    sectionId: "notam",
    bucketId: "sup",
    label: "NOTAM · SUP",
    shortLabel: "SUP",
  },
  {
    sectionId: "performance",
    bucketId: "performance",
    label: "Performance & M&B",
    shortLabel: "Performance & M&B",
  },
  {
    sectionId: "fpl",
    bucketId: "fpl",
    label: "FPL",
    shortLabel: "FPL",
  },
  {
    sectionId: "attachments",
    bucketId: "attachments",
    label: "Attachments",
    shortLabel: "Attachments",
  },
];

export function getUploadTarget(
  sectionId: UploadSectionId,
  bucketId: UploadBucketId
) {
  return uploadTargets.find(
    (target) => target.sectionId === sectionId && target.bucketId === bucketId
  );
}
