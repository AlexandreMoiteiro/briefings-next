"use client";

import { useEffect, useRef } from "react";
import { formatOperationalMinutes } from "@/lib/operational-duration";
import { P2006TMissionClientV3 } from "./p2006t-mission-client-v3";

const DURATION_LABEL = /^(CLIMB|ENROUTE|DESCENT|ALTERNATE 1|ALTERNATE 2|RESERVE) MIN$/i;

function parseOperationalMinutes(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;

  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Math.max(0, Math.round(Number(normalized)));
  }

  const clock = normalized.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (clock) {
    return Math.max(0, Number(clock[1]) * 60 + Number(clock[2]));
  }

  const hoursAndMinutes = normalized.match(
    /^(?:(\d+)\s*h(?:ours?)?)?(?:\s*(\d+)\s*m(?:in(?:utes?)?)?)?$/
  );
  if (hoursAndMinutes && (hoursAndMinutes[1] || hoursAndMinutes[2])) {
    return Math.max(
      0,
      Number(hoursAndMinutes[1] ?? 0) * 60 + Number(hoursAndMinutes[2] ?? 0)
    );
  }

  return null;
}

function setControlledNumberInput(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function enhanceDurationField(label: HTMLLabelElement) {
  const caption = label.querySelector("span");
  const input = label.querySelector('input[type="number"]') as HTMLInputElement | null;
  if (!caption || !input || !DURATION_LABEL.test(caption.textContent?.trim() ?? "")) {
    return;
  }

  caption.textContent = (caption.textContent ?? "").replace(/ MIN$/i, " TIME");

  let proxy = label.querySelector(
    'input[data-operational-duration="true"]'
  ) as HTMLInputElement | null;

  if (!proxy) {
    proxy = document.createElement("input");
    proxy.type = "text";
    proxy.inputMode = "text";
    proxy.dataset.operationalDuration = "true";
    proxy.className = input.className;
    proxy.setAttribute("aria-label", caption.textContent ?? "Duration");
    input.insertAdjacentElement("afterend", proxy);
    input.hidden = true;

    const commit = () => {
      const minutes = parseOperationalMinutes(proxy?.value ?? "");
      if (minutes === null) {
        proxy!.value = formatOperationalMinutes(Number(input.value) || 0);
        return;
      }
      setControlledNumberInput(input, minutes);
      proxy!.value = formatOperationalMinutes(minutes);
    };

    proxy.addEventListener("blur", commit);
    proxy.addEventListener("change", commit);
    proxy.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
        proxy?.blur();
      }
    });
    input.addEventListener("input", () => {
      if (document.activeElement !== proxy) {
        proxy!.value = formatOperationalMinutes(Number(input.value) || 0);
      }
    });
  }

  if (document.activeElement !== proxy) {
    proxy.value = formatOperationalMinutes(Number(input.value) || 0);
  }
  input.hidden = true;
}

function enhanceDurationFields(root: HTMLElement) {
  root.querySelectorAll("label").forEach((element) => {
    enhanceDurationField(element as HTMLLabelElement);
  });
}

export function P2006TMissionClientV4() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => enhanceDurationFields(root);
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="space-y-4">
      <P2006TMissionClientV3 />
    </div>
  );
}
