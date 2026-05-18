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
  pilot: "Alexandre Moiteiro",
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
    description: "Dados principais da missão, piloto, aeronave, data e hora UTC.",
  },
  {
    id: "weather",
    title: "Weather",
    shortTitle: "Weather",
    description: "Cartas meteorológicas organizadas por tipo.",
  },
  {
    id: "notam",
    title: "NOTAM",
    shortTitle: "NOTAM",
    description: "PIB, SUP e outros documentos NOTAM.",
  },
  {
    id: "performance",
    title: "Performance & M&B",
    shortTitle: "Perf/M&B",
    description: "PDFs de performance e mass & balance.",
  },
  {
    id: "fpl",
    title: "FPL",
    shortTitle: "FPL",
    description: "Plano de voo e comprovativos relacionados.",
  },
  {
    id: "routes",
    title: "Routes",
    shortTitle: "Routes",
    description: "Pares de rota com NavLog e VFR Map.",
  },
  {
    id: "generate",
    title: "Generate PDF",
    shortTitle: "Generate",
    description: "Resumo final e futura geração do PDF.",
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
    label: "Weather · Outros",
    shortLabel: "Outros",
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
