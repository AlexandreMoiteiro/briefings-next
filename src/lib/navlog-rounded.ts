import {
  CUSTOM_AIRCRAFT_TYPE,
  getRegistrationsForAircraft,
  navlogAircraftProfiles as baseProfiles,
  navlogDefaultSetup as baseDefaultSetup,
  type NavlogAircraftType,
  type NavlogSetupForm,
} from "./navlog";

export * from "./navlog";

export const navlogAircraftProfiles = {
  ...baseProfiles,
  "Tecnam P2006T": {
    ...baseProfiles["Tecnam P2006T"],
    startEfob: 200,
  },
};

export const navlogDefaultSetup: NavlogSetupForm = {
  ...baseDefaultSetup,
  startEfob: 200,
};

const blankCustomProfile = {
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

export function applyAircraftProfile(
  setup: NavlogSetupForm,
  aircraftType: NavlogAircraftType
): NavlogSetupForm {
  if (aircraftType === CUSTOM_AIRCRAFT_TYPE) {
    return {
      ...setup,
      ...blankCustomProfile,
      aircraftType,
      registration: "",
    };
  }

  const profile = navlogAircraftProfiles[aircraftType];
  const registrations = getRegistrationsForAircraft(aircraftType);

  return {
    ...setup,
    ...profile,
    aircraftType,
    registration: registrations.includes(setup.registration)
      ? setup.registration
      : registrations[0],
  };
}
