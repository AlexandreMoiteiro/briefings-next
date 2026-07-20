export const CUSTOM_AIRCRAFT_TYPE = "Custom aircraft" as const;

export const navlogAircraftOptions = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
  CUSTOM_AIRCRAFT_TYPE,
] as const;

export type NavlogAircraftType = (typeof navlogAircraftOptions)[number];

export type NavlogReferenceLayer = "IFR" | "VOR" | "AD" | "VFR" | "PROC";

export type NavlogSetupForm = {
  aircraftType: NavlogAircraftType;
  registration: string;
  callsign: string;
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

type NavlogAircraftProfile = {
  climbTas: number;
  cruiseTas: number;
  descentTas: number;
  fuelFlowLh: number;
  taxiFuelL: number;
  taxiFuelFlowLh: number;
  startEfob: number;
  taxiMin: number;
  rocFpm: number;
  rodFpm: number;
  defaultAltitude: number;
};

export const navlogAircraftProfiles: Record<
  Exclude<NavlogAircraftType, typeof CUSTOM_AIRCRAFT_TYPE>,
  NavlogAircraftProfile
> = {
  "Tecnam P2006T": {
    climbTas: 100,
    cruiseTas: 125,
    descentTas: 120,
    fuelFlowLh: 36,
    taxiFuelL: 5,
    taxiFuelFlowLh: 16,
    startEfob: 194.4,
    taxiMin: 20,
    rocFpm: 850,
    rodFpm: 500,
    defaultAltitude: 3000,
  },
  "Tecnam P2008": {
    climbTas: 70,
    cruiseTas: 90,
    descentTas: 90,
    fuelFlowLh: 20,
    taxiFuelL: 3,
    taxiFuelFlowLh: 8,
    startEfob: 120,
    taxiMin: 20,
    rocFpm: 600,
    rodFpm: 500,
    defaultAltitude: 3000,
  },
  "Piper PA-28": {
    climbTas: 76,
    cruiseTas: 110,
    descentTas: 100,
    fuelFlowLh: 38,
    taxiFuelL: 5,
    taxiFuelFlowLh: 13.5,
    startEfob: 180,
    taxiMin: 20,
    rocFpm: 600,
    rodFpm: 500,
    defaultAltitude: 3000,
  },
};

const blankCustomAircraftProfile: NavlogAircraftProfile = {
  climbTas: 0,
  cruiseTas: 0,
  descentTas: 0,
  fuelFlowLh: 0,
  taxiFuelL: 0,
  taxiFuelFlowLh: 0,
  startEfob: 0,
  taxiMin: 0,
  rocFpm: 0,
  rodFpm: 0,
  defaultAltitude: 0,
};

export const p2006tRegistrations = ["CS-EAQ", "CS-EBX", "D-GSEV"];

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
  "OE-KPH",
];

export const navlogReferenceLayers: NavlogReferenceLayer[] = [
  "IFR",
  "VOR",
  "AD",
  "VFR",
];

const defaultProfile = navlogAircraftProfiles["Tecnam P2006T"];

export const navlogDefaultSetup: NavlogSetupForm = {
  aircraftType: "Tecnam P2006T",
  registration: "CS-EBX",
  callsign: "RVP",
  climbTas: defaultProfile.climbTas,
  cruiseTas: defaultProfile.cruiseTas,
  descentTas: defaultProfile.descentTas,
  fuelFlowLh: defaultProfile.fuelFlowLh,
  taxiFuelL: defaultProfile.taxiFuelL,
  taxiFuelFlowLh: defaultProfile.taxiFuelFlowLh,
  startEfob: defaultProfile.startEfob,
  startClock: "",
  onBlockClock: "",
  lesson: "",
  instructor: "",
  student: "",
  taxiMin: defaultProfile.taxiMin,
  windFrom: 0,
  windKt: 0,
  useGlobalWind: true,
  magVar: 1.0,
  magDirection: "W",
  rocFpm: defaultProfile.rocFpm,
  rodFpm: defaultProfile.rodFpm,
  defaultAltitude: defaultProfile.defaultAltitude,
  showReferencePoints: true,
  referenceLayers: navlogReferenceLayers,
  showAirways: true,
  showOpenAip: true,
  openAipOpacity: 0.65,
};

export function getAircraftTypeFromRegistration(
  registration: string
): NavlogAircraftType {
  if (p2006tRegistrations.includes(registration)) return "Tecnam P2006T";
  if (registration.startsWith("CS-")) return "Tecnam P2008";
  if (registration.startsWith("OE-")) return "Piper PA-28";
  return CUSTOM_AIRCRAFT_TYPE;
}

export function getRegistrationsForAircraft(aircraftType: NavlogAircraftType) {
  if (aircraftType === "Tecnam P2006T") return p2006tRegistrations;
  if (aircraftType === "Tecnam P2008") return tecnamRegistrations;
  if (aircraftType === "Piper PA-28") return piperRegistrations;
  return [];
}

export function applyAircraftProfile(
  setup: NavlogSetupForm,
  aircraftType: NavlogAircraftType
): NavlogSetupForm {
  if (aircraftType === CUSTOM_AIRCRAFT_TYPE) {
    return {
      ...setup,
      aircraftType,
      registration: "",
      climbTas: blankCustomAircraftProfile.climbTas,
      cruiseTas: blankCustomAircraftProfile.cruiseTas,
      descentTas: blankCustomAircraftProfile.descentTas,
      fuelFlowLh: blankCustomAircraftProfile.fuelFlowLh,
      taxiFuelL: blankCustomAircraftProfile.taxiFuelL,
      taxiFuelFlowLh: blankCustomAircraftProfile.taxiFuelFlowLh,
      startEfob: blankCustomAircraftProfile.startEfob,
      taxiMin: blankCustomAircraftProfile.taxiMin,
      rocFpm: blankCustomAircraftProfile.rocFpm,
      rodFpm: blankCustomAircraftProfile.rodFpm,
      defaultAltitude: blankCustomAircraftProfile.defaultAltitude,
    };
  }

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
    taxiMin: profile.taxiMin,
    rocFpm: profile.rocFpm,
    rodFpm: profile.rodFpm,
    defaultAltitude: profile.defaultAltitude,
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
  suppressAutoVertical?: boolean;
  alternateMarker?: boolean;
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
  suppressAutoVertical?: boolean;
  alternateMarker?: boolean;
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
