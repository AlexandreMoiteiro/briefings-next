import {
  P2006T_FLEET,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v17";

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
} from "./p2006-mapper-definitions-v17";

const PERFORMANCE_STAGES = BASE_STAGES.filter(
  (stage) => stage.type === "performance"
) as Stage[];

const PAGE_TWO_STAGE = BASE_STAGES.find(
  (stage) => stage.id === "form-page-2-fields"
);

if (!PAGE_TWO_STAGE) {
  throw new Error("P2006T form page two stage is missing.");
}

function pageOneStageFor(registration: P2006TRegistration): Stage {
  const aircraft = P2006T_FLEET.find(
    (candidate) => candidate.registration === registration
  );
  const base = BASE_STAGES.find(
    (stage) => stage.id === `form-page-1-${registration.toLowerCase()}`
  );

  if (!aircraft || !base) {
    throw new Error(`P2006T page-one stage is missing for ${registration}.`);
  }

  const maxMassKg = aircraft.maxMassKg;
  const shortRegistration = registration.replace("CS-", "");

  const steps = base.steps
    .filter((step) => {
      if (step.id === "mass-limit-1180") return maxMassKg === 1180;
      if (step.id === "mass-limit-1230") return maxMassKg === 1230;
      return true;
    })
    .map((step): GuidedStep => {
      const metadata = {
        ...step.metadata,
        registration,
        maxMassKg,
      };

      if (step.id === `mass-limit-${maxMassKg}`) {
        return {
          ...step,
          group: `${registration} · operational maximum mass`,
          title: `${registration} · ${maxMassKg} kg maximum-mass line`,
          instruction:
            `Trace only the published ${maxMassKg} kg maximum-mass line on the ${registration} graph. ` +
            `For this aircraft, ${maxMassKg} kg is the applicable operational maximum mass.`,
          metadata: {
            ...metadata,
            operationalLimit: true,
          },
        };
      }

      return { ...step, metadata };
    });

  return {
    ...base,
    title: `${registration} · ${maxMassKg} kg · Form page 1 + Mass & Balance`,
    shortTitle: `${shortRegistration} M&B · ${maxMassKg}`,
    description:
      `${registration} has its own page-one background and coordinate set. ` +
      `The applicable maximum-mass limit is ${maxMassKg} kg; the other aircraft limit must not be used.`,
    steps,
  };
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES;

export const MASS_BALANCE_STEPS: GuidedStep[] = pageOneStageFor("CS-EAQ").steps;

export const STAGES: Stage[] = [
  ...PERFORMANCE_STAGES,
  pageOneStageFor("CS-EAQ"),
  pageOneStageFor("CS-EBX"),
  pageOneStageFor("D-GSEV"),
  PAGE_TWO_STAGE,
];
