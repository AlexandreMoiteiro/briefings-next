"use client";

import { useEffect, useRef } from "react";
import { P2006TCalculationPreview as BaseCalculationPreview } from "./p2006-calculation-preview";

function fieldInput(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find(
    (candidate) => candidate.textContent?.includes(labelText)
  );
  return label?.querySelector<HTMLInputElement>("input") ?? null;
}

function numberFromText(text: string, expressions: RegExp[]) {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match) return Number(match[1]);
  }
  return null;
}

function formatNumber(value: number, digits = 0) {
  return value.toFixed(digits).replace(/\.0$/, "");
}

function calculationCard(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLDivElement>("div")).find((candidate) => {
    const title = candidate.querySelector<HTMLElement>(":scope > p");
    return title?.textContent?.trim() === "Calculation";
  });
}

function compactCalculation(root: HTMLElement) {
  const card = calculationCard(root);
  if (!card || card.querySelector("[data-p2006-compact-calculation='true']")) {
    return;
  }

  const body = card.querySelector<HTMLDivElement>(":scope > div");
  if (!body) return;

  const originalText = body.textContent ?? "";
  const finalDistance = numberFromText(originalText, [
    /Final result:\s*([\d.]+)\s*m/i,
    /Final distance:\s*([\d.]+)\s*m/i,
  ]);
  const tableDistance = numberFromText(originalText, [
    /Interpolate between both altitude results:\s*([\d.]+)\s*m/i,
    /to obtain\s*([\d.]+)\s*m/i,
    /table gives\s*([\d.]+)\s*m/i,
  ]);

  if (finalDistance === null) return;

  const altitude = Number(fieldInput(root, "Pressure altitude ft")?.value ?? 0);
  const temperature = Number(fieldInput(root, "OAT °C")?.value ?? 0);
  const wind = Number(fieldInput(root, "Wind kt")?.value ?? 0);
  const slope = Number(fieldInput(root, "Runway slope %")?.value ?? 0);
  const paved = Boolean(fieldInput(root, "Paved runway")?.checked);
  const interpolatedDistance = tableDistance ?? finalDistance;

  const corrections: string[] = [];
  if (wind > 0) {
    corrections.push(`${formatNumber(wind)} kt headwind`);
  } else if (wind < 0) {
    corrections.push(`${formatNumber(Math.abs(wind))} kt tailwind`);
  }
  if (paved) corrections.push("paved-runway");
  if (slope !== 0) {
    corrections.push(
      `${slope > 0 ? "+" : ""}${formatNumber(slope, 1)}% runway-slope`
    );
  }

  const summary = document.createElement("div");
  summary.dataset.p2006CompactCalculation = "true";
  summary.className = "mt-1 space-y-1 leading-snug text-zinc-900";

  const interpolation = document.createElement("p");
  interpolation.textContent = `For a pressure altitude of ${formatNumber(
    altitude
  )} ft and a temperature of ${formatNumber(
    temperature,
    1
  )} °C, interpolation gives ${formatNumber(interpolatedDistance, 1)} m.`;
  summary.appendChild(interpolation);

  const result = document.createElement("p");
  result.className = "font-semibold text-zinc-950";
  if (corrections.length) {
    const correctionText =
      corrections.length === 1
        ? corrections[0]
        : `${corrections.slice(0, -1).join(", ")} and ${corrections.at(-1)}`;
    result.textContent = `After applying the ${correctionText} correction${
      corrections.length > 1 ? "s" : ""
    }, the final distance is ${formatNumber(finalDistance)} m.`;
  } else {
    result.textContent = `The resulting distance is ${formatNumber(
      finalDistance
    )} m.`;
  }
  summary.appendChild(result);

  body.replaceChildren(summary);
  card.style.padding = "8px 10px";
  card.style.fontSize = "clamp(8px, 0.68vw, 11px)";
}

function performanceSection(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll<HTMLHeadingElement>("h3")).find(
    (candidate) => candidate.textContent?.trim() === "Performance calculation"
  );
  return heading?.closest<HTMLElement>("section") ?? null;
}

function polishPreview(root: HTMLElement) {
  // The form image already explains the geometry; keep only the plotted path.
  root
    .querySelectorAll<HTMLDivElement>(
      "div.pointer-events-none.absolute.bottom-3.left-3"
    )
    .forEach((summary) => {
      summary.style.display = "none";
    });

  // Keep the applicable maximum-mass line, but remove its redundant label.
  root.querySelectorAll<SVGTextElement>("svg text").forEach((label) => {
    if (!/^Max\s+\d+\s+kg$/i.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    const preceding = label.previousElementSibling;
    if (preceding?.tagName.toLowerCase() === "rect") {
      (preceding as SVGRectElement).style.display = "none";
    }
  });

  // The coloured cells alone are enough: remove numbered badges and arrows.
  root.querySelectorAll<SVGGElement>("svg g").forEach((group) => {
    const label = group.querySelector<SVGTextElement>(":scope > text");
    if (!label || !/^[1-4]$/.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    group.querySelector<SVGCircleElement>(":scope > circle")?.style.setProperty(
      "display",
      "none"
    );
  });
  root
    .querySelectorAll<SVGLineElement>("svg line[marker-end]")
    .forEach((line) => line.style.setProperty("display", "none"));

  // Remove only the green interpolation point from the performance table.
  performanceSection(root)
    ?.querySelectorAll<SVGCircleElement>("svg circle")
    .forEach((circle) => {
      const fill = circle.getAttribute("fill") ?? "";
      if (/rgb\(22\s+163\s+74\)|#16a34a/i.test(fill)) {
        circle.style.setProperty("display", "none");
      }
    });

  compactCalculation(root);
}

export function P2006TCalculationPreview() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const apply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
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
  }, []);

  return (
    <div ref={rootRef}>
      <BaseCalculationPreview />
    </div>
  );
}
