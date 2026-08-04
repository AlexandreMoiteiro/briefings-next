"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  P2006T_ADDITIONAL_TABLES,
  p2006TAdditionalTableKey,
  readP2006TAdditionalTableMappings,
} from "@/lib/performance/p2006t-additional-table-mapper";
import { STAGES, type CaptureStore } from "./p2006-mapper-definitions";
import { P2006TSourceMapper as LegacyMapper } from "./p2006-source-mapper-v27";
import { P2006TAdditionalTableMapper } from "./p2006-additional-table-mapper";

const BASE_STORAGE_KEY = "briefings_p2006_guided_mapper_v6";

type ActiveStage =
  | { kind: "base"; index: number }
  | { kind: "additional"; index: number };

type NavigationItem =
  | {
      key: string;
      kind: "base";
      index: number;
      shortTitle: string;
      title: string;
      group: string;
    }
  | {
      key: string;
      kind: "additional";
      index: number;
      shortTitle: string;
      title: string;
      group: string;
    };

function baseMappingKey(
  stageIndex: number,
  registration: P2006TRegistration,
  stepId: string
) {
  const stage = STAGES[stageIndex];
  return stage.type === "performance"
    ? `${stage.id}:${registration}:${stepId}`
    : `shared:${stage.id}:${stepId}`;
}

function readBaseCaptures() {
  try {
    const raw = window.localStorage.getItem(BASE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CaptureStore) : {};
  } catch {
    return {} as CaptureStore;
  }
}

function sameActive(left: ActiveStage, right: ActiveStage) {
  return left.kind === right.kind && left.index === right.index;
}

