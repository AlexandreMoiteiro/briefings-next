import {
  CUSTOM_AIRCRAFT_TYPE,
  applyAircraftProfile as applyBaseAircraftProfile,
  getRegistrationsForAircraft,
  navlogAircraftProfiles as baseAircraftProfiles,
  navlogDefaultSetup as baseDefaultSetup,
  type NavlogAircraftType,
  type NavlogSetupForm,
} from "./navlog";
import { P2006T_NAVLOG_DEFAULTS } from "./performance/p2006t-standard-profiles";

export * from "./navlog";

export const navlogAircraftOptions = [
  "Tecnam P2006T",
  "Tecnam P2008",
  "Piper PA-28",
  CUSTOM_AIRCRAFT_TYPE,
] as const;

/**
 * The P2006T NavLog deliberately uses the Sevenair standard operational
 * profiles instead of interpolating the complete AFM tables. Those tables
 * remain exclusive to the Performance workflow and its generated PDF.
 */
export const navlogAircraftProfiles = {
  ...baseAircraftProfiles,
  "Tecnam P2006T": {
    ...baseAircraftProfiles["Tecnam P2006T"],
    climbTas: P2006T_NAVLOG_DEFAULTS.climbTasKt,
    cruiseTas: P2006T_NAVLOG_DEFAULTS.cruiseTasKt,
    descentTas: P2006T_NAVLOG_DEFAULTS.descentTasKt,
    fuelFlowLh: P2006T_NAVLOG_DEFAULTS.fuelFlowLh,
    taxiFuelL: P2006T_NAVLOG_DEFAULTS.taxiFuelL,
    taxiFuelFlowLh: P2006T_NAVLOG_DEFAULTS.taxiFuelFlowLh,
    startEfob: P2006T_NAVLOG_DEFAULTS.startEfobL,
    taxiMin: P2006T_NAVLOG_DEFAULTS.taxiMin,
    rocFpm: P2006T_NAVLOG_DEFAULTS.rocFpm,
    rodFpm: P2006T_NAVLOG_DEFAULTS.rodFpm,
    defaultAltitude: P2006T_NAVLOG_DEFAULTS.defaultAltitudeFt,
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
