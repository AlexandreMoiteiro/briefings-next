"use client";

import { useEffect, useMemo, useState } from "react";

export type P2006TAdjustableGrid = {
  columnCenters: number[];
  rowCenters: number[];
  confirmed: boolean;
};

const DEFAULT_STEP = 0.0005;

function clamp(value: number) {
  return Math.min(0.999, Math.max(0.001, value));
}

function ordered(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

function moveSingle(values: number[], index: number, delta: number) {
  const next = [...values];
  const minimum = index === 0 ? 0.001 : next[index - 1] + 0.0005;
  const maximum =
    index === next.length - 1 ? 0.999 : next[index + 1] - 0.0005;
  next[index] = Math.min(maximum, Math.max(minimum, next[index] + delta));
  return next;
}

function shiftAll(values: number[], delta: number) {
  if (!values.length) return values;
  const limited = Math.max(
    -values[0] + 0.001,
    Math.min(delta, 0.999 - values[values.length - 1])
  );
  return values.map((value) => value + limited);
}

function changeSpacing(values: number[], delta: number) {
  if (values.length < 2) return values;
  const center = (values[0] + values[values.length - 1]) / 2;
  const span = values[values.length - 1] - values[0];
  const nextSpan = Math.max(0.002 * (values.length - 1), span + delta);
  const factor = span <= 0 ? 1 : nextSpan / span;
  const next = values.map((value) => clamp(center + (value - center) * factor));
  return ordered(next) ? next : values;
}

function percent(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

export function P2006TGridFineAdjustment({
  grid,
  onChange,
  columnLabels,
  title = "Ajuste manual fino",
}: {
  grid: P2006TAdjustableGrid;
  onChange: (grid: P2006TAdjustableGrid) => void;
  columnLabels?: string[];
  title?: string;
}) {
  const [columnIndex, setColumnIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [step, setStep] = useState(DEFAULT_STEP);

  useEffect(() => {
    setColumnIndex((value) => Math.min(value, Math.max(0, grid.columnCenters.length - 1)));
    setRowIndex((value) => Math.min(value, Math.max(0, grid.rowCenters.length - 1)));
  }, [grid.columnCenters.length, grid.rowCenters.length]);

  const selectedColumn = grid.columnCenters[columnIndex] ?? 0;
  const selectedRow = grid.rowCenters[rowIndex] ?? 0;
  const stepLabel = useMemo(() => `${(step * 100).toFixed(2)}% da página`, [step]);

  function update(
    columnCenters: number[],
    rowCenters: number[] = grid.rowCenters
  ) {
    onChange({
      columnCenters,
      rowCenters,
      confirmed: false,
    });
  }

  function updateRows(rowCenters: number[]) {
    onChange({
      columnCenters: grid.columnCenters,
      rowCenters,
      confirmed: false,
    });
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            {title}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-700">
            Ajuste uma coluna ou linha individual, desloque a grelha completa ou
            corrija o espaçamento. Qualquer alteração retira a confirmação até a
            grelha ser novamente validada.
          </p>
        </div>
        <label className="text-xs font-semibold text-zinc-600">
          Passo
          <select
            value={step}
            onChange={(event) => setStep(Number(event.target.value))}
            className="mt-1 block rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
          >
            <option value={0.00025}>0,025%</option>
            <option value={0.0005}>0,05%</option>
            <option value={0.001}>0,10%</option>
            <option value={0.002}>0,20%</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[180px] flex-1 text-xs font-semibold text-zinc-600">
              Coluna
              <select
                value={columnIndex}
                onChange={(event) => setColumnIndex(Number(event.target.value))}
                className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                {grid.columnCenters.map((value, index) => (
                  <option key={`column-${index}`} value={index}>
                    {columnLabels?.[index] ?? `Coluna ${index + 1}`} · {percent(value)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => update(moveSingle(grid.columnCenters, columnIndex, -step))}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            >
              ← Esquerda
            </button>
            <button
              type="button"
              onClick={() => update(moveSingle(grid.columnCenters, columnIndex, step))}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            >
              Direita →
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Centro atual: {percent(selectedColumn)} · passo {stepLabel}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => update(shiftAll(grid.columnCenters, -step))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Todas ←
            </button>
            <button
              type="button"
              onClick={() => update(shiftAll(grid.columnCenters, step))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Todas →
            </button>
            <button
              type="button"
              onClick={() => update(changeSpacing(grid.columnCenters, -step * 2))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Aproximar
            </button>
            <button
              type="button"
              onClick={() => update(changeSpacing(grid.columnCenters, step * 2))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Afastar
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[180px] flex-1 text-xs font-semibold text-zinc-600">
              Linha
              <select
                value={rowIndex}
                onChange={(event) => setRowIndex(Number(event.target.value))}
                className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                {grid.rowCenters.map((value, index) => (
                  <option key={`row-${index}`} value={index}>
                    Linha {index + 1} · {percent(value)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => updateRows(moveSingle(grid.rowCenters, rowIndex, -step))}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            >
              ↑ Subir
            </button>
            <button
              type="button"
              onClick={() => updateRows(moveSingle(grid.rowCenters, rowIndex, step))}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            >
              Descer ↓
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Centro atual: {percent(selectedRow)} · passo {stepLabel}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => updateRows(shiftAll(grid.rowCenters, -step))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Todas ↑
            </button>
            <button
              type="button"
              onClick={() => updateRows(shiftAll(grid.rowCenters, step))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Todas ↓
            </button>
            <button
              type="button"
              onClick={() => updateRows(changeSpacing(grid.rowCenters, -step * 2))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Aproximar
            </button>
            <button
              type="button"
              onClick={() => updateRows(changeSpacing(grid.rowCenters, step * 2))}
              className="rounded-xl border border-zinc-200 px-2 py-2 text-xs font-semibold"
            >
              Afastar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
