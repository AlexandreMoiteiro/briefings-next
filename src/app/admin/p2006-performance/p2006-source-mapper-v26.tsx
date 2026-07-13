"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import { P2006TSourceMapper as BaseMapper } from "./p2006-source-mapper-v17";

type StoredPage = {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  savedAt: string;
};

type StoredPageRecord = StoredPage & {
  id: "page-1" | "page-2";
};

type StoredForm = {
  pageOne: StoredPage | null;
  pageTwo: StoredPage | null;
};

const DB_NAME = "briefings-p2006-form-upload-v2";
const DB_VERSION = 1;
const DB_STORE = "pages";
const FORM_META_KEY = "briefings_p2006_form_upload_v2";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Local browser storage is unavailable."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local form storage."));
  });
}

async function saveStoredForm(form: StoredForm) {
  if (!form.pageOne || !form.pageTwo) return;
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      const store = transaction.objectStore(DB_STORE);
      const pageOne: StoredPageRecord = { id: "page-1", ...form.pageOne! };
      const pageTwo: StoredPageRecord = { id: "page-2", ...form.pageTwo! };
      store.put(pageOne);
      store.put(pageTwo);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save the form locally."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Saving the form was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function readStoredForm(): Promise<StoredForm> {
  const database = await openDatabase();

  try {
    return await new Promise<StoredForm>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).getAll();

      request.onsuccess = () => {
        const records = request.result as StoredPageRecord[];
        const page = (id: StoredPageRecord["id"]) => {
          const record = records.find((candidate) => candidate.id === id);
          if (!record) return null;
          const { id: _id, ...storedPage } = record;
          return storedPage;
        };

        resolve({ pageOne: page("page-1"), pageTwo: page("page-2") });
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not read the saved form."));
    });
  } finally {
    database.close();
  }
}

async function clearStoredForm() {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not remove the saved form."));
    });
  } finally {
    database.close();
  }
}

function normalizeCanvas(canvas: HTMLCanvasElement) {
  const maxWidth = 1500;
  const scale = Math.min(1, maxWidth / canvas.width);
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(canvas.width * scale));
  output.height = Math.max(1, Math.round(canvas.height * scale));
  const context = output.getContext("2d", { alpha: false });

  if (!context) throw new Error("The browser did not provide a canvas context.");

  context.fillStyle = "white";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0, output.width, output.height);
  return output;
}

