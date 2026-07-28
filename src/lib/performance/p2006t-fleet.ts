export type P2006TRegistration = "CS-EAQ" | "CS-EBX" | "D-GSEV";

export type P2006TFleetAircraft = {
  registration: P2006TRegistration;
  serialNumber: string;
  buildYear: number;
  maxMassKg: 1180 | 1230;
  validationStatus: "draft" | "awaiting-builder";
  afmDocument: string;
  emptyMassKg?: number;
  emptyMomentKgm?: number;
  emptyDataSource?: string;
};

export const P2006T_FLEET: P2006TFleetAircraft[] = [
  {
    registration: "CS-EAQ",
    serialNumber: "046",
    buildYear: 2010,
    maxMassKg: 1180,
    validationStatus: "draft",
    afmDocument: "P2006T_CS-EAQ_AFM_Ed4r22_inc.Supp.pdf",
  },
  {
    registration: "CS-EBX",
    serialNumber: "184",
    buildYear: 2016,
    maxMassKg: 1230,
    validationStatus: "awaiting-builder",
    afmDocument: "P2006T_CS-EBX_AFM_Ed4r22_inc.Supp.pdf",
    emptyMassKg: 883,
    emptyMomentKgm: 370.86,
    emptyDataSource: "Aircraft weighing record · S/N 184",
  },
  {
    registration: "D-GSEV",
    serialNumber: "290",
    buildYear: 2019,
    maxMassKg: 1230,
    validationStatus: "awaiting-builder",
    afmDocument: "P2006T_D-GSEV_AFM_Ed4r22_inc.Supp.pdf",
    emptyMassKg: 879,
    emptyMomentKgm: 367,
    emptyDataSource: "Aircraft weighing record · S/N 290",
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
