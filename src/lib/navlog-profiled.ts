import {
  CUSTOM_AIRCRAFT_TYPE,
  applyAircraftProfile as applyBaseAircraftProfile,
  getRegistrationsForAircraft,
  navlogAircraftProfiles as baseAircraftProfiles,
  navlogDefaultSetup as baseDefaultSetup,
  type NavlogAircraftType,
  type NavlogSetupForm,
} from "./navlog";

export * from "./navlog";

export const navlogAircraftOptions = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
  CUSTOM_AIRCRAFT_TYPE,
] as const;

/**
 * P2006T operational defaults follow Sevenair Standard Profiles V2:
 * - normal/cruise climb target: 100 kt
 * - normal cruise target: 125 kt at 24 inHg / 2100 RPM
 * - cruise descent target: 120 kt
 *
 * The NavLog deliberately uses these simple operational profile values.
 * AFM table interpolation belongs only to the Performance workflow and its PDF.
 */
export const navlogAircraftProfiles = {
  ...baseAircraftProfiles,
  "Tecnam P2006T": {
    ...baseAircraftProfiles["Tecnam P2006T"],
    climbTas: 100,
    cruiseTas: 125,
    descentTas: 120,
    fuelFlowLh: 36,
    startEfob: 200,
    rocFpm: 850,
    rodFpm: 500,
  },
};

const p2006tProfile = navlogAircraftProfiles["Tecnam P2006T"];

export const navlogDefaultSetup: NavlogSetupForm = {
  ...baseDefaultSetup,
  aircraftType: "Tecnam P2006T",
  registration: "CS-EBX",
  climbTas: p2006tProfile.climbTas,
  cruiseTas: p2006tProfile.cruiseTas,
  descentTas: p2006tProfile.descentTas,
  fuelFlowLh: p2006tProfile.fuelFlowLh,
  taxiFuelL: p2006tProfile.taxiFuelL,
  taxiFuelFlowLh: p2006tProfile.taxiFuelFlowLh,
  startEfob: p2006tProfile.startEfob,
  taxiMin: p2006tProfile.taxiMin,
  rocFpm: p2006tProfile.rocFpm,
  rodFpm: p2006tProfile.rodFpm,
  defaultAltitude: p2006tProfile.defaultAltitude,
};

export function applyAircraftProfile(
  setup: NavlogSetupForm,
  aircraftType: NavlogAircraftType
): NavlogSetupForm {
  if (aircraftType === CUSTOM_AIRCRAFT_TYPE) {
    return applyBaseAircraftProfile(setup, aircraftType);
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
