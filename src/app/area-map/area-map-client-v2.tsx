"use client";

import { useEffect, useRef } from "react";
import { AreaMapClient as BaseAreaMapClient } from "./area-map-client";

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function setControlledSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyAreaMapDefaults(root: HTMLElement) {
  const pdfLabel = Array.from(root.querySelectorAll("label")).find(
    (label) =>
      normalize(label.querySelector("span")?.textContent) === "pdf background"
  );
  const pdfSelect = pdfLabel?.querySelector("select") as HTMLSelectElement | null;

  if (pdfSelect && pdfSelect.dataset.vfrDefaultApplied !== "true") {
    pdfSelect.dataset.vfrDefaultApplied = "true";
    setControlledSelect(pdfSelect, "vfr-chart");
  }

  const textarea = root.querySelector("textarea");
  if (textarea && !textarea.placeholder.includes("S OF N3845")) {
    textarea.placeholder =
      "SIGMET/GAMET examples:\nS OF N3845 AND W OF W00815\nN3842 W00900 - N3900 W00830\n384221N 0090058W - 384226N 0090052W";
  }

  const acceptedFormats = Array.from(root.querySelectorAll("div")).find(
    (element) =>
      normalize(element.querySelector(":scope > strong")?.textContent) ===
      "accepted formats:"
  );

  if (
    acceptedFormats &&
    !acceptedFormats.textContent?.includes("S OF N3845")
  ) {
    acceptedFormats.append(
      " Directional sectors such as S OF N3845 AND W OF W00815 are also supported."
    );
  }
}

export function AreaMapClientV2() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => applyAreaMapDefaults(root);
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, { subtree: true, childList: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <BaseAreaMapClient />
    </div>
  );
}
