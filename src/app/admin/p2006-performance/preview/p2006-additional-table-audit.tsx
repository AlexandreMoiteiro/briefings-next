"use client";

import { useEffect, useMemo, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  P2006T_ADDITIONAL_TABLES,
  initialP2006TAdditionalTableMapping,
  p2006TAdditionalTableKey,
  readP2006TAdditionalTableMappings,
  type P2006TAdditionalTableDefinition,
  type P2006TTableMapping,
} from "@/lib/performance/p2006t-additional-table-mapper";

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function boundaries(centers: number[]) {
  if (!centers.length) return [];
  if (centers.length === 1) {
    return [clamp(centers[0] - 0.01), clamp(centers[0] + 0.01)];
  }
  const result = [centers[0] - (centers[1] - centers[0]) / 2];
  for (let index = 0; index < centers.length - 1; index += 1) {
    result.push((centers[index] + centers[index + 1]) / 2);
  }
  result.push(
    centers[centers.length - 1] +
      (centers[centers.length - 1] - centers[centers.length - 2]) / 2
  );
  return result.map(clamp);
}

function engineExplanation(definition: P2006TAdditionalTableDefinition) {
  if (definition.id === "enroute-vy") {
    return "O motor usa esta página para validar a interpolação da velocidade Vy e do rate of climb em função do peso, pressure altitude e temperatura.";
  }
  if (definition.id === "enroute-vx") {
    return "O motor usa esta página para validar a interpolação da velocidade Vx e do rate of climb correspondente nas condições planeadas.";
  }
  if (definition.id === "oei-vyse") {
    return "O motor usa esta página para obter o ROC OEI a VySE e, a partir desse valor, apresentar o climb gradient e o service ceiling de 50 ft/min.";
  }
  return "O motor usa esta matriz de cruise para validar a combinação publicada de altitude, potência, velocidade e consumo aplicável ao planeamento.";
}

function GridAudit({ mapping }: { mapping: P2006TTableMapping }) {
  const x = boundaries(mapping.columnCenters);
  const y = boundaries(mapping.rowCenters);
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {mapping.rowCenters.flatMap((_, rowIndex) =>
        mapping.columnCenters.map((__, columnIndex) => (
          <rect
            key={`${rowIndex}-${columnIndex}`}
            x={x[columnIndex] * 1000}
            y={y[rowIndex] * 1000}
            width={(x[columnIndex + 1] - x[columnIndex]) * 1000}
            height={(y[rowIndex + 1] - y[rowIndex]) * 1000}
            fill={
              mapping.confirmed
                ? "rgba(5,150,105,0.055)"
                : "rgba(245,158,11,0.07)"
            }
            stroke={mapping.confirmed ? "rgb(5 150 105)" : "rgb(217 119 6)"}
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
        ))
      )}
    </svg>
  );
}

export function P2006TAdditionalTableAudit() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [tableIndex, setTableIndex] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const definition = P2006T_ADDITIONAL_TABLES[tableIndex];
  const source = definition.sourceByRegistration[registration];
  const mapping = useMemo(() => {
    const stored = readP2006TAdditionalTableMappings();
    return (
      stored[p2006TAdditionalTableKey(definition.id, registration)] ??
      initialP2006TAdditionalTableMapping(definition, registration)
    );
  }, [definition, registration, revision]);

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Additional tables audit
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-zinc-950">
            Vy, Vx, OEI e cruise
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Estas são as novas tabelas incluídas no mapper. O audit mostra a página
            AFM, a grelha efetivamente guardada e a explicação da utilização prevista
            no motor de performance.
          </p>
        </div>
        <label className="text-xs font-semibold text-zinc-600">
          Aeronave
          <select
            value={registration}
            onChange={(event) =>
              setRegistration(event.target.value as P2006TRegistration)
            }
            className="mt-1 block rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
          >
            {P2006T_REGISTRATIONS.map((candidate) => (
              <option key={candidate}>{candidate}</option>
            ))}
          </select>
        </label>
      </div>

      <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {P2006T_ADDITIONAL_TABLES.map((candidate, index) => {
          const selected = index === tableIndex;
          const stored = readP2006TAdditionalTableMappings()[
            p2006TAdditionalTableKey(candidate.id, registration)
          ];
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setTableIndex(index)}
              className={[
                "rounded-2xl border p-3 text-left",
                selected
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-sky-200 bg-white text-zinc-700",
              ].join(" ")}
            >
              <span className="block text-xs font-semibold">
                {candidate.shortTitle}
              </span>
              <span className="mt-1 block text-[10px] opacity-70">
                {stored?.confirmed ? "Concluído" : "Por confirmar"}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.45fr)_390px]">
        <div className="max-h-[82vh] overflow-auto rounded-3xl border border-zinc-200 bg-zinc-100 p-3">
          <div className="relative mx-auto bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source.image}
              alt={`${definition.title} ${registration}`}
              className="block h-auto w-full"
            />
            <GridAudit mapping={mapping} />
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Página auditada
            </p>
            <h3 className="mt-2 text-lg font-semibold text-zinc-950">
              {definition.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {source.sourceLabel} · {registration}
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-800">
              {mapping.columnCenters.length} colunas · {mapping.rowCenters.length}{" "}
              linhas · {mapping.confirmed ? "concluído" : "por confirmar"}
            </p>
          </section>

          <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
              Explicação prevista
            </p>
            <p className="mt-3 rounded-2xl border border-indigo-200 bg-white p-4 text-sm leading-6 text-zinc-800">
              {engineExplanation(definition)}
            </p>
            <p className="mt-3 text-xs leading-5 text-zinc-600">
              Este texto serve para validação da interface. O AFM e os procedimentos
              aprovados continuam a ser a referência operacional.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
