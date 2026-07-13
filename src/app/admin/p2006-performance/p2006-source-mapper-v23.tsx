"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { P2006TSourceMapper as BaseMapper } from "./p2006-source-mapper-v17";
import type { CaptureStore } from "./p2006-mapper-definitions";

type PageOneRegistration = "CS-EAQ" | "CS-EBX" | "D-GSEV";

type UploadedPage = {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  savedAt: string;
};

type UploadedPages = Partial<Record<PageOneRegistration, UploadedPage>>;

const CAPTURE_STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const UPLOAD_STORAGE_KEY = "briefings_p2006_page_one_uploads_v1";
const MIGRATION_KEY = "briefings_p2006_page_one_per_aircraft_v24";
const OLD_PREFIXES = [
  "shared:form-page-1-fields:",
  "shared:mass-balance-graph:",
] as const;

const PAGE_ONE_CONFIG: Array<{
  registration: PageOneRegistration;
  maxMassKg: 1180 | 1230;
  stageId: string;
}> = [
  {
    registration: "CS-EAQ",
    maxMassKg: 1180,
    stageId: "form-page-1-cs-eaq",
  },
  {
    registration: "CS-EBX",
    maxMassKg: 1230,
    stageId: "form-page-1-cs-ebx",
  },
  {
    registration: "D-GSEV",
    maxMassKg: 1230,
    stageId: "form-page-1-d-gsev",
  },
];

function destinationRegistrations(stepId: string): PageOneRegistration[] {
  if (stepId === "mass-limit-1180") return ["CS-EAQ"];
  if (stepId === "mass-limit-1230") return ["CS-EBX", "D-GSEV"];
  return ["CS-EAQ", "CS-EBX", "D-GSEV"];
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

function loadStoredUploads(): UploadedPages {
  try {
    const value = window.localStorage.getItem(UPLOAD_STORAGE_KEY);
    return value ? (JSON.parse(value) as UploadedPages) : {};
  } catch {
    window.localStorage.removeItem(UPLOAD_STORAGE_KEY);
    return {};
  }
}

function saveStoredUploads(value: UploadedPages) {
  window.localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(value));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A imagem não pôde ser aberta."));
    image.src = url;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement) {
  let quality = 0.9;
  let dataUrl = canvas.toDataURL("image/webp", quality);

  while (dataUrl.length > 2_500_000 && quality > 0.55) {
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
  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) throw new Error("O browser não disponibilizou o canvas.");

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
    const viewport = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) throw new Error("O browser não disponibilizou o canvas.");

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

function currentPageOneRegistration(root: HTMLElement) {
  const text = root.textContent ?? "";
  return PAGE_ONE_CONFIG.find((candidate) =>
    text.includes(
      `${candidate.registration} · Form page 1 · Loading data and Mass & Balance`
    )
  )?.registration;
}

function placeholderDataUrl(registration: PageOneRegistration) {
  const label = encodeURIComponent(
    `Upload the original page 1 for ${registration} above`
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1191" height="1684" viewBox="0 0 1191 1684"><rect width="1191" height="1684" fill="white"/><rect x="35" y="35" width="1121" height="1614" rx="22" fill="none" stroke="#94a3b8" stroke-width="4" stroke-dasharray="16 12"/><text x="595.5" y="820" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#334155">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}

function applyUploadedPage(root: HTMLElement, uploads: UploadedPages) {
  const image = root.querySelector<HTMLImageElement>(
    "img[alt='P2006T form page 1']"
  );
  const registration = currentPageOneRegistration(root);

  if (!image || !registration) return;

  const uploaded = uploads[registration];
  const desiredSource = uploaded?.dataUrl ?? placeholderDataUrl(registration);
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

export function P2006TSourceMapper() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [uploads, setUploads] = useState<UploadedPages>({});
  const [busyRegistration, setBusyRegistration] =
    useState<PageOneRegistration | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
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

    setUploads(loadStoredUploads());
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;

    applyUploadedPage(root, uploads);

    const observer = new MutationObserver(() => {
      applyUploadedPage(root, uploads);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    return () => observer.disconnect();
  }, [ready, uploads]);

  async function handleUpload(
    registration: PageOneRegistration,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusyRegistration(registration);
    setMessage(`A preparar a página 1 de ${registration}…`);

    try {
      const uploaded = await fileToUploadedPage(file);
      const next = { ...uploads, [registration]: uploaded };
      setUploads(next);

      try {
        saveStoredUploads(next);
        setMessage(
          `${registration}: página carregada e guardada neste browser.`
        );
      } catch {
        setMessage(
          `${registration}: página carregada para esta sessão, mas o browser não permitiu guardá-la permanentemente.`
        );
      }
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? `${registration}: ${reason.message}`
          : `${registration}: não foi possível preparar o ficheiro.`
      );
    } finally {
      setBusyRegistration(null);
    }
  }

  function removeUpload(registration: PageOneRegistration) {
    const next = { ...uploads };
    delete next[registration];
    setUploads(next);
    saveStoredUploads(next);
    setMessage(`${registration}: página local removida.`);
  }

  function copyUpload(
    from: PageOneRegistration,
    to: PageOneRegistration
  ) {
    const source = uploads[from];
    if (!source) return;
    const next = {
      ...uploads,
      [to]: {
        ...source,
        fileName: `${source.fileName} · copied from ${from}`,
        savedAt: new Date().toISOString(),
      },
    };
    setUploads(next);
    saveStoredUploads(next);
    setMessage(`${from}: página copiada para ${to}.`);
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
              Local page-one source
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Upload the original page 1 for each aircraft
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-700">
              PDF, PNG, JPEG or WebP. A PDF is rendered locally from its first page.
              The file never needs to be committed to GitHub and is used as the exact
              coordinate background in this browser.
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
                      Maximum-mass graph: {maxMassKg} kg
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
                    {uploaded ? "Loaded" : "Missing"}
                  </span>
                </div>

                {uploaded ? (
                  <p className="mt-3 break-all text-xs leading-5 text-zinc-500">
                    {uploaded.fileName}
                  </p>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    Upload the page containing the loading fields and M&amp;B graph.
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
                      onClick={() => removeUpload(registration)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      Remove
                    </button>
                  ) : null}
                  {registration === "CS-EBX" && uploaded ? (
                    <button
                      type="button"
                      onClick={() => copyUpload("CS-EBX", "D-GSEV")}
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

        {message ? (
          <p className="mt-4 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-700">
            {message}
          </p>
        ) : null}
      </section>

      {ready ? (
        <BaseMapper />
      ) : (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sm font-semibold text-sky-900">
          Preparing the registration-specific page-one mapper…
        </div>
      )}
    </div>
  );
}
