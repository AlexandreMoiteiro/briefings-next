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
import {
  getP2006TBaseGrid,
  p2006TBaseMappingKey,
  readP2006TBaseCaptures,
  setP2006TBaseGrid,
  writeP2006TBaseCaptures,
} from "./p2006-base-grid-storage";
import { P2006TGridFineAdjustment } from "./p2006-grid-fine-adjustment";
import { STAGES } from "./p2006-mapper-definitions";
import { P2006TSourceMapper as LegacyMapper } from "./p2006-source-mapper-v27";
import { P2006TAdditionalTableMapper } from "./p2006-additional-table-mapper";

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

function sameActive(left: ActiveStage, right: ActiveStage) {
  return left.kind === right.kind && left.index === right.index;
}

function liveProgressKey(
  registration: P2006TRegistration,
  stageId: string
) {
  return `${registration}:${stageId}`;
}

function progressText(button: HTMLButtonElement) {
  const text = button.textContent ?? "";
  const match = text.match(/(\d+)\s*\/\s*(\d+)\s*complete/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function sameRecord(left: Record<string, string>, right: Record<string, string>) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
}

export function P2006TSourceMapper() {
  const legacyRef = useRef<HTMLDivElement>(null);
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [active, setActive] = useState<ActiveStage>({ kind: "base", index: 0 });
  const [revision, setRevision] = useState(0);
  const [legacyRevision, setLegacyRevision] = useState(0);
  const [liveBaseProgress, setLiveBaseProgress] = useState<Record<string, string>>(
    {}
  );
  const [baseAdjustmentStatus, setBaseAdjustmentStatus] = useState("");

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
  }, [active, legacyRevision, registration]);

  useEffect(() => {
    const root = legacyRef.current;
    if (!root) return;

    const synchronizeLegacyState = () => {
      const buttons = Array.from(
        root.querySelectorAll<HTMLButtonElement>("section nav button")
      ).slice(0, STAGES.length);

      if (active.kind === "base") {
        const selectedIndex = buttons.findIndex((button) =>
          button.className.includes("bg-zinc-950")
        );
        if (selectedIndex >= 0 && selectedIndex !== active.index) {
          setActive({ kind: "base", index: selectedIndex });
        }
      }

      const nextProgress = { ...liveBaseProgress };
      buttons.forEach((button, stageIndex) => {
        const value = progressText(button);
        if (!value) return;
        nextProgress[
          liveProgressKey(registration, STAGES[stageIndex].id)
        ] = value;
      });
      if (!sameRecord(liveBaseProgress, nextProgress)) {
        setLiveBaseProgress(nextProgress);
      }
    };

    synchronizeLegacyState();
    const observer = new MutationObserver(synchronizeLegacyState);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    const interval = window.setInterval(() => {
      synchronizeLegacyState();
      setRevision((value) => value + 1);
    }, 700);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [active, legacyRevision, liveBaseProgress, registration]);

  const progressByKey = useMemo(() => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    const captures = readP2006TBaseCaptures();
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
        const live =
          liveBaseProgress[liveProgressKey(registration, stage.id)];
        if (live) return [item.key, live];
        const complete = stage.steps.filter(
          (step) =>
            captures[
              p2006TBaseMappingKey(stage, registration, step.id)
            ]?.confirmed
        ).length;
        return [item.key, `${complete}/${stage.steps.length}`];
      })
    );
  }, [liveBaseProgress, navigation, registration, revision]);

  const activeBaseGrid = useMemo(() => {
    if (!activeBaseStage || activeBaseStage.type !== "performance") return null;
    return getP2006TBaseGrid(
      readP2006TBaseCaptures(),
      activeBaseStage,
      registration
    );
  }, [activeBaseStage, legacyRevision, registration, revision]);

  function activate(item: NavigationItem) {
    const next: ActiveStage = { kind: item.kind, index: item.index };
    if (!sameActive(active, next)) {
      setActive(next);
      setBaseAdjustmentStatus("");
    }
  }

  function move(offset: number) {
    const current = activeNavigationIndex >= 0 ? activeNavigationIndex : 0;
    const next = Math.max(0, Math.min(navigation.length - 1, current + offset));
    activate(navigation[next]);
  }

  function saveLegacyReactState() {
    const root = legacyRef.current;
    const button = Array.from(root?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
      (candidate) =>
        candidate.textContent?.trim() === "Save browser progress"
    );
    button?.click();
  }

  function adjustBaseGrid(nextGrid: {
    columnCenters: number[];
    rowCenters: number[];
    confirmed: boolean;
  }) {
    if (!activeBaseStage || activeBaseStage.type !== "performance") return;
    saveLegacyReactState();

    window.setTimeout(() => {
      const captures = readP2006TBaseCaptures();
      const current = getP2006TBaseGrid(
        captures,
        activeBaseStage,
        registration
      );
      const updated = setP2006TBaseGrid(
        captures,
        activeBaseStage,
        registration,
        {
          ...nextGrid,
          confirmed: false,
        }
      );
      writeP2006TBaseCaptures(updated);
      setBaseAdjustmentStatus(
        current?.confirmed
          ? "A grelha foi ajustada e ficou por reconfirmar. Os restantes itens concluídos foram preservados."
          : "Ajuste guardado. Confirme a grelha quando estiver alinhada."
      );
      setLegacyRevision((value) => value + 1);
      setRevision((value) => value + 1);
    }, 60);
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
              navegação. O progresso mostrado inclui imediatamente o estado real do
              mapper e os antigos mapas T/O e landing são migrados para a grelha
              atual, sem obrigar a repetir trabalho já concluído.
            </p>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Aeronave / suplemento AFM
            </span>
            <select
              value={registration}
              onChange={(event) => {
                setRegistration(event.target.value as P2006TRegistration);
                setBaseAdjustmentStatus("");
              }}
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
                  {progressByKey[item.key] ?? "0/1"} concluído ·{" "}
                  {item.kind === "base" &&
                  STAGES[item.index].type !== "performance"
                    ? "partilhado"
                    : registration}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {activeBaseGrid && activeBaseStage?.type === "performance" ? (
        <P2006TGridFineAdjustment
          grid={activeBaseGrid}
          columnLabels={["-25 °C", "0 °C", "25 °C", "50 °C", "ISA"]}
          title={`${activeBaseStage.shortTitle} · ajuste manual da grelha`}
          onChange={adjustBaseGrid}
        />
      ) : null}

      {baseAdjustmentStatus ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {baseAdjustmentStatus}
        </p>
      ) : null}

      <div
        ref={legacyRef}
        className="p2006-unified-legacy"
        data-table-visible={active.kind === "base" ? "true" : "false"}
        data-upload-visible={showFormUpload ? "true" : "false"}
      >
        <LegacyMapper key={legacyRevision} />
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