function canvasToStoredPage(canvas: HTMLCanvasElement, fileName: string): StoredPage {
  let quality = 0.88;
  let dataUrl = canvas.toDataURL("image/webp", quality);

  while (dataUrl.length > 3_500_000 && quality > 0.48) {
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

async function renderPdfPages(file: File): Promise<StoredForm> {
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
      const viewport = page.getViewport({ scale: 2.2 });
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

    const pageOneCanvas = await renderPage(1);
    const pageTwoCanvas = await renderPage(2);

    return {
      pageOne: canvasToStoredPage(pageOneCanvas, file.name),
      pageTwo: canvasToStoredPage(pageTwoCanvas, file.name),
    };
  } finally {
    await pdf.destroy();
  }
}

function placeholderDataUrl(page: 1 | 2) {
  const title = `Upload the two-page form PDF to show Form page ${page}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1191" height="1684" viewBox="0 0 1191 1684"><rect width="1191" height="1684" fill="white"/><rect x="35" y="35" width="1121" height="1614" rx="22" fill="none" stroke="#94a3b8" stroke-width="4" stroke-dasharray="16 12"/><text x="595.5" y="820" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#0f172a">${title}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function applyPageImage(image: HTMLImageElement, page: StoredPage | null, pageNumber: 1 | 2) {
  const source = page?.dataUrl ?? placeholderDataUrl(pageNumber);

  image.removeAttribute("srcset");
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "auto";
  image.style.opacity = "1";
  image.style.visibility = "visible";
  image.style.objectFit = "contain";

  const surface = image.parentElement;
  if (surface) {
    surface.style.aspectRatio = `${page?.width ?? 1191} / ${page?.height ?? 1684}`;
    surface.style.minHeight = "480px";
    surface.style.background = "white";
  }

  if (image.getAttribute("src") !== source) {
    image.setAttribute("src", source);
  }
}

function findAircraftSelect(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLSelectElement>("select")).find((select) =>
    Array.from(select.options).some((option) => option.value === "CS-EAQ")
  );
}

function updateMaximumWeightLabels(root: HTMLElement) {
  const registration = (findAircraftSelect(root)?.value ?? "CS-EAQ") as P2006TRegistration;
  const maxMassKg = registration === "CS-EAQ" ? 1180 : 1230;

  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>("nav button"))) {
    const label = button.querySelector("span");
    if (!label) continue;
    const text = label.textContent?.trim() ?? "";

    if (/^T\/O (MAX|1180|1230)$/.test(text)) {
      const next = `T/O ${maxMassKg}`;
      if (text !== next) label.textContent = next;
    }
    if (/^LDG (MAX|1180|1230)$/.test(text)) {
      const next = `LDG ${maxMassKg}`;
      if (text !== next) label.textContent = next;
    }
  }
}

function synchronizeMapper(root: HTMLElement, form: StoredForm) {
  const pageOneImage = root.querySelector<HTMLImageElement>(
    "img[alt='P2006T form page 1']"
  );
  const pageTwoImage = root.querySelector<HTMLImageElement>(
    "img[alt='P2006T form page 2']"
  );

  if (pageOneImage) applyPageImage(pageOneImage, form.pageOne, 1);
  if (pageTwoImage) applyPageImage(pageTwoImage, form.pageTwo, 2);
  updateMaximumWeightLabels(root);
}

export function P2006TSourceMapper() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<StoredForm>({ pageOne: null, pageTwo: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [meta, setMeta] = useState<{ fileName: string; savedAt: string } | null>(null);

  useEffect(() => {
    const storedMeta = window.localStorage.getItem(FORM_META_KEY);
    if (storedMeta) {
      try {
        setMeta(JSON.parse(storedMeta) as { fileName: string; savedAt: string });
      } catch {
        window.localStorage.removeItem(FORM_META_KEY);
      }
    }

    void readStoredForm()
      .then(setForm)
      .catch(() => {
        // The mapper remains fully usable; the user can load the form again.
      });
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const synchronize = () => synchronizeMapper(root, form);
    synchronize();
    const interval = window.setInterval(synchronize, 500);
    root.addEventListener("change", synchronize);

    return () => {
      window.clearInterval(interval);
      root.removeEventListener("change", synchronize);
    };
  }, [form]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setMessage("Choose the original two-page form PDF.");
      return;
    }

    setBusy(true);
    setMessage("Rendering Form pages 1 and 2 locally…");

    try {
      const rendered = await renderPdfPages(file);
      setForm(rendered);

      try {
        await saveStoredForm(rendered);
        const nextMeta = { fileName: file.name, savedAt: new Date().toISOString() };
        window.localStorage.setItem(FORM_META_KEY, JSON.stringify(nextMeta));
        setMeta(nextMeta);
        setMessage("Form loaded and saved locally. No page reload is required.");
      } catch {
        setMessage("Form loaded for this session. Permanent browser storage was unavailable.");
      }
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
    try {
      await clearStoredForm();
      window.localStorage.removeItem(FORM_META_KEY);
      setForm({ pageOne: null, pageTwo: null });
      setMeta(null);
      setMessage("Local form removed. The performance source pages were not changed.");
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "The local form could not be removed."
      );
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
              Page 1 is reused for all three M&amp;B mappings and page 2 is used by the
              shared form stage. Takeoff and landing pages continue to load from GitHub.
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
            CS-EAQ: 1180 kg maximum
          </p>
          <p className="rounded-xl bg-white px-3 py-2 font-semibold text-zinc-700">
            CS-EBX: 1230 kg maximum
          </p>
          <p className="rounded-xl bg-white px-3 py-2 font-semibold text-zinc-700">
            D-GSEV: 1230 kg maximum
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

      <BaseMapper />
    </div>
  );
}
