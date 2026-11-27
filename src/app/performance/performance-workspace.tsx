"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type PerformanceMode = "P2006T" | "P2008" | "PA28" | "C152";
type SectionKind =
  | "weather"
  | "loading"
  | "reference"
  | "fuel"
  | "aerodrome"
  | "pdf";

const SECTION_TITLES: Partial<Record<SectionKind, string>> = {
  weather: "Weather",
  loading: "Aircraft & loading",
  fuel: "Fuel planning",
  aerodrome: "Aerodrome performance",
  pdf: "PDF downloads",
};

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function classifySection(value: string): SectionKind | null {
  const text = normalize(value).replace(/^\d+\.\s*/, "");

  if (text === "weather" || text.includes("aerodromes & weather")) {
    return "weather";
  }
  if (
    text.includes("aircraft & loading") ||
    text.includes("aircraft and loading") ||
    text === "mass & balance"
  ) {
    return "loading";
  }
  if (text.includes("m&b + performance")) return "reference";
  if (text.includes("fuel planning")) return "fuel";
  if (text.includes("aerodrome performance")) return "aerodrome";
  if (
    text.includes("pdf contents") ||
    text.includes("pdf downloads") ||
    text.includes("performance pdf") ||
    text === "export pdf"
  ) {
    return "pdf";
  }

  return null;
}

function decoratePerformance(root: HTMLElement) {
  const recognized: HTMLElement[] = [];

  Array.from(root.querySelectorAll("section")).forEach((section) => {
    if (!(section instanceof HTMLElement)) return;

    const heading = Array.from(section.querySelectorAll("h1, h2")).find((item) =>
      classifySection(item.textContent ?? "")
    ) as HTMLElement | undefined;
    if (!heading) return;

    const kind = classifySection(heading.textContent ?? "");
    if (!kind) return;

    section.dataset.performanceSection = kind;
    recognized.push(section);

    const title = SECTION_TITLES[kind];
    if (title) {
      heading.dataset.performanceTitle = title;
      heading.setAttribute("aria-label", title);
    }
  });

  const counts = new Map<HTMLElement, number>();
  recognized.forEach((section) => {
    const parent = section.parentElement;
    if (!parent) return;
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  });

  counts.forEach((count, parent) => {
    if (count >= 3) parent.dataset.performanceSectionContainer = "true";
  });

  return recognized.length >= 4;
}

export function PerformanceWorkspace({
  mode,
  children,
}: {
  mode: PerformanceMode;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<SectionKind[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let attempt = 0;

    const apply = () => {
      if (cancelled) return;
      const root = rootRef.current;
      const ready = root ? decoratePerformance(root) : false;
      if (root) {
        const kinds = (["weather","loading","reference","fuel","aerodrome","pdf"] as const).filter(kind => root.querySelector(`[data-performance-section="${kind}"]`));
        setAvailable(previous => previous.join(",") === kinds.join(",") ? previous : kinds);
      }

      attempt += 1;
      if (attempt < 14 && (attempt < 8 || !ready)) {
        timer = window.setTimeout(apply, 120);
      }
    };

    apply();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [mode]);

  return (
    <div className="space-y-4">
      {available.length > 0 ? <nav aria-label="Performance sections" className="sticky top-0 z-20 flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-white p-2 lg:top-[64px]">
        {available.map(kind => <button key={kind} type="button" onClick={() => {
          const targets = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(`[data-performance-section="${kind}"]`) ?? []);
          const section = targets.find(element => element.getClientRects().length > 0 && !targets.some(other => other !== element && element.contains(other))) ?? targets.find(element => element.getClientRects().length > 0);
          if (section) { section.style.scrollMarginTop = "140px"; section.scrollIntoView({block:"start",behavior:"auto"}); }
        }} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-sky-50 hover:text-sky-900">{SECTION_TITLES[kind] ?? "Aircraft reference"}</button>)}
      </nav> : null}
      <div ref={rootRef} className="performance-workspace" data-performance-mode={mode}>
        {children}
      </div>
    </div>
  );
}
