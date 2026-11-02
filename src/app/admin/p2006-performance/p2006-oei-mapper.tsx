"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  DEFAULT_P2006T_OEI_GRID,
  P2006T_OEI_GRID_COLUMNS,
  P2006T_OEI_GRID_ROWS,
  P2006T_OEI_MAPPER_STORAGE_KEY,
  getP2006TOeiSourcePage,
  type P2006TOeiGridRect,
  type P2006TOeiMapperStore,
} from "@/lib/performance/p2006t-oei-table";

type Drag = {
  startX: number;
  startY: number;
  x: number;
  y: number;
} | null;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizedRect(drag: NonNullable<Drag>): P2006TOeiGridRect {
  const x = Math.min(drag.startX, drag.x);
  const y = Math.min(drag.startY, drag.y);
  return {
    x,
    y,
    width: Math.max(0.01, Math.abs(drag.x - drag.startX)),
    height: Math.max(0.01, Math.abs(drag.y - drag.startY)),
  };
}

function pointerPosition(event: PointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

function readStore(): P2006TOeiMapperStore {
  try {
    const raw = window.localStorage.getItem(P2006T_OEI_MAPPER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as P2006TOeiMapperStore) : {};
  } catch {
    return {};
  }
}

function GridOverlay({ rect }: { rect: P2006TOeiGridRect }) {
  return (
    <div
      className="pointer-events-none absolute border-2 border-emerald-600 bg-emerald-500/5"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
    >
      {Array.from({ length: P2006T_OEI_GRID_COLUMNS - 1 }, (_, index) => (
        <span
          key={`column-${index}`}
          className="absolute inset-y-0 border-l border-emerald-500/70"
          style={{ left: `${((index + 1) / P2006T_OEI_GRID_COLUMNS) * 100}%` }}
        />
      ))}
      {Array.from({ length: P2006T_OEI_GRID_ROWS - 1 }, (_, index) => (
        <span
          key={`row-${index}`}
          className="absolute inset-x-0 border-t border-emerald-500/55"
          style={{ top: `${((index + 1) / P2006T_OEI_GRID_ROWS) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function P2006TOeiMapper() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("D-GSEV");
  const [store, setStore] = useState<P2006TOeiMapperStore>({});
  const [draft, setDraft] = useState<P2006TOeiGridRect>(
    DEFAULT_P2006T_OEI_GRID
  );
  const [drag, setDrag] = useState<Drag>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const saved = readStore();
    setStore(saved);
    setDraft(saved[registration]?.rect ?? DEFAULT_P2006T_OEI_GRID);
  }, [registration]);

  const visibleRect = useMemo(
    () => (drag ? normalizedRect(drag) : draft),
    [draft, drag]
  );

  function save() {
    const next: P2006TOeiMapperStore = {
      ...store,
      [registration]: {
        rect: draft,
        savedAt: new Date().toISOString(),
      },
    };
    window.localStorage.setItem(
      P2006T_OEI_MAPPER_STORAGE_KEY,
      JSON.stringify(next)
    );
    setStore(next);
    setStatus(
      `${registration}: grelha 6×24 guardada e pronta para o PDF das tabelas.`
    );
  }

  function reset() {
    setDraft(DEFAULT_P2006T_OEI_GRID);
    setStatus("Reposicionada para a geometria inicial; confirme e guarde.");
  }

  function exportMapping() {
    const blob = new Blob([JSON.stringify(store, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "p2006t-oei-table-mapping.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            OEI VySE · mapper dedicado
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Mapear a tabela 6 × 24
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Arraste um retângulo sobre as seis colunas numéricas — VySE, −25,
            0, 25, 50 e ISA — e as 24 linhas dos três blocos de peso. A
            geometria guardada é usada para realçar no PDF as células do
            gradiente e do teto de serviço.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={registration}
            onChange={(event) =>
              setRegistration(event.target.value as P2006TRegistration)
            }
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
          >
            {P2006T_REGISTRATIONS.map((item) => (
              <option key={item} value={item}>
                {item} · AFM {getP2006TOeiSourcePage(item)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700"
          >
            Repor
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Guardar grelha
          </button>
          <button
            type="button"
            onClick={exportMapping}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700"
          >
            Exportar JSON
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-100 p-3">
        <div
          className="relative mx-auto min-w-[720px] max-w-[980px] touch-none select-none overflow-hidden bg-white shadow-sm"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = pointerPosition(event);
            setDrag({ startX: point.x, startY: point.y, ...point });
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            const point = pointerPosition(event);
            setDrag((current) => (current ? { ...current, ...point } : null));
          }}
          onPointerUp={(event) => {
            if (!drag) return;
            const point = pointerPosition(event);
            const completed = normalizedRect({ ...drag, ...point });
            setDraft(completed);
            setDrag(null);
            setStatus("Grelha alterada; guarde para a aplicar aos PDFs.");
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/p2006-oei-source?registration=${encodeURIComponent(
              registration
            )}`}
            alt={`Tabela OEI VySE ${registration}`}
            draggable={false}
            className="block h-auto w-full"
          />
          <GridOverlay rect={visibleRect} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-500">
        <span>
          Fonte: {registration} · AFM {getP2006TOeiSourcePage(registration)}
        </span>
        <span>Colunas: 6</span>
        <span>Linhas: 24</span>
        <span>
          Estado: {store[registration] ? "guardado" : "geometria inicial"}
        </span>
      </div>
      {status ? <p className="mt-3 text-sm text-zinc-700">{status}</p> : null}
    </section>
  );
}
