"use client";

import { useEffect, useRef, useState } from "react";
import {
  setP2006TDownloadMode,
  type P2006TDownloadMode,
} from "@/lib/pdf/p2006t-download-mode";
import { P2006TMissionClientV9 } from "./p2006t-mission-client-v9";

const DOWNLOADS: Array<{
  mode: P2006TDownloadMode;
  title: string;
  description: string;
}> = [
  {
    mode: "form",
    title: "Download performance form",
    description: "Only the completed official M&B and Performance form spread.",
  },
  {
    mode: "kneeboard",
    title: "Download kneeboard",
    description:
      "Only the standard kneeboard and the OEI sheet with ASDR, gradient and service ceiling calculations.",
  },
  {
    mode: "tables",
    title: "Download performance tables",
    description:
      "Aerodrome, enroute, cruise and mapped OEI source tables with the calculation cells highlighted.",
  },
];

function pdfSection(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === "PDF contents"
  );
  return heading?.closest("section") as HTMLElement | null;
}

function exportButton(section: HTMLElement | null) {
  if (!section) return null;
  return (
    Array.from(section.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Export PDF"
    ) ?? null
  );
}

export function P2006TMissionClientV10() {
  const rootRef = useRef<HTMLDivElement>(null);
  const originalSectionRef = useRef<HTMLElement | null>(null);
  const originalButtonRef = useRef<HTMLButtonElement | null>(null);
  const sawDisabledRef = useRef(false);
  const [available, setAvailable] = useState(false);
  const [busyMode, setBusyMode] = useState<P2006TDownloadMode | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const section = pdfSection(root);
      const button = exportButton(section);
      originalSectionRef.current = section;
      originalButtonRef.current = button;

      if (section) section.style.display = "none";
      setAvailable(Boolean(button && !button.disabled));

      if (busyMode && button?.disabled) {
        sawDisabledRef.current = true;
      }
      if (busyMode && sawDisabledRef.current && button && !button.disabled) {
        const hiddenStatus = Array.from(section?.querySelectorAll("p") ?? [])
          .map((item) => item.textContent?.trim() ?? "")
          .find((text) => /generated|failed|não|erro|error/i.test(text));
        setStatus(hiddenStatus || "PDF generated and download started.");
        setBusyMode(null);
        sawDisabledRef.current = false;
      }
    };

    sync();
    const interval = window.setInterval(sync, 250);
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, attributes: true });

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      if (originalSectionRef.current) {
        originalSectionRef.current.style.display = "";
      }
    };
  }, [busyMode]);

  function download(mode: P2006TDownloadMode) {
    const button = originalButtonRef.current;
    if (!button || button.disabled || busyMode) return;
    setP2006TDownloadMode(mode);
    setStatus("");
    sawDisabledRef.current = false;
    setBusyMode(mode);
    button.click();
  }

  return (
    <div ref={rootRef} className="space-y-6">
      <P2006TMissionClientV9 />

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
            PDF downloads
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
            Generate each operational document separately. The tables PDF uses
            the OEI mapper geometry saved in Admin for the selected aircraft.
          </p>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {DOWNLOADS.map((downloadOption) => {
            const busy = busyMode === downloadOption.mode;
            return (
              <button
                key={downloadOption.mode}
                type="button"
                onClick={() => download(downloadOption.mode)}
                disabled={!available || Boolean(busyMode)}
                className="rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-500 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                <span className="block text-sm font-semibold text-zinc-950">
                  {busy ? "Generating..." : downloadOption.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  {downloadOption.description}
                </span>
              </button>
            );
          })}
        </div>

        {!available && !busyMode ? (
          <p className="mt-3 text-sm text-amber-700">
            Complete all four aerodrome calculations and the aircraft empty
            mass before downloading.
          </p>
        ) : null}
        {status ? <p className="mt-3 text-sm text-zinc-600">{status}</p> : null}
      </section>
    </div>
  );
}