export function P2006TSourceMapper() {
  const legacyRef = useRef<HTMLDivElement>(null);
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [active, setActive] = useState<ActiveStage>({ kind: "base", index: 0 });
  const [revision, setRevision] = useState(0);

  const navigation = useMemo<NavigationItem[]>(() => {
    const performance = STAGES.flatMap((stage, index) =>
      stage.type === "performance"
        ? [
            {
              key: `base-${stage.id}`,
              kind: "base" as const,
              index,
              shortTitle: stage.shortTitle,
              title: stage.title,
              group:
                stage.source?.performanceKind === "takeoff"
                  ? "Take-off"
                  : "Landing",
            },
          ]
        : []
    );
    const additional = P2006T_ADDITIONAL_TABLES.map((definition, index) => ({
      key: `additional-${definition.id}`,
      kind: "additional" as const,
      index,
      shortTitle: definition.shortTitle,
      title: definition.title,
      group: definition.group,
    }));
    const shared = STAGES.flatMap((stage, index) =>
      stage.type !== "performance"
        ? [
            {
              key: `base-${stage.id}`,
              kind: "base" as const,
              index,
              shortTitle: stage.shortTitle,
              title: stage.title,
              group: stage.type === "mass-balance" ? "M&B" : "Form",
            },
          ]
        : []
    );
    return [...performance, ...additional, ...shared];
  }, []);

  const activeNavigationIndex = navigation.findIndex(
    (item) => item.kind === active.kind && item.index === active.index
  );
  const activeBaseStage = active.kind === "base" ? STAGES[active.index] : null;
  const showFormUpload = Boolean(
    activeBaseStage && activeBaseStage.type !== "performance"
  );

  useEffect(() => {
    if (active.kind !== "base") return;

    const synchronize = () => {
      const root = legacyRef.current;
      if (!root) return;
      const aircraftSelect = Array.from(
        root.querySelectorAll<HTMLSelectElement>("select")
      ).find((select) =>
        Array.from(select.options).some((option) => option.value === "CS-EAQ")
      );
      if (aircraftSelect && aircraftSelect.value !== registration) {
        aircraftSelect.value = registration;
        aircraftSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const mapperNav = root.querySelector("section nav");
      const buttons = mapperNav?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.[active.index]?.click();
    };

    const animation = window.requestAnimationFrame(synchronize);
    const timeout = window.setTimeout(synchronize, 220);
    return () => {
      window.cancelAnimationFrame(animation);
      window.clearTimeout(timeout);
    };
  }, [active, registration]);

  useEffect(() => {
    const root = legacyRef.current;
    if (!root) return;

    const synchronizeSelectedStage = () => {
      if (active.kind !== "base") return;
      const buttons = Array.from(
        root.querySelectorAll<HTMLButtonElement>("section nav button")
      );
      const selectedIndex = buttons.findIndex((button) =>
        button.className.includes("bg-zinc-950")
      );
      if (selectedIndex >= 0 && selectedIndex !== active.index) {
        setActive({ kind: "base", index: selectedIndex });
      }
    };

    const observer = new MutationObserver(synchronizeSelectedStage);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    const interval = window.setInterval(() => setRevision((value) => value + 1), 700);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [active]);

  const progressByKey = useMemo(() => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    const captures = readBaseCaptures();
    const additionalMappings = readP2006TAdditionalTableMappings();
    return Object.fromEntries(
      navigation.map((item) => {
        if (item.kind === "additional") {
          const definition = P2006T_ADDITIONAL_TABLES[item.index];
          const mapping =
            additionalMappings[
              p2006TAdditionalTableKey(definition.id, registration)
            ];
          return [item.key, mapping?.confirmed ? "1/1" : "0/1"];
        }
        const stage = STAGES[item.index];
        const complete = stage.steps.filter(
          (step) =>
            captures[baseMappingKey(item.index, registration, step.id)]?.confirmed
        ).length;
        return [item.key, `${complete}/${stage.steps.length}`];
      })
    );
  }, [navigation, registration, revision]);

  function activate(item: NavigationItem) {
    const next: ActiveStage = { kind: item.kind, index: item.index };
    if (!sameActive(active, next)) setActive(next);
  }

  function move(offset: number) {
    const current = activeNavigationIndex >= 0 ? activeNavigationIndex : 0;
    const next = Math.max(0, Math.min(navigation.length - 1, current + offset));
    activate(navigation[next]);
  }

  const activeAdditional =
    active.kind === "additional" ? P2006T_ADDITIONAL_TABLES[active.index] : null;

  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              Guided visual audit mapper
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              Todas as tabelas P2006T no mesmo mapper
            </h2>
            <p className="mt-2 max-w-5xl text-sm leading-6 text-zinc-600">
              Take-off, landing, climb Vy/Vx, OEI VySE e cruise usam a mesma
              navegação, a mesma revisão visual da grelha e o mesmo fluxo de
              confirmar, redetetar, delimitar manualmente e guardar. As páginas
              de formulário e Mass &amp; Balance continuam no fim do mesmo percurso.
            </p>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Aeronave / suplemento AFM
            </span>
            <select
              value={registration}
              onChange={(event) =>
                setRegistration(event.target.value as P2006TRegistration)
              }
              className="block rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              {P2006T_REGISTRATIONS.map((candidate) => (
                <option key={candidate}>{candidate}</option>
              ))}
            </select>
          </label>
        </div>

        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {navigation.map((item) => {
            const selected =
              item.kind === active.kind && item.index === active.index;
            return (
              <button
                key={item.key}
                type="button"
                title={item.title}
                onClick={() => activate(item)}
                className={[
                  "rounded-2xl border p-3 text-left",
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-sky-200 bg-white text-zinc-700",
                ].join(" ")}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  {item.group}
                </span>
                <span className="mt-1 block text-sm font-semibold">
                  {item.shortTitle}
                </span>
                <span className="mt-1 block text-xs opacity-70">
                  {progressByKey[item.key] ?? "0/1"} concluído · {item.kind === "base" && STAGES[item.index].type !== "performance" ? "partilhado" : registration}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      <div
        ref={legacyRef}
        className="p2006-unified-legacy"
        data-table-visible={active.kind === "base" ? "true" : "false"}
        data-upload-visible={showFormUpload ? "true" : "false"}
      >
        <LegacyMapper />
      </div>

      {activeAdditional ? (
        <P2006TAdditionalTableMapper
          definition={activeAdditional}
          registration={registration}
          onPrevious={() => move(-1)}
          onNext={() => move(1)}
          onProgressChange={() => setRevision((value) => value + 1)}
        />
      ) : null}

      <style jsx global>{`
        .p2006-unified-legacy
          > div
          > section:nth-of-type(2)
          > div:first-child,
        .p2006-unified-legacy > div > section:nth-of-type(2) > nav {
          display: none;
        }

        .p2006-unified-legacy[data-table-visible="false"]
          > div
          > section:nth-of-type(2) {
          display: none;
        }

        .p2006-unified-legacy[data-upload-visible="false"]
          > div
          > section:first-of-type {
          display: none;
        }
      `}</style>
    </div>
  );
}
