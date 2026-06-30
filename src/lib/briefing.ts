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
    description: "Main mission details: pilot, aircraft, date and UTC time.",
  },
  {
    id: "weather",
    title: "Weather",
    shortTitle: "Weather",
    description: "Weather charts organised by type.",
  },
  {
    id: "notam",
    title: "NOTAM",
    shortTitle: "NOTAM",
    description: "PIB, SUP and other NOTAM documents.",
  },
  {
    id: "performance",
    title: "Performance & M&B",
    shortTitle: "Perf/M&B",
    description: "Performance and mass & balance PDFs.",
  },
  {
    id: "fpl",
    title: "FPL",
    shortTitle: "FPL",
    description: "Flight plan and related confirmations.",
  },
  {
    id: "routes",
    title: "Routes",
    shortTitle: "Routes",
    description: "Route pairs with NavLog and VFR Map.",
  },
  {
    id: "generate",
    title: "Generate PDF",
    shortTitle: "Generate",
    description: "Final review and PDF generation.",
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

export function getUploadTarget(sectionId: UploadSectionId, bucketId: UploadBucketId) {
  return uploadTargets.find(
    (target) => target.sectionId === sectionId && target.bucketId === bucketId
  );
}
