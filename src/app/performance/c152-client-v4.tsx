"use client";

import { useEffect, useRef } from "react";
import { C152ClientV3 } from "./c152-client-v3";

const LITERS_PER_US_GALLON = 3.785411784;
const KG_TO_LB = 2.2046226218;
const FT_PER_M = 3.280839895;

function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

function textNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

function operationalFuelText(liters: number) {
  const roundedLiters = Math.max(0, Math.round(liters));
  const roundedGallons = Math.max(
    0,
    Math.round(roundedLiters / LITERS_PER_US_GALLON)
  );
  return `${roundedLiters} L (${roundedGallons} US gal)`;
}

function exactFuelText(liters: number) {
  return `${liters.toFixed(1)} L (${(liters / LITERS_PER_US_GALLON).toFixed(1)} US gal)`;
}

function enhanceFuelText(root: HTMLElement) {
  for (const node of textNodes(root)) {
    const value = node.nodeValue ?? "";
    if (!value.trim()) continue;

    let next = value.replace(
      /(\d+(?:\.\d+)?)\s*US gal\s*·\s*(\d+(?:\.\d+)?)\s*L/g,
      (_match, gallons: string, liters: string) =>
        `${Number(liters).toFixed(1)} L (${Number(gallons).toFixed(1)} US gal)`
    );

    next = next.replace(
      /(\d+(?:\.\d+)?)\s*L\b(?!\s*\()/g,
      (match, raw: string, offset: number, source: string) => {
        const after = source.slice(offset + match.length, offset + match.length + 2);
        if (after.startsWith("/h")) return match;
        return operationalFuelText(Number(raw));
      }
    );

    if (next !== value) node.nodeValue = next;
  }
}

function enhanceMassText(root: HTMLElement) {
  const section = sectionByTitle(root, "1. Mass & Balance");
  if (!section) return;

  for (const node of textNodes(section)) {
    const value = node.nodeValue ?? "";
    const next = value.replace(
      /(\d+(?:\.\d+)?)\s*lb\b(?!\s*\()/g,
      (_match, raw: string) => {
        const pounds = Number(raw);
        return `${raw} lb (${Math.round(pounds / KG_TO_LB)} kg)`;
      }
    );
    if (next !== value) node.nodeValue = next;
  }

  const table = section.querySelector("table");
  if (!table) return;

  const weightHeading = Array.from(table.querySelectorAll("th")).find(
    (cell) => cell.textContent?.trim() === "Weight lb"
  );
  if (weightHeading) weightHeading.textContent = "Weight";

  table.querySelectorAll("tbody tr").forEach((row) => {
    const cells = row.querySelectorAll("td");
    const weightCell = cells[1];
    if (!weightCell) return;
    const raw = weightCell.textContent?.trim() ?? "";
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return;
    const pounds = Number(raw);
    weightCell.textContent = `${raw} lb (${Math.round(pounds / KG_TO_LB)} kg)`;
  });
}

function enhanceDistanceText(root: HTMLElement) {
  const section = sectionByTitle(root, "3. Aerodrome Performance");
  if (!section) return;

  for (const node of textNodes(section)) {
    const value = node.nodeValue ?? "";
    const next = value.replace(
      /(\d+(?:\.\d+)?)\s*m\b(?!\s*\()/g,
      (_match, raw: string) => {
        const meters = Number(raw);
        return `${raw} m (${Math.round(meters * FT_PER_M)} ft)`;
      }
    );
    if (next !== value) node.nodeValue = next;
  }
}

function addFuelInputHint(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll("label")).find(
    (element) => element.querySelector("span")?.textContent?.trim() === labelText
  );
  if (!(label instanceof HTMLElement)) return;

  const input = label.querySelector('input[type="number"]');
  if (!(input instanceof HTMLInputElement)) return;

  let hint = label.querySelector('[data-c152-usg-hint="true"]') as HTMLElement | null;
  if (!hint) {
    hint = document.createElement("span");
    hint.dataset.c152UsgHint = "true";
    hint.className = "block text-[11px] font-medium text-zinc-500";
    label.appendChild(hint);
  }

  const liters = Math.max(0, Number(input.value || 0));
  hint.textContent = exactFuelText(liters).replace(/^.*\(/, "(");
}

function enhanceFuelRate(root: HTMLElement) {
  const section = sectionByTitle(root, "4. Fuel Planning");
  if (!section) return;

  const unit = Array.from(section.querySelectorAll("span")).find(
    (element) => element.textContent?.trim() === "L/h"
  );
  if (!(unit instanceof HTMLElement)) return;

  const input = unit.parentElement?.querySelector('input[type="number"]');
  if (!(input instanceof HTMLInputElement)) return;

  let hint = unit.parentElement?.querySelector(
    '[data-c152-gph-hint="true"]'
  ) as HTMLElement | null;
  if (!hint) {
    hint = document.createElement("span");
    hint.dataset.c152GphHint = "true";
    hint.className = "text-xs font-medium text-zinc-500";
    unit.insertAdjacentElement("afterend", hint);
  }

  const litersPerHour = Math.max(0, Number(input.value || 0));
  hint.textContent = `(${(litersPerHour / LITERS_PER_US_GALLON).toFixed(1)} US gal/h)`;
}

function enhance(root: HTMLElement) {
  enhanceFuelText(root);
  enhanceMassText(root);
  enhanceDistanceText(root);
  addFuelInputHint(root, "Usable fuel (L)");
  addFuelInputHint(root, "Start / taxi / run-up allowance (L)");
  enhanceFuelRate(root);
}

export function C152ClientV4() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => enhance(root));
    };

    sync();
    root.addEventListener("input", sync, true);
    root.addEventListener("change", sync, true);

    return () => {
      window.cancelAnimationFrame(frame);
      root.removeEventListener("input", sync, true);
      root.removeEventListener("change", sync, true);
    };
  }, []);

  return (
    <div ref={rootRef}>
      <C152ClientV3 />
    </div>
  );
}
