"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearP2006TDownloadMode,
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
    title: "Download do formulário",
    description: "Apenas o formulário oficial de M&B e Performance preenchido.",
  },
  {
    mode: "kneeboard",
    title: "Download do kneeboard",
    description:
      "Uma única página com pesos, combustível, enroute e os valores ASDR/OEI de cada aeródromo.",
  },
  {
    mode: "tables",
    title: "Download das tabelas",
    description:
      "Tabelas AFM com células usadas, contas completas das correções e evidência OEI por aeródromo.",
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

function hiddenPdfStatus(section: HTMLElement | null) {
  return (
    Array.from(section?.querySelectorAll("p") ?? [])
      .map((item) => item.textContent?.trim() ?? "")
      .find((text) => /generated|failed|error|erro|não foi|could not/i.test(text)) ??
    ""
  );
}

export function P2006TMissionClientV10() {
  const rootRef = useRef<HTMLDivElement>(null);
  const originalSectionRef = useRef<HTMLElement | null>(null);
  const originalButtonRef = useRef<HTMLButtonElement | null>(null);
  const busyModeRef = useRef<P2006TDownloadMode | null>(null);
  const baselineStatusRef = useRef("");
  const sawDisabledRef = useRef(false);
  const startedAtRef = useRef(0);
  const [available, setAvailable] = useState(false);
  const [busyMode, setBusyMode] = useState<P2006TDownloadMode | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const finish = (message: string) => {
      busyModeRef.current = null;
      sawDisabledRef.current = false;
      setBusyMode(null);
      setStatus(message);
      const button = originalButtonRef.current;
      setAvailable(Boolean(button && !button.disabled));
    };

    const sync = () => {
      const section = pdfSection(root);
      const button = exportButton(section);
      originalSectionRef.current = section;
      originalButtonRef.current = button;

      if (section) section.style.display = "none";

      const activeMode = busyModeRef.current;
      if (!activeMode) {
        setAvailable(Boolean(button && !button.disabled));
        return;
      }

      setAvailable(false);
      if (button?.disabled) sawDisabledRef.current = true;

      const hiddenStatus = hiddenPdfStatus(section);
      const statusChanged =
        Boolean(hiddenStatus) && hiddenStatus !== baselineStatusRef.current;
      const finishedByStatus =
        statusChanged && /generated|failed|error|erro|não foi|could not/i.test(hiddenStatus);
      const finishedByButton =
        sawDisabledRef.current && Boolean(button && !button.disabled);

      if (finishedByStatus || finishedByButton) {
        finish(hiddenStatus || "PDF gerado e download iniciado.");
        return;
      }

      if (Date.now() - startedAtRef.current > 180_000) {
        clearP2006TDownloadMode();
        finish("A geração demorou demasiado tempo. Pode tentar novamente.");
      }
    };

    sync();
    const interval = window.setInterval(sync, 200);
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      if (originalSectionRef.current) {
        originalSectionRef.current.style.display = "";
      }
    };
  }, []);

  function download(mode: P2006TDownloadMode) {
    const button = originalButtonRef.current;
    const section = originalSectionRef.current;
    if (!button || button.disabled || busyModeRef.current) return;

    baselineStatusRef.current = hiddenPdfStatus(section);
    sawDisabledRef.current = false;
    startedAtRef.current = Date.now();
    busyModeRef.current = mode;
    setP2006TDownloadMode(mode);
    setStatus("");
    setBusyMode(mode);
    setAvailable(false);

    // Run on the next task so the selected card can paint its busy state first.
    window.setTimeout(() => {
      const current = originalButtonRef.current;
      if (!current || current.disabled) {
        clearP2006TDownloadMode();
        busyModeRef.current = null;
        setBusyMode(null);
        setStatus("O gerador PDF ainda não está disponível.");
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
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
            Downloads PDF
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
            Gere cada documento operacional em separado. Depois de terminar um
            download, os três botões ficam novamente disponíveis.
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
                  {busy ? "A gerar..." : downloadOption.title}
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
            Complete os quatro cálculos de aeródromo e a massa vazia do avião
            antes de fazer os downloads.
          </p>
        ) : null}
        {status ? <p className="mt-3 text-sm text-zinc-600">{status}</p> : null}
      </section>
    </div>
  );
}
