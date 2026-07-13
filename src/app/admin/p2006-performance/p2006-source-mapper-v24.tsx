"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  P2006T_FLEET,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import { P2006TSourceMapper as BaseMapper } from "./p2006-source-mapper-v17";
import type { CaptureStore } from "./p2006-mapper-definitions";

type PageOneRegistration = P2006TRegistration;

type UploadedPage = {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  savedAt: string;
};

type UploadedPageRecord = UploadedPage & {
  registration: PageOneRegistration;
};

type UploadedPages = Partial<Record<PageOneRegistration, UploadedPage>>;

const CAPTURE_STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const LEGACY_UPLOAD_STORAGE_KEY = "briefings_p2006_page_one_uploads_v1";
const MIGRATION_KEY = "briefings_p2006_page_one_uploads_indexeddb_v25";
const DB_NAME = "briefings-p2006-form-backgrounds";
const DB_VERSION = 1;
const DB_STORE = "page-one";
const OLD_PREFIXES = [
  "shared:form-page-1-fields:",
  "shared:mass-balance-graph:",
] as const;

const PAGE_ONE_CONFIG = P2006T_FLEET.map((aircraft) => ({
  registration: aircraft.registration,
  maxMassKg: aircraft.maxMassKg,
  stageId: `form-page-1-${aircraft.registration.toLowerCase()}`,
}));

function destinationRegistrations(stepId: string): PageOneRegistration[] {
  if (stepId === "mass-limit-1180") return ["CS-EAQ"];
  if (stepId === "mass-limit-1230") return ["CS-EBX", "D-GSEV"];
  return PAGE_ONE_CONFIG.map((candidate) => candidate.registration);
}

function stageIdFor(registration: PageOneRegistration) {
  return PAGE_ONE_CONFIG.find(
    (candidate) => candidate.registration === registration
  )!.stageId;
}

function migrateSavedCoordinates(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };

  for (const [key, capture] of Object.entries(input)) {
    const prefix = OLD_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (!prefix) continue;

    const stepId = key.slice(prefix.length);

    for (const registration of destinationRegistrations(stepId)) {
      const newKey = `shared:${stageIdFor(registration)}:${stepId}`;
      if (!next[newKey]) next[newKey] = capture;
    }

    delete next[key];
  }

  return next;
}

function openUploadDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE, { keyPath: "registration" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local upload storage."));
  });
}

async function readIndexedUploads(): Promise<UploadedPages> {
  const database = await openUploadDatabase();

  try {
    return await new Promise<UploadedPages>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).getAll();

      request.onsuccess = () => {
        const records = request.result as UploadedPageRecord[];
        resolve(
          Object.fromEntries(
            records.map(({ registration, ...page }) => [registration, page])
          ) as UploadedPages
        );
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not read local form uploads."));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedUpload(
  registration: PageOneRegistration,
  page: UploadedPage
) {
  const database = await openUploadDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put({ registration, ...page });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save the local form upload."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Saving the local form upload was aborted."));
    });
  } finally {
    database.close();
  }
}

async function deleteIndexedUpload(registration: PageOneRegistration) {
  const database = await openUploadDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).delete(registration);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not remove the local form upload."));
    });
  } finally {
    database.close();
  }
}

function readLegacyUploads(): UploadedPages {
  try {
    const value = window.localStorage.getItem(LEGACY_UPLOAD_STORAGE_KEY);
    return value ? (JSON.parse(value) as UploadedPages) : {};
  } catch {
    window.localStorage.removeItem(LEGACY_UPLOAD_STORAGE_KEY);
    return {};
  }
}

async function loadStoredUploads(): Promise<UploadedPages> {
  let indexed: UploadedPages = {};

  try {
    indexed = await readIndexedUploads();
  } catch {
    // The upload still works for the current session if IndexedDB is blocked.
  }

  const legacy = readLegacyUploads();
  const merged = { ...legacy, ...indexed };

  for (const [registration, page] of Object.entries(legacy) as Array<
    [PageOneRegistration, UploadedPage]
  >) {
    if (!indexed[registration]) {
      try {
        await writeIndexedUpload(registration, page);
      } catch {
        // Keep the legacy value available for this session.
      }
    }
  }

  if (Object.keys(legacy).length) {
    window.localStorage.removeItem(LEGACY_UPLOAD_STORAGE_KEY);
  }

  return merged;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be opened."));
    image.src = url;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement) {
  let quality = 0.9;
  let dataUrl = canvas.toDataURL("image/webp", quality);

  while (dataUrl.length > 3_500_000 && quality > 0.5) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/webp", quality);
  }

  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/png");
  }

  return dataUrl;
}

function normalizeCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
) {
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) throw new Error("The browser did not provide a canvas context.");

  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function renderPdfFirstPage(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.4 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) throw new Error("The browser did not provide a canvas context.");

    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return normalizeCanvas(canvas, canvas.width, canvas.height);
  } finally {
    await pdf.destroy();
  }
}

async function renderImageFile(file: File) {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    return normalizeCanvas(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileToUploadedPage(file: File): Promise<UploadedPage> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const canvas = isPdf
    ? await renderPdfFirstPage(file)
    : await renderImageFile(file);

  return {
    dataUrl: canvasToWebp(canvas),
    fileName: file.name,
    width: canvas.width,
    height: canvas.height,
    savedAt: new Date().toISOString(),
  };
}

function activeStageButton(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("nav button")).find(
    (button) => button.className.includes("bg-zinc-950")
  );
}

function currentPageOneRegistration(root: HTMLElement) {
  const activeText = activeStageButton(root)?.textContent ?? "";

  return PAGE_ONE_CONFIG.find(({ registration }) => {
    const shortRegistration = registration.replace("CS-", "");
    return (
      activeText.includes(registration) ||
      activeText.includes(`${shortRegistration} M&B`)
    );
  })?.registration;
}

function placeholderDataUrl(
  registration: PageOneRegistration,
  maxMassKg: 1180 | 1230
) {
  const lineOne = `Upload Form page 1 for ${registration}`;
  const lineTwo = `Applicable maximum-mass graph: ${maxMassKg} kg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1191" height="1684" viewBox="0 0 1191 1684"><rect width="1191" height="1684" fill="white"/><rect x="35" y="35" width="1121" height="1614" rx="22" fill="none" stroke="#94a3b8" stroke-width="4" stroke-dasharray="16 12"/><text x="595.5" y="790" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#0f172a">${lineOne}</text><text x="595.5" y="850" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#0369a1">${lineTwo}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function applyUploadedPage(root: HTMLElement, uploads: UploadedPages) {
  const image = root.querySelector<HTMLImageElement>(
    "img[alt='P2006T form page 1']"
  );
  const registration = currentPageOneRegistration(root);

  if (!image || !registration) return;

  const config = PAGE_ONE_CONFIG.find(
    (candidate) => candidate.registration === registration
  )!;
  const uploaded = uploads[registration];
  const desiredSource =
    uploaded?.dataUrl ?? placeholderDataUrl(registration, config.maxMassKg);
  const surface = image.parentElement;

  image.removeAttribute("srcset");
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "auto";
  image.style.opacity = "1";
  image.style.visibility = "visible";
  image.style.objectFit = "contain";

  if (surface) {
    const width = uploaded?.width ?? 1191;
    const height = uploaded?.height ?? 1684;
    surface.style.aspectRatio = `${width} / ${height}`;
    surface.style.minHeight = "480px";
    surface.style.background = "white";
  }

  if (image.getAttribute("src") !== desiredSource) {
    image.setAttribute("src", desiredSource);
  }
}

function repairRegistrationUi(root: HTMLElement) {
  const registration = currentPageOneRegistration(root);
  if (!registration) return;

  const config = PAGE_ONE_CONFIG.find(
    (candidate) => candidate.registration === registration
  )!;

  for (const badge of Array.from(root.querySelectorAll<HTMLSpanElement>("span"))) {
    if (badge.textContent?.includes("Shared form geometry")) {
      badge.textContent = `${registration} · aircraft-specific M&B · ${config.maxMassKg} kg limit`;
    }
  }
}

export function P2006TSourceMapper() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [uploads, setUploads] = useState<UploadedPages>({});
  const [busyRegistration, setBusyRegistration] =
    useState<PageOneRegistration | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      if (window.localStorage.getItem(MIGRATION_KEY) !== "1") {
        const saved = window.localStorage.getItem(CAPTURE_STORAGE_KEY);

        if (saved) {
          try {
            const parsed = JSON.parse(saved) as CaptureStore;
            window.localStorage.setItem(
              CAPTURE_STORAGE_KEY,
              JSON.stringify(migrateSavedCoordinates(parsed))
            );
          } catch {
            window.localStorage.removeItem(CAPTURE_STORAGE_KEY);
          }
        }

        window.localStorage.setItem(MIGRATION_KEY, "1");
      }

      const stored = await loadStoredUploads();
      if (!cancelled) {
        setUploads(stored);
        setReady(true);
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;

    const apply = () => {
      applyUploadedPage(root, uploads);
      repairRegistrationUi(root);
    };

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const interval = window.setInterval(apply, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [ready, uploads]);

  async function handleUpload(
    registration: PageOneRegistration,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusyRegistration(registration);
    setMessage(`Preparing Form page 1 for ${registration}…`);

    try {
      const uploaded = await fileToUploadedPage(file);
      const next = { ...uploads, [registration]: uploaded };
      setUploads(next);

      try {
        await writeIndexedUpload(registration, uploaded);
        setMessage(
          `${registration}: page loaded and stored locally in this browser.`
        );
      } catch {
        setMessage(
          `${registration}: page loaded for this session. The browser blocked permanent local storage.`
        );
      }
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? `${registration}: ${reason.message}`
          : `${registration}: the file could not be prepared.`
      );
    } finally {
      setBusyRegistration(null);
    }
  }

  async function removeUpload(registration: PageOneRegistration) {
    const next = { ...uploads };
    delete next[registration];
    setUploads(next);

    try {
      await deleteIndexedUpload(registration);
    } catch {
      // It is still removed for the current session.
    }

    setMessage(`${registration}: local page removed.`);
  }

  async function copyUpload(
    from: PageOneRegistration,
    to: PageOneRegistration
  ) {
    const source = uploads[from];
    if (!source) return;

    const copied = {
      ...source,
      fileName: `${source.fileName} · copied from ${from}`,
      savedAt: new Date().toISOString(),
    };
    const next = { ...uploads, [to]: copied };
    setUploads(next);

    try {
      await writeIndexedUpload(to, copied);
    } catch {
      // It remains available for the current session.
    }

    setMessage(`${from}: page copied to ${to}.`);
  }

  const uploadedCount = useMemo(
    () => PAGE_ONE_CONFIG.filter(({ registration }) => uploads[registration]).length,
    [uploads]
  );

  return (
    <div ref={rootRef} className="space-y-5">
      <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
              Local Form page 1 backgrounds
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Upload the original PDF or image for each aircraft
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-700">
              The browser renders the first PDF page locally and places your existing
              coordinates over it. Files are stored in IndexedDB, not sent to the server
              and do not need to be committed to GitHub.
            </p>
          </div>
          <span className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-amber-900">
            {uploadedCount}/3 loaded
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {PAGE_ONE_CONFIG.map(({ registration, maxMassKg }) => {
            const uploaded = uploads[registration];
            const busy = busyRegistration === registration;

            return (
              <article
                key={registration}
                className="rounded-2xl border border-amber-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-950">{registration}</p>
                    <p className="text-sm font-semibold text-sky-700">
                      Applicable maximum mass: {maxMassKg} kg
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      uploaded
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-zinc-100 text-zinc-600",
                    ].join(" ")}
                  >
                    {uploaded ? "Loaded" : "Upload required"}
                  </span>
                </div>

                {uploaded ? (
                  <p className="mt-3 break-all text-xs leading-5 text-zinc-500">
                    {uploaded.fileName}
                  </p>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    Upload the page containing Loading Data and the M&amp;B graph.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">
                    {busy ? "Preparing…" : uploaded ? "Replace file" : "Choose file"}
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      disabled={Boolean(busyRegistration)}
                      onChange={(event) => void handleUpload(registration, event)}
                      className="sr-only"
                    />
                  </label>
                  {uploaded ? (
                    <button
                      type="button"
                      onClick={() => void removeUpload(registration)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      Remove
                    </button>
                  ) : null}
                  {registration === "CS-EBX" && uploaded ? (
                    <button
                      type="button"
                      onClick={() => void copyUpload("CS-EBX", "D-GSEV")}
                      className="rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800"
                    >
                      Use also for D-GSEV
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-4 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700">
          Mass-limit check: CS-EAQ uses 1180 kg. CS-EBX and D-GSEV use 1230 kg.
          Do not copy the EAQ graph to the other aircraft.
        </p>

        {message ? (
          <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-700">
            {message}
          </p>
        ) : null}
      </section>

      {ready ? (
        <BaseMapper />
      ) : (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sm font-semibold text-sky-900">
          Preparing local Form page 1 uploads…
        </div>
      )}
    </div>
  );
}
