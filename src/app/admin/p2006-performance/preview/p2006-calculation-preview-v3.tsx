"use client";

import { useEffect, useRef } from "react";
import { P2006TCalculationPreview as BaseCalculationPreview } from "./p2006-calculation-preview";

function fieldInput(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find(
    (candidate) => candidate.textContent?.includes(labelText)
  );
  return label?.querySelector<HTMLInputElement>("input") ?? null;
}

function fieldSelect(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find(
    (candidate) => candidate.textContent?.includes(labelText)
  );
  return label?.querySelector<HTMLSelectElement>("select") ?? null;
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
  if (!card) return;

  const body = card.querySelector<HTMLDivElement>(":scope > div");
  if (!body) return;
  if (body.querySelector("[data-p2006-compact-calculation='true']")) return;

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

  card.dataset.p2006FinalDistance = String(finalDistance);
  card.dataset.p2006TableDistance = String(interpolatedDistance);

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

function joinCorrections(parts: string[]) {
  if (!parts.length) return "no additional";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function addEngineWording(root: HTMLElement) {
  const section = performanceSection(root);
  const aside = section?.querySelector<HTMLElement>("aside");
  const calculation = calculationCard(root);
  if (!aside || !calculation) return;

  const finalDistance = Number(calculation.dataset.p2006FinalDistance);
  const tableDistance = Number(calculation.dataset.p2006TableDistance);
  if (!Number.isFinite(finalDistance) || !Number.isFinite(tableDistance)) return;

  const sourceSelect = fieldSelect(root, "Source page");
  const resultSelect = fieldSelect(root, "Result");
  const sourceText = sourceSelect?.selectedOptions[0]?.textContent?.trim() ?? "";
  const resultText = resultSelect?.selectedOptions[0]?.textContent?.trim() ?? "";
  const weight = Number(sourceText.match(/(\d+)\s*kg/i)?.[1] ?? 0);
  const isTakeoff = /^T\/O/i.test(sourceText);
  const isFiftyFeet = /50\s*ft/i.test(resultText);
  const altitude = Number(fieldInput(root, "Pressure altitude ft")?.value ?? 0);
  const temperature = Number(fieldInput(root, "OAT °C")?.value ?? 0);
  const wind = Number(fieldInput(root, "Wind kt")?.value ?? 0);
  const slope = Number(fieldInput(root, "Runway slope %")?.value ?? 0);
  const paved = Boolean(fieldInput(root, "Paved runway")?.checked);
  const corrections: string[] = [];

  if (paved) corrections.push("paved-runway");
  if (wind > 0) corrections.push(`${formatNumber(wind)} kt headwind`);
  if (wind < 0) corrections.push(`${formatNumber(Math.abs(wind))} kt tailwind`);
  if (slope > 0) corrections.push(`about ${formatNumber(slope, 1)}% upslope`);
  if (slope < 0) corrections.push(`about ${formatNumber(Math.abs(slope), 1)}% downslope`);

  const operation = isTakeoff ? "Take-off" : "Landing";
  const condition = isFiftyFeet
    ? isTakeoff
      ? "to 50 ft"
      : "from 50 ft"
    : "ground roll";
  const marginDistance = Math.round(finalDistance * 1.25);
  const paragraphs = [
    `Let's consider about ${formatNumber(weight)} kg, ${formatNumber(
      altitude,
      0
    )} ft pressure altitude and ${formatNumber(temperature, 1)} C.`,
    `The surrounding AFM cells are interpolated to ${formatNumber(
      tableDistance,
      1
    )} m and the ${joinCorrections(corrections)} corrections are applied.`,
    isFiftyFeet
      ? `${operation} ${condition} is about ${formatNumber(
          finalDistance
        )} m; with the OM buffer (x1.25), use ${formatNumber(
          marginDistance
        )} m.`
      : `${operation} ${condition} is about ${formatNumber(
          finalDistance
        )} m before the operator margin.`,
  ];
  const signature = paragraphs.join("\n");
  const existing = aside.querySelector<HTMLElement>(
    "[data-p2006-engine-wording='true']"
  );
  if (existing?.dataset.signature === signature) return;

  const card = document.createElement("section");
  card.dataset.p2006EngineWording = "true";
  card.dataset.signature = signature;
  card.className =
    "rounded-3xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm";

  const eyebrow = document.createElement("p");
  eyebrow.className =
    "text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700";
  eyebrow.textContent = "Performance engine wording";
  card.appendChild(eyebrow);

  const title = document.createElement("h3");
  title.className = "mt-1 text-lg font-semibold text-zinc-950";
  title.textContent = "Texto que aparecerá no motor de performance";
  card.appendChild(title);

  const note = document.createElement("p");
  note.className = "mt-2 text-xs leading-5 text-zinc-600";
  note.textContent =
    "Atualiza com os valores do preview para poderes validar a redação antes de a usar no PDF e no cálculo operacional.";
  card.appendChild(note);

  const textBox = document.createElement("div");
  textBox.className =
    "mt-3 space-y-2 rounded-2xl border border-indigo-200 bg-white p-4 text-sm leading-6 text-zinc-800";
  paragraphs.forEach((paragraph) => {
    const line = document.createElement("p");
    line.textContent = paragraph;
    textBox.appendChild(line);
  });
  card.appendChild(textBox);

  existing?.replaceWith(card);
  if (!existing) aside.appendChild(card);
}

function polishPreview(root: HTMLElement) {
  root
    .querySelectorAll<HTMLDivElement>(
      "div.pointer-events-none.absolute.bottom-3.left-3"
    )
    .forEach((summary) => {
      summary.style.display = "none";
    });

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
    group.querySelector<SVGCircleElement>(":scope > circle")?.style.setProperty(
      "display",
      "none"
    );
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

  compactCalculation(root);
  addEngineWording(root);
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
