"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { NavlogClient as BaseNavlogClient } from "./navlog-client";
import {
  formatOperationalSeconds,
  formatNavlogDuration,
} from "@/lib/operational-duration";

type AlternateStatus = {
  duration: string;
  detail: string;
  tone: "ok" | "caution" | "blocked";
} | null;

function findLabel(root: HTMLElement, text: string) {
  return Array.from(root.querySelectorAll("label")).find((label) =>
    Array.from(label.querySelectorAll("span")).some(
      (span) => span.textContent?.trim() === text
    )
  );
}

function parseDisplayedDuration(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const hoursMatch = normalized.match(/(\d+)\s*h(?:\s*(\d+)\s*min)?/i);
  if (hoursMatch) {
    return Number(hoursMatch[1]) * 3600 + Number(hoursMatch[2] ?? 0) * 60;
  }

  const clockMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (clockMatch) {
    const first = Number(clockMatch[1]);
    const second = Number(clockMatch[2]);
    return first >= 60 ? first * 60 + second : first * 60 + second;
  }

  const minuteMatch = normalized.match(/(\d+)\s*min/i);
  return minuteMatch ? Number(minuteMatch[1]) * 60 : 0;
}

function findSummaryGrid(root: HTMLElement) {
  const eteLabel = Array.from(root.querySelectorAll("p")).find(
    (item) => item.textContent?.trim() === "ETE"
  );
  return (eteLabel?.parentElement?.parentElement as HTMLElement | null) ?? null;
}

function readEteValue(root: HTMLElement) {
  const eteLabel = Array.from(root.querySelectorAll("p")).find(
    (item) => item.textContent?.trim() === "ETE"
  );
  return eteLabel?.parentElement?.querySelector("p.font-semibold") as HTMLElement | null;
}

function readEteSeconds(root: HTMLElement) {
  return parseDisplayedDuration(readEteValue(root)?.textContent?.trim() ?? "");
}

function readAircraft(root: HTMLElement) {
  const select = findLabel(root, "Aircraft")?.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) return "";
  const selectedText = select.selectedOptions[0]?.textContent?.trim() ?? "";
  return `${select.value} ${selectedText}`.trim();
}

function isPiperAircraft(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.includes("PIPER") || normalized.includes("PA28");
}

function readGroundMinutes(root: HTMLElement, fallback: number) {
  const input = findLabel(root, "Ground/taxi time")?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) return fallback;
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function readAlternateStatus(root: HTMLElement): AlternateStatus {
  const element = Array.from(root.querySelectorAll("div")).find((candidate) => {
    const text = candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.startsWith("HOLD MAX") && candidate.className.includes("rounded-xl");
  });

  if (!element) return null;

  const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const duration =
    text.match(/HOLD MAX\s+((?:\d+\s*h(?:\s*\d+\s*min)?|\d{1,3}:\d{2}))/i)?.[1] ??
    "";
  const detail = element.querySelector("span")?.textContent?.trim() ?? "";
  const className = String(element.className);
  const tone = className.includes("red-")
    ? "blocked"
    : className.includes("amber-")
      ? "caution"
      : "ok";

  if (!duration) return null;
  const seconds = parseDisplayedDuration(duration);
  return {
    duration: formatOperationalSeconds(seconds),
    detail,
    tone,
  };
}

function hasAlternateMarker(root: HTMLElement) {
  return Array.from(root.querySelectorAll("button")).some(
    (button) => button.textContent?.trim() === "Unset alternate"
  );
}

function updateFuelUnits(
  root: HTMLElement,
  showGallons: boolean,
  originals: Map<Text, string>
) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "OPTION"].includes(parent.tagName)) return;

    const original = originals.get(node) ?? node.nodeValue ?? "";
    if (!originals.has(node) && /\b\d+\(\d+\)\b/.test(original)) {
      originals.set(node, original);
    }

    const stored = originals.get(node);
    if (!stored) return;

    const next = showGallons
      ? stored
      : stored.replace(/\b(\d+)\(\d+\)\b/g, "$1");

    if (node.nodeValue !== next) node.nodeValue = next;
  });
}

