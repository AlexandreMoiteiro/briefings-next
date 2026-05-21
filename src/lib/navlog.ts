export type NavlogAircraftType = "Tecnam P2008" | "Piper PA-28";

export type NavlogReferenceLayer = "IFR" | "VOR" | "AD" | "VFR" | "PROC";

export type NavlogSetupForm = {
  aircraftType: NavlogAircraftType;
  registration: string;

  climbTas: number;
  cruiseTas: number;
  descentTas: number;

  fuelFlowLh: number;
  taxiFuelL: number;
  taxiFuelFlowLh: number;
  startEfob: number;
  startClock: string;
  onBlockClock: string;
  lesson: string;
  instructor: string;
  student: string;
  taxiMin: number;

  windFrom: number;
  windKt: number;
  useGlobalWind: boolean;

  magVar: number;
  magDirection: "E" | "W";

  rocFpm: number;
  rodFpm: number;
  defaultAltitude: number;

  showReferencePoints: boolean;
  referenceLayers: NavlogReferenceLayer[];
  showAirways: boolean;
  showOpenAip: boolean;
  openAipOpacity: number;
};

export const navlogAircraftProfiles: Record<
  NavlogAircraftType,
  {
    climbTas: number;
    cruiseTas: number;
    descentTas: number;
    fuelFlowLh: number;
    taxiFuelL: number;
    taxiFuelFlowLh: number;
    startEfob: number;
  }
> = {
  "Tecnam P2008": {
    climbTas: 70,
    cruiseTas: 90,
    descentTas: 90,
    fuelFlowLh: 20,
    taxiFuelL: 3,
    taxiFuelFlowLh: 8,
    startEfob: 120,
  },
  "Piper PA-28": {
    climbTas: 76,
    cruiseTas: 110,
    descentTas: 100,
    fuelFlowLh: 38,
    taxiFuelL: 5,
    taxiFuelFlowLh: 13.5,
    startEfob: 180,
  },
};

export const tecnamRegistrations = [
  "CS-DHS",
  "CS-DHT",
  "CS-DHU",
  "CS-DHV",
  "CS-DHW",
  "CS-ECC",
  "CS-ECD",
];

export const piperRegistrations = [
  "OE-KPD",
  "OE-KPE",
  "OE-KPG",
  "OE-KPP",
  "OE-KPJ",
  "OE-KPF",
];

export const navlogReferenceLayers: NavlogReferenceLayer[] = [
  "IFR",
  "VOR",
  "AD",
  "VFR",
];

export const navlogDefaultSetup: NavlogSetupForm = {
  aircraftType: "Piper PA-28",
  registration: "OE-KPE",

  climbTas: navlogAircraftProfiles["Piper PA-28"].climbTas,
  cruiseTas: navlogAircraftProfiles["Piper PA-28"].cruiseTas,
  descentTas: navlogAircraftProfiles["Piper PA-28"].descentTas,

  fuelFlowLh: navlogAircraftProfiles["Piper PA-28"].fuelFlowLh,
  taxiFuelL: navlogAircraftProfiles["Piper PA-28"].taxiFuelL,
  taxiFuelFlowLh: navlogAircraftProfiles["Piper PA-28"].taxiFuelFlowLh,
  startEfob: navlogAircraftProfiles["Piper PA-28"].startEfob,
  startClock: "",
  onBlockClock: "",
  lesson: "",
  instructor: "",
  student: "AMOIT",
  taxiMin: 20,

  windFrom: 0,
  windKt: 0,
  useGlobalWind: true,

  magVar: 1.0,
  magDirection: "W",

  rocFpm: 600,
  rodFpm: 500,
  defaultAltitude: 3000,

  showReferencePoints: true,
  referenceLayers: navlogReferenceLayers,
  showAirways: true,
  showOpenAip: true,
  openAipOpacity: 0.65,
};

export function getAircraftTypeFromRegistration(
  registration: string
): NavlogAircraftType {
  if (registration.startsWith("CS-")) return "Tecnam P2008";
  return "Piper PA-28";
}

export function getRegistrationsForAircraft(aircraftType: NavlogAircraftType) {
  return aircraftType === "Tecnam P2008"
    ? tecnamRegistrations
    : piperRegistrations;
}

export function applyAircraftProfile(
  setup: NavlogSetupForm,
  aircraftType: NavlogAircraftType
): NavlogSetupForm {
  const profile = navlogAircraftProfiles[aircraftType];
  const registrations = getRegistrationsForAircraft(aircraftType);

  return {
    ...setup,
    aircraftType,
    registration: registrations.includes(setup.registration)
      ? setup.registration
      : registrations[0],
    climbTas: profile.climbTas,
    cruiseTas: profile.cruiseTas,
    descentTas: profile.descentTas,
    fuelFlowLh: profile.fuelFlowLh,
    taxiFuelL: profile.taxiFuelL,
    taxiFuelFlowLh: profile.taxiFuelFlowLh,
    startEfob: profile.startEfob,
  };
}

export type NavlogPointSource = "AD" | "VFR" | "VOR" | "IFR" | "PROC";

export type NavlogPoint = {
  code: string;
  name: string;
  lat: number;
  lon: number;
  alt: number;
  src: NavlogPointSource;
  routes: string;
  remarks: string;
};

export type NavlogVor = {
  ident: string;
  name: string;
  freqMhz: number;
  lat: number;
  lon: number;
};

export type NavlogAirway = {
  airway: string;
  seq: number;
  point: string;
  lat: number;
  lon: number;
  routeType: string;
  lower: string;
  upper: string;
  mea: string;
  remarks: string;
};

export type NavlogProcedure = {
  id: string;
  name: string;
  kind: string;
  runway?: string;
  transition?: string;
};

export type NavlogDataBundle = {
  points: NavlogPoint[];
  vors: NavlogVor[];
  airways: NavlogAirway[];
  procedures: NavlogProcedure[];
};

export type NavlogRouteWaypoint = {
  id: string;
  point: NavlogPoint;
  altitudeFt: number;
  useGlobalWind: boolean;
  windFrom: number;
  windKt: number;
  stopMin: number;
  note: string;
  vorPref: "AUTO" | "FIXED";
  vorIdent: string;
};

export type NavlogRouteNode = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  alt: number;
  src: string;
  note: string;
  stopMin: number;
  useGlobalWind: boolean;
  windFrom: number;
  windKt: number;
  vorPref: "AUTO" | "FIXED";
  vorIdent: string;
  calcDetail?: string;
};

export type NavlogLegProfile = "CLIMB" | "LEVEL" | "DESCENT" | "STOP";

export type NavlogLeg = {
  i: number;
  from: NavlogRouteNode;
  to: NavlogRouteNode;
  profile: NavlogLegProfile;
  tc: number;
  th: number;
  mh: number;
  tas: number;
  gs: number;
  distNm: number;
  eteSec: number;
  burnL: number;
  holdSec: number;
  holdBurnL: number;
  efobStartL: number;
  efobAfterLegL: number;
  efobEndL: number;
  clockStart: string;
  clockArrive: string;
  clockEnd: string;
  windFrom: number;
  windKt: number;
  tracking: string;
};

export type NavlogCalculationResult = {
  nodes: NavlogRouteNode[];
  legs: NavlogLeg[];
};
