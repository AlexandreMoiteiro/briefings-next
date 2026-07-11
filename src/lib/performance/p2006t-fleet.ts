export type P2006TRegistration = "CS-EAQ" | "CS-EBX" | "D-GSEV";

export type P2006TFleetAircraft = {
  registration: P2006TRegistration;
  serialNumber: string;
  buildYear: number;
  validationStatus: "draft" | "awaiting-builder";
  afmDocument: string;
};

export const P2006T_FLEET: P2006TFleetAircraft[] = [
  {
    registration: "CS-EAQ",
    serialNumber: "046",
    buildYear: 2010,
    validationStatus: "draft",
    afmDocument: "P2006T_CS-EAQ_AFM_Ed4r22_inc.Supp.pdf",
  },
  {
    registration: "CS-EBX",
    serialNumber: "184",
    buildYear: 2016,
    validationStatus: "awaiting-builder",
    afmDocument: "P2006T_CS-EBX_AFM_Ed4r22_inc.Supp.pdf",
  },
  {
    registration: "D-GSEV",
    serialNumber: "290",
    buildYear: 2019,
    validationStatus: "awaiting-builder",
    afmDocument: "P2006T_D-GSEV_AFM_Ed4r22_inc.Supp.pdf",
  },
];

export const P2006T_REGISTRATIONS = P2006T_FLEET.map(
  (aircraft) => aircraft.registration
);

export function getP2006TFleetAircraft(registration: P2006TRegistration) {
  return P2006T_FLEET.find(
    (aircraft) => aircraft.registration === registration
  )!;
}
