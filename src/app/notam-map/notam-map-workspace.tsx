"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { parseCoordinateAreaInput } from "@/lib/coordinate-area-parser";
import type { NotamApiResponse, PlotNotam } from "@/lib/notams";

const CoordinateLeafletMap = dynamic(
  () =>
    import("../area-map/coordinate-leaflet-map").then(
      (module) => module.CoordinateLeafletMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[680px] items-center justify-center rounded-3xl border border-zinc-200 bg-zinc-100 text-sm text-zinc-500">
        Loading map…
      </div>
    ),
  }
);

type ParsedCoordinatePoint = {
  label: string;
  raw: string;
  lat: number;
  lon: number;
};

type CoordinateMapArea = {
  id: string;
  name: string;
  points: ParsedCoordinatePoint[];
  isDraft?: boolean;
  isSelected?: boolean;
};

type DayOption = {
  key: string;
  label: string;
  dateLabel: string;
  start: Date;
  end: Date;
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDayOptions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index): DayOption => {
    const start = new Date(today);
    start.setDate(start.getDate() + index);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const label =
      index === 0
        ? "Today"
        : index === 1
          ? "Tomorrow"
          : start.toLocaleDateString(undefined, { weekday: "short" });

    return {
      key: dateKey(start),
      label,
      dateLabel: start.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
      }),
      start,
      end,
    };
  });
}

function appliesOnDay(notam: PlotNotam, day: DayOption) {
  const startsAt = notam.effectiveStart
    ? new Date(notam.effectiveStart).getTime()
    : Number.NEGATIVE_INFINITY;
  const endsAt = notam.effectiveEnd
    ? new Date(notam.effectiveEnd).getTime()
    : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(startsAt) && startsAt !== Number.NEGATIVE_INFINITY) {
    return false;
  }
  if (!Number.isFinite(endsAt) && endsAt !== Number.POSITIVE_INFINITY) {
    return false;
  }

  return startsAt < day.end.getTime() && endsAt >= day.start.getTime();
}

export function NotamMapWorkspace() {
  const [notams, setNotams] = useState<PlotNotam[]>([]);
  const [showNotams, setShowNotams] = useState(true);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const dayOptions = useMemo(() => buildDayOptions(), []);
  const [selectedDayKey, setSelectedDayKey] = useState(
    () => buildDayOptions()[0]?.key ?? ""
  );

  const selectedDay =
    dayOptions.find((day) => day.key === selectedDayKey) ?? dayOptions[0];

  const visibleNotams = useMemo(
    () =>
      selectedDay
        ? notams.filter((notam) => appliesOnDay(notam, selectedDay))
        : notams,
    [notams, selectedDay]
  );

  const parsed = useMemo(() => parseCoordinateAreaInput(input), [input]);

  const customAreas = useMemo<CoordinateMapArea[]>(() => {
    if (parsed.errors.length || !parsed.points.length) return [];
    return [
      {
        id: "custom-area",
        name: "Custom area",
        points: parsed.points,
        isDraft: true,
        isSelected: true,
      },
    ];
  }, [parsed.errors.length, parsed.points]);

  useEffect(() => {
    const controller = new AbortController();
    void loadNotams(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadNotams(signal?: AbortSignal) {
    setLoading(true);
    setStatus("");

    try {
      const response = await fetch("/api/notams", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });

      const data = (await response.json().catch(() => ({}))) as
        | NotamApiResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Could not load NOTAMs."
        );
      }

      const result = data as NotamApiResponse;
      setConfigured(result.configured);

      if (!result.configured) {
        setNotams([]);
        setStatus(result.message || "NOTAM source is not configured.");
        return;
      }

      setNotams(result.notices);
      setStatus(result.truncated ? "Some NOTAMs could not be loaded." : "");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      setStatus(
        error instanceof Error ? error.message : "Could not load NOTAMs."
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Utility · Portugal
        </p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              NOTAM Map
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 sm:text-base">
              Portuguese and Portuguese-FIR NOTAMs plotted by day, with areas and categories shown visually.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-zinc-950 px-3 py-1.5 font-semibold text-white">
              {loading
                ? "Loading…"
                : `${visibleNotams.length} NOTAM${visibleNotams.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      </header>

      <section
        aria-label="NOTAM day"
        className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm"
      >
        <div className="grid min-w-[700px] grid-cols-7 gap-1">
          {dayOptions.map((day) => {
            const active = day.key === selectedDayKey;

            return (
              <button
                key={day.key}
                type="button"
                onClick={() => setSelectedDayKey(day.key)}
                className={[
                  "rounded-xl px-3 py-2.5 text-center transition",
                  active
                    ? "bg-zinc-950 text-white shadow-sm"
                    : "text-zinc-700 hover:bg-zinc-100",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{day.label}</span>
                <span
                  className={
                    active
                      ? "mt-0.5 block text-[11px] text-amber-300"
                      : "mt-0.5 block text-[11px] text-zinc-500"
                  }
                >
                  {day.dateLabel}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-zinc-500">
            {configured === false ? (
              <span>{status}</span>
            ) : status ? (
              <span>{status}</span>
            ) : (
              <span>
                Showing NOTAMs whose validity overlaps the selected day. Check any published schedule in the NOTAM details.
              </span>
            )}
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700">
            <input
              type="checkbox"
              checked={showNotams}
              onChange={(event) => setShowNotams(event.target.checked)}
            />
            Show NOTAMs
          </label>
        </div>

        <CoordinateLeafletMap
          areas={customAreas}
          selectedAreaId="custom-area"
          notams={visibleNotams}
          showNotams={showNotams}
        />

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Map overlay for situational awareness. Confirm applicability, validity, schedule and operational details in the official briefing before flight.
        </p>
      </section>

      <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-zinc-950">
                Plot a custom area
              </p>
              <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                Optional · paste NOTAM/GAMET wording or a coordinate sequence to draw it over the map.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">
              {parsed.errors.length
                ? `${parsed.errors.length} issue${parsed.errors.length === 1 ? "" : "s"}`
                : `${parsed.points.length} point${parsed.points.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </summary>

        <div className="border-t border-zinc-100 px-4 py-4 sm:px-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Coordinates / area description
            </span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={7}
              className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 font-mono text-sm leading-6 outline-none transition focus:border-zinc-500"
              placeholder={'S OF N3845 AND W OF W00815\nN3842 W00900 - N3900 W00830\n384221N 0090058W - 384226N 0090052W'}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer font-semibold text-zinc-700">
                Accepted formats
              </summary>
              <p className="mt-2 max-w-2xl rounded-xl bg-zinc-50 p-3 leading-5">
                DMS, ICAO degrees/minutes, decimal coordinates and GAMET directional sectors such as S OF N3845 AND W OF W00815.
              </p>
            </details>

            {input ? (
              <button
                type="button"
                onClick={() => setInput("")}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                Clear custom area
              </button>
            ) : null}
          </div>

          {parsed.errors.length ? (
            <div className="mt-3 space-y-2">
              {parsed.errors.map((error) => (
                <p
                  key={error}
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {error}
                </p>
              ))}
            </div>
          ) : null}

          {parsed.warnings.length ? (
            <div className="mt-3 space-y-2">
              {parsed.warnings.map((warning) => (
                <p
                  key={warning}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                >
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
