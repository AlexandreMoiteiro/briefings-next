"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearP2006TDownloadMode,
  P2006T_DOWNLOAD_FAILED_EVENT,
  P2006T_DOWNLOAD_FINISHED_EVENT,
  setP2006TDownloadMode,
  type P2006TDownloadMode,
} from "@/lib/pdf/p2006t-download-mode";
import { P2006TMissionClientV9 } from "./p2006t-mission-client-v9";
import { enhanceAerodromePerformance } from "./aerodrome-performance-ui";

const DOWNLOADS: Array<{
  mode: P2006TDownloadMode;
  title: string;
  description: string;
}> = [
  {
    mode: "form",
    title: "Official form",
    description: "Completed Mass & Balance and Performance form.",
  },
  {
    mode: "kneeboard",
    title: "Kneeboard",
    description:
      "One-page operational summary with weights, fuel, enroute and aerodrome ASDR/OEI values.",
  },
  {
    mode: "tables",
    title: "AFM tables",
    description:
      "Source tables with the values used, interpolation calculations and OEI evidence for each aerodrome.",
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
    Array.from(section.querySelectorAll("button")).find((button) =>
      /^(Export PDF|Generating\.\.\.)$/i.test(button.textContent?.trim() ?? "")
    ) ?? null
  );
}

function hiddenPdfStatus(section: HTMLElement | null) {
  return (
    Array.from(section?.querySelectorAll("p") ?? [])
      .map((item) => item.textContent?.trim() ?? "")
      .find((text) =>
        /generated|failed|error|erro|não foi|could not/i.test(text)
      ) ?? ""
  );
}

function hideUnusableFuel(root: HTMLElement) {
  const label = Array.from(root.querySelectorAll("p")).find(
    (element) => element.textContent?.trim() === "Unusable"
  );
  const metric = label?.closest("div.rounded-2xl") as HTMLElement | null;
  if (!metric) return;

  if (!metric.hidden) metric.hidden = true;
  if (metric.getAttribute("aria-hidden") !== "true") {
    metric.setAttribute("aria-hidden", "true");
  }
  const grid = metric.parentElement;
  if (grid) {
    if (grid.classList.contains("sm:grid-cols-3")) {
      grid.classList.remove("sm:grid-cols-3");
    }
    if (!grid.classList.contains("sm:grid-cols-2")) {
      grid.classList.add("sm:grid-cols-2");
    }
  }
}

export function P2006TMissionClientV10() {
  const rootRef = useRef<HTMLDivElement>(null);
  const originalSectionRef = useRef<HTMLElement | null>(null);
  const originalButtonRef = useRef<HTMLButtonElement | null>(null);
  const busyModeRef = useRef<P2006TDownloadMode | null>(null);
  const baselineStatusRef = useRef("");
  const watchdogRef = useRef<number | null>(null);
  const [available, setAvailable] = useState(false);
  const [busyMode, setBusyMode] = useState<P2006TDownloadMode | null>(null);
  const [status, setStatus] = useState("");

  function releaseDownload(message: string) {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    clearP2006TDownloadMode();
    busyModeRef.current = null;
    setBusyMode(null);
    setStatus(message);

    const button = originalButtonRef.current;
    setAvailable(Boolean(button && !button.disabled));
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      enhanceAerodromePerformance(root);
      hideUnusableFuel(root);

      const section = pdfSection(root);
      const button = exportButton(section);
      originalSectionRef.current = section;
      if (button) originalButtonRef.current = button;

      if (section && section.style.display !== "none") {
        section.style.display = "none";
      }

      const activeMode = busyModeRef.current;
      if (!activeMode) {
        setAvailable(Boolean(button && !button.disabled));
        return;
      }

      setAvailable(false);
      const hiddenStatus = hiddenPdfStatus(section);
      const statusChanged =
        Boolean(hiddenStatus) && hiddenStatus !== baselineStatusRef.current;
      if (
        statusChanged &&
        /generated|failed|error|erro|não foi|could not/i.test(hiddenStatus)
      ) {
        releaseDownload(hiddenStatus);
      }
    };

    const onFinished = () => {
      if (busyModeRef.current) {
        releaseDownload("PDF generated and download started.");
      }
    };

    const onFailed = (event: Event) => {
      if (!busyModeRef.current) return;
      const custom = event as CustomEvent<{ message?: string }>;
      releaseDownload(custom.detail?.message || "Could not generate the PDF.");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    window.addEventListener(P2006T_DOWNLOAD_FINISHED_EVENT, onFinished);
    window.addEventListener(P2006T_DOWNLOAD_FAILED_EVENT, onFailed);

    return () => {
      observer.disconnect();
      window.removeEventListener(P2006T_DOWNLOAD_FINISHED_EVENT, onFinished);
      window.removeEventListener(P2006T_DOWNLOAD_FAILED_EVENT, onFailed);
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      clearP2006TDownloadMode();
      if (originalSectionRef.current) {
        originalSectionRef.current.style.display = "";
      }
    };
  }, []);

  function download(mode: P2006TDownloadMode) {
    const button = originalButtonRef.current;
    const section = originalSectionRef.current;
    if (!button || button.disabled || busyModeRef.current) return;

    clearP2006TDownloadMode();
    baselineStatusRef.current = hiddenPdfStatus(section);
    busyModeRef.current = mode;
    setP2006TDownloadMode(mode);
    setStatus("");
    setBusyMode(mode);
    setAvailable(false);

    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
    }
    watchdogRef.current = window.setTimeout(() => {
      if (busyModeRef.current) {
        releaseDownload(
          "PDF generation took too long. The download buttons are available again so you can retry."
        );
      }
    }, 90_000);

    window.setTimeout(() => {
      const current = originalButtonRef.current;
      if (!current || current.disabled) {
        releaseDownload("The PDF generator is not ready yet.");
        return;
      }
      current.click();
    }, 0);
  }

  return (
    <div ref={rootRef} className="space-y-6">
      <P2006TMissionClientV9 />

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Export
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
            PDF downloads
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
            Choose the document you need. Each option uses the same calculation currently shown above.
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
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-left transition hover:border-zinc-500 hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                <span className="block text-sm font-semibold text-zinc-950">
                  {busy ? "Generating…" : downloadOption.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  {downloadOption.description}
                </span>
              </button>
            );
          })}
        </div>

        {!available && !busyMode ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Complete the four aerodrome calculations and aircraft empty-mass data before downloading.
          </p>
        ) : null}
        {status ? <p className="mt-3 text-sm text-zinc-600">{status}</p> : null}
      </section>
    </div>
  );
}
