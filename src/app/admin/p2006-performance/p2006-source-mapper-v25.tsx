"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { P2006TSourceMapper as ExistingMapper } from "./p2006-source-mapper-v24";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

type StoredPage = {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  savedAt: string;
};

type StoredPageOneRecord = StoredPage & {
  registration: P2006TRegistration;
};

type SharedPageRecord = StoredPage & {
  id: "page-2";
};

const PAGE_ONE_DB = "briefings-p2006-form-backgrounds";
const PAGE_ONE_DB_VERSION = 1;
const PAGE_ONE_STORE = "page-one";
const SHARED_DB = "briefings-p2006-shared-form";
const SHARED_DB_VERSION = 1;
const SHARED_STORE = "pages";
const META_KEY = "briefings_p2006_shared_form_upload_meta_v1";
const REGISTRATIONS: P2006TRegistration[] = ["CS-EAQ", "CS-EBX", "D-GSEV"];

function openPageOneDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(PAGE_ONE_DB, PAGE_ONE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PAGE_ONE_STORE)) {
        database.createObjectStore(PAGE_ONE_STORE, { keyPath: "registration" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the form background database."));
  });
}

function openSharedDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(SHARED_DB, SHARED_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SHARED_STORE)) {
        database.createObjectStore(SHARED_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the shared form database."));
  });
}

async function savePageOneForAll(page: StoredPage) {
  const database = await openPageOneDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PAGE_ONE_STORE, "readwrite");
      const store = transaction.objectStore(PAGE_ONE_STORE);

      for (const registration of REGISTRATIONS) {
        const record: StoredPageOneRecord = {
          ...page,
          registration,
          fileName: `${page.fileName} · shared form`,
        };
        store.put(record);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save Form page 1."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Saving Form page 1 was aborted."));
    });
  } finally {
    database.close();
  }
}

async function clearPageOneForAll() {
  const database = await openPageOneDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PAGE_ONE_STORE, "readwrite");
      const store = transaction.objectStore(PAGE_ONE_STORE);
      REGISTRATIONS.forEach((registration) => store.delete(registration));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not remove Form page 1."));
    });
  } finally {
    database.close();
  }
}

async function savePageTwo(page: StoredPage) {
  const database = await openSharedDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SHARED_STORE, "readwrite");
      const record: SharedPageRecord = { ...page, id: "page-2" };
      transaction.objectStore(SHARED_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save Form page 2."));
    });
  } finally {
    database.close();
  }
}

async function readPageTwo(): Promise<StoredPage | null> {
  try {
    const database = await openSharedDatabase();

    try {
      return await new Promise<StoredPage | null>((resolve, reject) => {
        const transaction = database.transaction(SHARED_STORE, "readonly");
        const request = transaction.objectStore(SHARED_STORE).get("page-2");
        request.onsuccess = () => {
          const record = request.result as SharedPageRecord | undefined;
          if (!record) {
            resolve(null);
            return;
          }
          const { id: _id, ...page } = record;
          resolve(page);
        };
        request.onerror = () =>
          reject(request.error ?? new Error("Could not read Form page 2."));
      });
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}

async function clearPageTwo() {
  const database = await openSharedDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SHARED_STORE, "readwrite");
      transaction.objectStore(SHARED_STORE).delete("page-2");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not remove Form page 2."));
    });
  } finally {
    database.close();
  }
}

function normalizeCanvas(canvas: HTMLCanvasElement) {
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / canvas.width);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d", { alpha: false });

  if (!context) throw new Error("The browser did not provide a canvas context.");

  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(canvas, 0, 0, width, height);
  return output;
}

function canvasToStoredPage(canvas: HTMLCanvasElement, fileName: string): StoredPage {
  let quality = 0.9;
  let dataUrl = canvas.toDataURL("image/webp", quality);

  while (dataUrl.length > 3_500_000 && quality > 0.5) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/webp", quality);
  }

  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/png");
  }

  return {
    dataUrl,
    fileName,
    width: canvas.width,
    height: canvas.height,
    savedAt: new Date().toISOString(),
  };
}

async function renderPdfPages(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    if (pdf.numPages < 2) {
      throw new Error("The form PDF must contain at least two pages.");
    }

    const renderPage = async (pageNumber: number) => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.4 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });

      if (!context) throw new Error("The browser did not provide a canvas context.");

      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return normalizeCanvas(canvas);
    };

    const [pageOneCanvas, pageTwoCanvas] = await Promise.all([
      renderPage(1),
      renderPage(2),
    ]);

    return {
      pageOne: canvasToStoredPage(pageOneCanvas, file.name),
      pageTwo: canvasToStoredPage(pageTwoCanvas, file.name),
    };
  } finally {
    await pdf.destroy();
  }
}

function findAircraftSelect(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLSelectElement>("select")).find((select) =>
    Array.from(select.options).some((option) => option.value === "CS-EAQ")
  );
}

