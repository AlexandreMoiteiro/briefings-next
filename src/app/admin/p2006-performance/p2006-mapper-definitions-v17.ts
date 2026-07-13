import {
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v16";

export type {
  Point,
  Rect,
  StepMetadata,
  CaptureKind,
  Capture,
  CaptureStore,
  GuidedStep,
  SourceAsset,
  PerformanceSourceDefinition,
  Stage,
} from "./p2006-mapper-definitions-v16";

type PageOneRegistration = "CS-EAQ" | "CS-EBX" | "D-GSEV";

const BASE_PAGE_ONE = BASE_STAGES.find(
  (stage) => stage.id === "mass-balance-graph"
);
const FORM_PAGE_2_STAGE = BASE_STAGES.find(
  (stage) => stage.id === "form-page-2-fields"
);

if (!BASE_PAGE_ONE || !FORM_PAGE_2_STAGE) {
  throw new Error("P2006T form stages are incomplete.");
}

const MAX_MASS_BY_REGISTRATION: Record<PageOneRegistration, 1180 | 1230> = {
  "CS-EAQ": 1180,
  "CS-EBX": 1230,
  "D-GSEV": 1230,
};

function pageOneSteps(
  registration: PageOneRegistration,
  maxMassKg: 1180 | 1230
): GuidedStep[] {
  return BASE_PAGE_ONE.steps
    .filter((step) => {
      if (step.id === "mass-limit-1180") return maxMassKg === 1180;
      if (step.id === "mass-limit-1230") return maxMassKg === 1230;
      return true;
    })
    .map((step) => {
      if (step.id !== `mass-limit-${maxMassKg}`) {
        return {
          ...step,
          metadata: {
            ...step.metadata,
            registration,
            maxMassKg,
          },
        };
      }

      return {
        ...step,
        group: `${registration} maximum mass`,
        title: `${registration} · ${maxMassKg} kg maximum-mass line`,
        instruction:
          `Trace the complete ${maxMassKg} kg maximum-mass line published on the ${registration} graph. ` +
          "Do not use the other aircraft maximum-mass line.",
        metadata: {
          ...step.metadata,
          registration,
          maxMassKg,
          operationalLimit: true,
        },
      };
    });
}

function pageOneStage(registration: PageOneRegistration): Stage {
  const maxMassKg = MAX_MASS_BY_REGISTRATION[registration];
  const shortRegistration = registration.replace("CS-", "");

  return {
    id: `form-page-1-${registration.toLowerCase()}`,
    type: "mass-balance",
    title: `${registration} · Form page 1 · Loading data and Mass & Balance`,
    shortTitle: `${shortRegistration} Form + M&B`,
    description:
      `${registration} uses its own uploaded page-one background and its own coordinate set. ` +
      `The applicable maximum-mass graph line is ${maxMassKg} kg. Loading fields and the M&B graph remain on one physical page.`,
    page: 1,
    steps: pageOneSteps(registration, maxMassKg),
  };
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES;

export const MASS_BALANCE_STEPS: GuidedStep[] = BASE_PAGE_ONE.steps;

const PERFORMANCE_STAGES = BASE_STAGES.filter(
  (stage) => stage.type === "performance"
) as Stage[];

export const STAGES: Stage[] = [
  ...PERFORMANCE_STAGES,
  pageOneStage("CS-EAQ"),
  pageOneStage("CS-EBX"),
  pageOneStage("D-GSEV"),
  FORM_PAGE_2_STAGE,
];