function TotalTimeCard({ eteSeconds, groundMinutes }: {
  eteSeconds: number;
  groundMinutes: number;
}) {
  const totalSeconds = eteSeconds + groundMinutes * 60;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3" aria-live="polite">
      <p className="text-zinc-500">Total time</p>
      <p className="font-semibold text-zinc-950">
        {formatOperationalSeconds(totalSeconds)}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        ETE {formatNavlogDuration(eteSeconds)} + ground {formatOperationalSeconds(groundMinutes * 60)}
      </p>
    </div>
  );
}

function AlternateCard({ status, markerSet }: {
  status: AlternateStatus;
  markerSet: boolean;
}) {
  const tone = status?.tone ?? "caution";
  const classes =
    tone === "blocked"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "caution"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className={`rounded-2xl border p-3 ${classes}`} aria-live="polite">
      <p className="text-xs font-medium opacity-75">Alternate</p>
      {status ? (
        <>
          <p className="font-semibold">Leave within {status.duration}</p>
          <p className="mt-0.5 text-[11px] opacity-80">
            {status.detail || "Time available at destination before leaving for the alternate and landing with the 45 min final reserve."}
          </p>
        </>
      ) : markerSet ? (
        <>
          <p className="font-semibold">Alternate route incomplete</p>
          <p className="mt-0.5 text-[11px] opacity-80">
            Add at least one leg after the point marked Start alternate.
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold">Not set</p>
          <p className="mt-0.5 text-[11px] opacity-80">
            Mark the destination with Start alternate to calculate how long you may remain before diverting.
          </p>
        </>
      )}
    </div>
  );
}

export function NavlogClientV2() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fuelOriginalsRef = useRef(new Map<Text, string>());
  const [summaryGrid, setSummaryGrid] = useState<HTMLElement | null>(null);
  const [eteSeconds, setEteSeconds] = useState(0);
  const [groundMinutes, setGroundMinutes] = useState(20);
  const [aircraft, setAircraft] = useState("Tecnam P2006T");
  const [alternateStatus, setAlternateStatus] = useState<AlternateStatus>(null);
  const [alternateMarkerSet, setAlternateMarkerSet] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const nextAircraft = readAircraft(root);
      const nextGroundMinutes = readGroundMinutes(root, groundMinutes);
      const nextGrid = findSummaryGrid(root);
      const nextStatus = readAlternateStatus(root);
      const nextMarkerSet = hasAlternateMarker(root);
      const nextEteSeconds = readEteSeconds(root);

      updateFuelUnits(
        root,
        isPiperAircraft(nextAircraft),
        fuelOriginalsRef.current
      );

      if (nextGrid) {
        nextGrid.classList.remove("md:grid-cols-4");
        nextGrid.classList.add("md:grid-cols-6");
      }

      const eteValue = readEteValue(root);
      const formattedEte = formatNavlogDuration(nextEteSeconds);
      if (eteValue && eteValue.textContent !== formattedEte) {
        eteValue.textContent = formattedEte;
      }

      setSummaryGrid((current) => (current === nextGrid ? current : nextGrid));
      setEteSeconds(nextEteSeconds);
      setGroundMinutes(nextGroundMinutes);
      setAircraft(nextAircraft);
      setAlternateStatus((current) =>
        JSON.stringify(current) === JSON.stringify(nextStatus) ? current : nextStatus
      );
      setAlternateMarkerSet(nextMarkerSet);
    };

    const handleInput = () => queueMicrotask(sync);
    sync();
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleInput);
    root.addEventListener("click", handleInput);

    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      root.removeEventListener("input", handleInput);
      root.removeEventListener("change", handleInput);
      root.removeEventListener("click", handleInput);
    };
  }, [groundMinutes]);

  return (
    <div ref={rootRef}>
      <BaseNavlogClient />
      {summaryGrid
        ? createPortal(
            <>
              <TotalTimeCard
                eteSeconds={eteSeconds}
                groundMinutes={groundMinutes}
              />
              <AlternateCard
                status={alternateStatus}
                markerSet={alternateMarkerSet}
              />
            </>,
            summaryGrid
          )
        : null}
      <span className="sr-only" aria-live="polite">
        {isPiperAircraft(aircraft)
          ? "Fuel shown in litres and US gallons."
          : "Fuel shown in litres."}
      </span>
    </div>
  );
}
