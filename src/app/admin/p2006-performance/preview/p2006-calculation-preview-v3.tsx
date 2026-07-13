"use client";

import { useEffect, useRef, useState } from "react";
import { ensureBundledP2006Form } from "../p2006-form-storage";
import { P2006TCalculationPreview as BaseCalculationPreview } from "./p2006-calculation-preview";

type NaturalSummary = {
  title: string;
  tableSentence: string;
  resultSentence: string;
};

function performanceSection(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll<HTMLHeadingElement>("h3")).find(
    (candidate) => candidate.textContent?.trim() === "Performance calculation"
  );
  return heading?.closest<HTMLElement>("section") ?? null;
}

function labelledControl(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find(
    (candidate) => candidate.textContent?.includes(labelText)
  );
  return label?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select") ?? null;
}

function numericValue(root: HTMLElement, labelText: string) {
  const value = labelledControl(root, labelText)?.value;
  if (value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function selectedText(root: HTMLElement, labelText: string) {
  const select = labelledControl(root, labelText);
  if (!(select instanceof HTMLSelectElement)) return "";
  return select.selectedOptions[0]?.textContent?.trim() ?? "";
}

function numberFromText(text: string, expressions: RegExp[]) {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match) return Number(match[1]);
  }
  return null;
}

function format(value: number, digits = 0) {
  return value.toFixed(digits).replace(/\.0$/, "");
}

function calculationCard(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLDivElement>("div")).find((candidate) => {
    const title = candidate.querySelector<HTMLElement>(":scope > p");
    return title?.textContent?.trim() === "Calculation";
  });
}

function buildSummary(root: HTMLElement): NaturalSummary | null {
  const section = performanceSection(root);
  if (!section) return null;
  const card = calculationCard(section);
  const calculationText = card?.textContent ?? section.textContent ?? "";
  const finalDistance = numberFromText(calculationText, [
    /Final result:\s*([\d.]+)\s*m/i,
    /Final distance:\s*([\d.]+)\s*m/i,
  ]);
  if (finalDistance === null) return null;

  const tableDistance =
    numberFromText(calculationText, [
      /Interpolate between both altitude results:\s*([\d.]+)\s*m/i,
      /to obtain\s*([\d.]+)\s*m/i,
    ]) ?? finalDistance;
  const altitude = numericValue(root, "Pressure altitude ft");
  const temperature = numericValue(root, "OAT °C");
  const wind = numericValue(root, "Wind kt") ?? 0;
  const slope = numericValue(root, "Runway slope %") ?? 0;
  const paved = Boolean(
    (labelledControl(root, "Paved runway") as HTMLInputElement | null)?.checked
  );
  const source = selectedText(root, "Source page");
  const resultType = selectedText(root, "Result");
  if (altitude === null || temperature === null) return null;

  const tableSentence = `At ${format(altitude)} ft and ${format(
    temperature,
    1
  )} °C, the ${source || "selected table"} gives approximately ${format(
    tableDistance,
    1
  )} m after interpolation.`;

  const adjustments: string[] = [];
  if (wind > 0) adjustments.push(`${format(wind)} kt of headwind`);
  if (wind < 0) adjustments.push(`${format(Math.abs(wind))} kt of tailwind`);
  if (paved) adjustments.push("the paved-runway correction");
  if (slope !== 0) {
    adjustments.push(`${slope > 0 ? "+" : ""}${format(slope, 1)}% runway slope`);
  }

  const resultSentence = adjustments.length
    ? `Allowing for ${adjustments.join(", ")}, use ${format(
        finalDistance
      )} m as the ${resultType || "final distance"}.`
    : `No further adjustment changes the result, so use ${format(
        finalDistance
      )} m as the ${resultType || "final distance"}.`;

  return {
    title: `${source || "Performance table"} · ${resultType || "calculation"}`,
    tableSentence,
    resultSentence,
  };
}

/**
 * Applies visual-only refinements. It never removes, replaces or reorders
 * React-owned nodes, so changing table remains safe for React reconciliation.
 */
function polishPreview(root: HTMLElement) {
  root
    .querySelectorAll<HTMLDivElement>(
      "div.pointer-events-none.absolute.bottom-3.left-3"
    )
    .forEach((summary) => {
      summary.style.display = "none";
    });

  const card = calculationCard(root);
  if (card) card.style.display = "none";

  root.querySelectorAll<SVGTextElement>("svg text").forEach((label) => {
    if (!/^Max\s+\d+\s+kg$/i.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    const preceding = label.previousElementSibling;
    if (preceding?.tagName.toLowerCase() === "rect") {
      (preceding as SVGRectElement).style.display = "none";
    }
  });

  root.querySelectorAll<SVGGElement>("svg g").forEach((group) => {
    const label = group.querySelector<SVGTextElement>(":scope > text");
    if (!label || !/^[1-4]$/.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    group
      .querySelector<SVGCircleElement>(":scope > circle")
      ?.style.setProperty("display", "none");
  });

  root
    .querySelectorAll<SVGLineElement>("svg line[marker-end]")
    .forEach((line) => line.style.setProperty("display", "none"));

  performanceSection(root)
    ?.querySelectorAll<SVGCircleElement>("svg circle")
    .forEach((circle) => {
      const fill = circle.getAttribute("fill") ?? "";
      if (/rgb\(22\s+163\s+74\)|#16a34a/i.test(fill)) {
        circle.style.setProperty("display", "none");
      }
    });
}

export function P2006TCalculationPreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [formWarning, setFormWarning] = useState("");
  const [summary, setSummary] = useState<NaturalSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureBundledP2006Form()
      .catch((error) => {
        console.warn("Unable to prepare bundled P2006T form pages", error);
        if (!cancelled) {
          setFormWarning(
            "The bundled form background could not be cached. The calculation preview remains available."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const apply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const nextSummary = buildSummary(root);
        setSummary((current) =>
          JSON.stringify(current) === JSON.stringify(nextSummary) ? current : nextSummary
        );
        polishPreview(root);
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("input", apply);
    root.addEventListener("change", apply);
    root.addEventListener("click", apply);

    return () => {
      observer.disconnect();
      root.removeEventListener("input", apply);
      root.removeEventListener("change", apply);
      root.removeEventListener("click", apply);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ready]);

  return (
    <div ref={rootRef}>
      {!ready ? (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5 text-sm font-semibold text-sky-900">
          Preparing the official P2006T form background…
        </div>
      ) : (
        <>
          {formWarning ? (
            <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              {formWarning}
            </p>
          ) : null}
          {summary ? (
            <section className="mb-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Calculation summary
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950">{summary.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-700">{summary.tableSentence}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-emerald-900">
                {summary.resultSentence}
              </p>
            </section>
          ) : null}
          <BaseCalculationPreview />
        </>
      )}
    </div>
  );
}
