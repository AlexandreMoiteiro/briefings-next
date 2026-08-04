"use client";

import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type P2006TDraggableGrid = {
  columnCenters: number[];
  rowCenters: number[];
  confirmed: boolean;
};

type DragTarget =
  | { axis: "column"; index: number }
  | { axis: "row"; index: number }
  | null;

function clamp(value: number, minimum = 0.001, maximum = 0.999) {
  return Math.min(maximum, Math.max(minimum, value));
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
  return result.map((value) => clamp(value, 0, 1));
}

function moveCenter(values: number[], index: number, value: number) {
  const next = [...values];
  const minimum = index === 0 ? 0.001 : next[index - 1] + 0.0005;
  const maximum =
    index === next.length - 1 ? 0.999 : next[index + 1] - 0.0005;
  next[index] = clamp(value, minimum, maximum);
  return next;
}

function normalizedPointer(event: ReactPointerEvent<SVGSVGElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

export function P2006TDraggableGridOverlay({
  grid,
  onCommit,
  showCells = true,
}: {
  grid: P2006TDraggableGrid;
  onCommit: (grid: P2006TDraggableGrid) => void;
  showCells?: boolean;
}) {
  const [draft, setDraft] = useState(grid);
  const [drag, setDrag] = useState<DragTarget>(null);

  useEffect(() => {
    if (!drag) setDraft(grid);
  }, [drag, grid]);

  const xBounds = boundaries(draft.columnCenters);
  const yBounds = boundaries(draft.rowCenters);
  const stroke = draft.confirmed ? "rgb(5 150 105)" : "rgb(217 119 6)";
  const handleStroke = "rgb(2 132 199)";

  function begin(
    event: ReactPointerEvent<SVGLineElement>,
    target: Exclude<DragTarget, null>
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    setDrag(target);
  }

  function move(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    event.preventDefault();
    const point = normalizedPointer(event);
    setDraft((current) =>
      drag.axis === "column"
        ? {
            ...current,
            columnCenters: moveCenter(
              current.columnCenters,
              drag.index,
              point.x
            ),
          }
        : {
            ...current,
            rowCenters: moveCenter(current.rowCenters, drag.index, point.y),
          }
    );
  }

  function finish(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDrag(null);
    onCommit(draft);
  }

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="absolute inset-0 z-20 h-full w-full"
      style={{ touchAction: "none" }}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {showCells
        ? draft.rowCenters.flatMap((_, rowIndex) =>
            draft.columnCenters.map((__, columnIndex) => (
              <rect
                key={`cell-${rowIndex}-${columnIndex}`}
                x={xBounds[columnIndex] * 1000}
                y={yBounds[rowIndex] * 1000}
                width={(xBounds[columnIndex + 1] - xBounds[columnIndex]) * 1000}
                height={(yBounds[rowIndex + 1] - yBounds[rowIndex]) * 1000}
                fill={
                  draft.confirmed
                    ? "rgba(5,150,105,0.05)"
                    : "rgba(245,158,11,0.06)"
                }
                stroke={stroke}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))
          )
        : null}

      {draft.columnCenters.map((column, index) => (
        <g key={`column-${index}`}>
          <line
            x1={column * 1000}
            y1={yBounds[0] * 1000}
            x2={column * 1000}
            y2={yBounds[yBounds.length - 1] * 1000}
            stroke={handleStroke}
            strokeWidth={drag?.axis === "column" && drag.index === index ? 3 : 1.6}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <line
            x1={column * 1000}
            y1={yBounds[0] * 1000}
            x2={column * 1000}
            y2={yBounds[yBounds.length - 1] * 1000}
            stroke="transparent"
            strokeWidth="18"
            vectorEffect="non-scaling-stroke"
            className="cursor-ew-resize"
            onPointerDown={(event) =>
              begin(event, { axis: "column", index })
            }
          />
        </g>
      ))}

      {draft.rowCenters.map((row, index) => (
        <g key={`row-${index}`}>
          <line
            x1={xBounds[0] * 1000}
            y1={row * 1000}
            x2={xBounds[xBounds.length - 1] * 1000}
            y2={row * 1000}
            stroke={handleStroke}
            strokeWidth={drag?.axis === "row" && drag.index === index ? 3 : 1.2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <line
            x1={xBounds[0] * 1000}
            y1={row * 1000}
            x2={xBounds[xBounds.length - 1] * 1000}
            y2={row * 1000}
            stroke="transparent"
            strokeWidth="14"
            vectorEffect="non-scaling-stroke"
            className="cursor-ns-resize"
            onPointerDown={(event) => begin(event, { axis: "row", index })}
          />
        </g>
      ))}
    </svg>
  );
}