function repairMaximumWeightLabels(root: HTMLElement) {
  const registration = (findAircraftSelect(root)?.value ?? "CS-EAQ") as P2006TRegistration;
  const maxMassKg = registration === "CS-EAQ" ? 1180 : 1230;

  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>("nav button"))) {
    const label = button.querySelector("span");
    if (!label) continue;

    const text = label.textContent?.trim() ?? "";
    if (/^T\/O (MAX|1180|1230)$/.test(text)) {
      label.textContent = `T/O ${maxMassKg}`;
    }
    if (/^LDG (MAX|1180|1230)$/.test(text)) {
      label.textContent = `LDG ${maxMassKg}`;
    }
  }
}

function hideLegacyUploader(root: HTMLElement) {
  for (const section of Array.from(root.querySelectorAll<HTMLElement>("section"))) {
    if (section.textContent?.includes("Local Form page 1 backgrounds")) {
      section.style.display = "none";
    }
  }
}

function applyPageTwo(root: HTMLElement, pageTwo: StoredPage | null) {
  if (!pageTwo) return;

  const image = root.querySelector<HTMLImageElement>("img[alt='P2006T form page 2']");
  if (!image) return;

  image.removeAttribute("srcset");
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "auto";
  image.style.opacity = "1";
  image.style.visibility = "visible";

  if (image.getAttribute("src") !== pageTwo.dataUrl) {
    image.setAttribute("src", pageTwo.dataUrl);
  }
}

export function P2006TSourceMapper() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pageTwo, setPageTwo] = useState<StoredPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [meta, setMeta] = useState<{ fileName: string; savedAt: string } | null>(null);

  useEffect(() => {
    const storedMeta = window.localStorage.getItem(META_KEY);
    if (storedMeta) {
      try {
        setMeta(JSON.parse(storedMeta) as { fileName: string; savedAt: string });
      } catch {
        window.localStorage.removeItem(META_KEY);
      }
    }

    void readPageTwo().then(setPageTwo);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const repair = () => {
      hideLegacyUploader(root);
      repairMaximumWeightLabels(root);
      applyPageTwo(root, pageTwo);
    };

    repair();

    const observer = new MutationObserver(repair);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("change", repair);
    const interval = window.setInterval(repair, 400);

    return () => {
      observer.disconnect();
      root.removeEventListener("change", repair);
      window.clearInterval(interval);
    };
  }, [pageTwo]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      setMessage("Choose the original two-page form PDF.");
      return;
    }

    setBusy(true);
    setMessage("Rendering both form pages locally…");

    try {
      const rendered = await renderPdfPages(file);
      await Promise.all([
        savePageOneForAll(rendered.pageOne),
        savePageTwo(rendered.pageTwo),
      ]);

      const nextMeta = { fileName: file.name, savedAt: new Date().toISOString() };
      window.localStorage.setItem(META_KEY, JSON.stringify(nextMeta));
      setMeta(nextMeta);
      setPageTwo(rendered.pageTwo);
      setMessage("Form loaded. Reloading the mapper with both pages…");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "The form PDF could not be prepared."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeUpload() {
    setBusy(true);
    setMessage("Removing the local form…");

    try {
      await Promise.all([clearPageOneForAll(), clearPageTwo()]);
      window.localStorage.removeItem(META_KEY);
      setMeta(null);
      setPageTwo(null);
      window.setTimeout(() => window.location.reload(), 250);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="space-y-5">
      <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
              Shared two-page form
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Upload the form PDF once
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-700">
              Page 1 is reused for EAQ, EBX and D-GSEV M&amp;B mapping. Page 2 is used by
              the shared Form page 2 stage. Takeoff and landing pages continue to load
              from GitHub and are not affected.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
              {busy ? "Preparing…" : meta ? "Replace form PDF" : "Choose form PDF"}
              <input
                type="file"
                accept="application/pdf"
                disabled={busy}
                onChange={(event) => void handleUpload(event)}
                className="sr-only"
              />
            </label>
            {meta ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeUpload()}
                className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700"
              >
                Remove local form
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <p className="rounded-xl bg-white px-3 py-2 font-semibold text-zinc-700">
            CS-EAQ M&amp;B limit: 1180 kg
          </p>
          <p className="rounded-xl bg-white px-3 py-2 font-semibold text-zinc-700">
            CS-EBX M&amp;B limit: 1230 kg
          </p>
          <p className="rounded-xl bg-white px-3 py-2 font-semibold text-zinc-700">
            D-GSEV M&amp;B limit: 1230 kg
          </p>
        </div>

        {meta ? (
          <p className="mt-3 break-all text-xs text-zinc-500">Loaded: {meta.fileName}</p>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-700">
            {message}
          </p>
        ) : null}
      </section>

      <ExistingMapper />
    </div>
  );
}
