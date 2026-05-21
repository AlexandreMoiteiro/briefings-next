"use client";

import { useMemo, useState } from "react";
import { PDFDocument } from "pdf-lib";

type PDFDocumentProxy = any;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
      return pdfjs;
    });
  }

  return pdfjsPromise;
}

type Mode = "normal" | "dual" | "arrange";
type OutputFormat = "PNG" | "JPG";
type AlignBy = "height" | "width";
type BgLabel = "Branco" | "Cinza claro" | "Preto";

type Options = {
  dpi: number;
  fmt: OutputFormat;
  alignBy: AlignBy;
  gapPx: number;
  bgLabel: BgLabel;
  sharpen: boolean;
  duplex: boolean;
  cropMarks: boolean;
  cropW: number;
  cropH: number;
  cropMarkLen: number;
  imgScale: number;
  leftOffsetX: number;
  leftOffsetY: number;
  rightOffsetX: number;
  rightOffsetY: number;
  previewWidth: number;
};

type ResultItem = {
  name: string;
  ext: string;
  mime: string;
  blob: Blob;
  pages: number | null;
  pairs: number;
  previews: string[];
  overflow: boolean;
};

type ArrangePage = {
  index: number;
  thumb: string;
};

type Pair = [number, number | null];

const bgMap: Record<BgLabel, string> = {
  Branco: "#ffffff",
  "Cinza claro": "#f0f2f5",
  Preto: "#000000",
};

const modes: Array<{ id: Mode; title: string; description: string }> = [
  {
    id: "normal",
    title: "Modo normal",
    description: "Pares automáticos: 1+2, 3+4, 5+6...",
  },
  {
    id: "dual",
    title: "Modo dual",
    description: "1.ª página de dois PDFs lado-a-lado.",
  },
  {
    id: "arrange",
    title: "Modo arranjo",
    description: "Define manualmente os pares antes de gerar.",
  },
];

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function blobFromCanvas(canvas: HTMLCanvasElement, fmt: OutputFormat) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Não consegui exportar imagem."));
          return;
        }

        resolve(blob);
      },
      fmt === "PNG" ? "image/png" : "image/jpeg",
      fmt === "PNG" ? undefined : 0.97
    );
  });
}

function canvasPreview(canvas: HTMLCanvasElement, maxWidth: number) {
  const preview = document.createElement("canvas");
  const scale = Math.min(1, maxWidth / canvas.width);

  preview.width = Math.max(1, Math.round(canvas.width * scale));
  preview.height = Math.max(1, Math.round(canvas.height * scale));

  const ctx = preview.getContext("2d");

  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.drawImage(canvas, 0, 0, preview.width, preview.height);

  return preview.toDataURL("image/png");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function cmToPx(cm: number, dpi: number) {
  return Math.round((cm * dpi) / 2.54);
}

function mmToPx(mm: number, dpi: number) {
  return Math.round((mm * dpi) / 25.4);
}

function resizeCanvasToHeight(canvas: HTMLCanvasElement, targetHeight: number) {
  if (canvas.height === targetHeight) return canvas;

  const out = document.createElement("canvas");
  const width = Math.round((canvas.width * targetHeight) / canvas.height);

  out.width = width;
  out.height = targetHeight;

  const ctx = out.getContext("2d");

  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, width, targetHeight);

  return out;
}

function resizeCanvasToWidth(canvas: HTMLCanvasElement, targetWidth: number) {
  if (canvas.width === targetWidth) return canvas;

  const out = document.createElement("canvas");
  const height = Math.round((canvas.height * targetWidth) / canvas.width);

  out.width = targetWidth;
  out.height = height;

  const ctx = out.getContext("2d");

  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, targetWidth, height);

  return out;
}

function mergeSideBySide(
  leftRaw: HTMLCanvasElement,
  rightRaw: HTMLCanvasElement,
  opts: Options
) {
  let left = leftRaw;
  let right = rightRaw;

  if (opts.alignBy === "width") {
    const targetWidth = Math.max(left.width, right.width);
    left = resizeCanvasToWidth(left, targetWidth);
    right = resizeCanvasToWidth(right, targetWidth);

    const height = Math.max(left.height, right.height);
    const out = document.createElement("canvas");

    out.width = targetWidth * 2 + opts.gapPx;
    out.height = height;

    const ctx = out.getContext("2d");

    if (!ctx) throw new Error("Canvas indisponível.");

    ctx.fillStyle = bgMap[opts.bgLabel];
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(left, 0, Math.round((height - left.height) / 2));
    ctx.drawImage(
      right,
      targetWidth + opts.gapPx,
      Math.round((height - right.height) / 2)
    );

    return out;
  }

  const targetHeight = Math.max(left.height, right.height);
  left = resizeCanvasToHeight(left, targetHeight);
  right = resizeCanvasToHeight(right, targetHeight);

  const out = document.createElement("canvas");
  out.width = left.width + right.width + opts.gapPx;
  out.height = targetHeight;

  const ctx = out.getContext("2d");

  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.fillStyle = bgMap[opts.bgLabel];
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(left, 0, 0);
  ctx.drawImage(right, left.width + opts.gapPx, 0);

  return out;
}

function drawCropMarks(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lenPx: number
) {
  const t = 3;
  const seg = Math.max(lenPx * 2, 12);

  function h(xa: number, xb: number, y: number) {
    ctx.fillRect(Math.min(xa, xb), y - t / 2, Math.abs(xb - xa), t);
  }

  function v(x: number, ya: number, yb: number) {
    ctx.fillRect(x - t / 2, Math.min(ya, yb), t, Math.abs(yb - ya));
  }

  h(x1, x1 + seg, y1);
  v(x1, y1, y1 + seg);

  h(x2 - seg, x2, y1);
  v(x2, y1, y1 + seg);

  h(x1, x1 + seg, y2);
  v(x1, y2 - seg, y2);

  h(x2 - seg, x2, y2);
  v(x2, y2 - seg, y2);

  const cx = Math.round((x1 + x2) / 2);
  const cy = Math.round((y1 + y2) / 2);
  const mid = Math.max(Math.round(seg * 0.8), 10);

  h(cx - mid / 2, cx + mid / 2, y1);
  h(cx - mid / 2, cx + mid / 2, y2);
  v(x1, cy - mid / 2, cy + mid / 2);
  v(x2, cy - mid / 2, cy + mid / 2);
}

function pasteClipped(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  clip: { x: number; y: number; width: number; height: number }
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.width, clip.height);
  ctx.clip();
  ctx.drawImage(src, x, y);
  ctx.restore();
}

function fitTwoCardsOnA4(
  left: HTMLCanvasElement,
  right: HTMLCanvasElement,
  opts: Options
) {
  const dpi = opts.dpi;
  const a4W = cmToPx(29.7, dpi);
  const a4H = cmToPx(21.0, dpi);
  const halfW = Math.floor(a4W / 2);
  const cardW = cmToPx(opts.cropW, dpi);
  const cardH = cmToPx(opts.cropH, dpi);
  const markLen = cmToPx(opts.cropMarkLen, dpi);

  const canvas = document.createElement("canvas");
  canvas.width = a4W;
  canvas.height = a4H;

  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas indisponível.");

  const context = ctx;

  context.fillStyle = bgMap[opts.bgLabel];
  context.fillRect(0, 0, canvas.width, canvas.height);

  function place(
    img: HTMLCanvasElement,
    halfStart: number,
    offsetXmm: number,
    offsetYmm: number
  ) {
    const targetW = Math.max(1, Math.round(halfW * opts.imgScale));
    const targetH = Math.max(1, Math.round(a4H * opts.imgScale));
    const ratio = img.width / img.height;
    const targetRatio = targetW / targetH;

    let w = targetW;
    let h = targetH;

    if (ratio > targetRatio) {
      h = Math.round(targetW / ratio);
    } else {
      w = Math.round(targetH * ratio);
    }

    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;

    const tmpCtx = tmp.getContext("2d");

    if (!tmpCtx) throw new Error("Canvas indisponível.");

    tmpCtx.imageSmoothingQuality = "high";
    tmpCtx.drawImage(img, 0, 0, w, h);

    const x = halfStart + Math.round((halfW - w) / 2) + mmToPx(offsetXmm, dpi);
    const y = Math.round((a4H - h) / 2) + mmToPx(offsetYmm, dpi);

    pasteClipped(context, tmp, x, y, {
      x: halfStart,
      y: 0,
      width: halfW,
      height: a4H,
    });
  }

  place(left, 0, opts.leftOffsetX, opts.leftOffsetY);
  place(right, halfW, opts.rightOffsetX, opts.rightOffsetY);

  const marginX = Math.round((halfW - cardW) / 2);
  const marginY = Math.round((a4H - cardH) / 2);
  const overflow =
    marginX < 0 ||
    marginY < 0 ||
    marginX + cardW > halfW ||
    marginY + cardH > a4H;

  context.fillStyle = "#000000";

  for (const halfStart of [0, halfW]) {
    const x1 = halfStart + marginX;
    const y1 = marginY;
    drawCropMarks(context, x1, y1, x1 + cardW, y1 + cardH, markLen);
  }

  return { canvas, overflow };
}

async function canvasesToPdfBlob(canvases: HTMLCanvasElement[], dpi: number) {
  const pdf = await PDFDocument.create();

  for (const canvas of canvases) {
    const pngBlob = await blobFromCanvas(canvas, "PNG");
    const bytes = await pngBlob.arrayBuffer();
    const img = await pdf.embedPng(bytes);

    const page = pdf.addPage([
      (canvas.width * 72) / dpi,
      (canvas.height * 72) / dpi,
    ]);

    page.drawImage(img, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
  }

  const bytes = await pdf.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return new Blob([buffer], { type: "application/pdf" });
}

async function openPdf(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const { getDocument } = await getPdfJs();
  const loadingTask = getDocument({ data });
  return loadingTask.promise;
}

async function renderPage(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  opts: Options
) {
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: opts.dpi / 72 });

  const raw = document.createElement("canvas");
  raw.width = Math.ceil(viewport.width);
  raw.height = Math.ceil(viewport.height);

  const rawCtx = raw.getContext("2d");

  if (!rawCtx) throw new Error("Canvas indisponível.");

  await page.render({
    canvas: raw,
    canvasContext: rawCtx,
    viewport,
  }).promise;

  const out = document.createElement("canvas");
  out.width = raw.width;
  out.height = raw.height;

  const ctx = out.getContext("2d");

  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.fillStyle = bgMap[opts.bgLabel];
  ctx.fillRect(0, 0, out.width, out.height);

  if (opts.sharpen) {
    ctx.filter = "contrast(1.06) saturate(1.02)";
  }

  ctx.drawImage(raw, 0, 0);
  ctx.filter = "none";

  return out;
}

function blankLike(ref: HTMLCanvasElement, opts: Options) {
  const canvas = document.createElement("canvas");
  canvas.width = ref.width;
  canvas.height = ref.height;

  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.fillStyle = bgMap[opts.bgLabel];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

function combinePairs(
  lefts: HTMLCanvasElement[],
  rights: HTMLCanvasElement[],
  opts: Options
) {
  const merged: HTMLCanvasElement[] = [];
  let overflow = false;

  function merge(left: HTMLCanvasElement, right: HTMLCanvasElement) {
    if (!opts.cropMarks) {
      return mergeSideBySide(left, right, opts);
    }

    const result = fitTwoCardsOnA4(left, right, opts);
    overflow = overflow || result.overflow;
    return result.canvas;
  }

  if (!opts.duplex) {
    for (let i = 0; i < lefts.length; i += 1) {
      merged.push(merge(lefts[i], rights[i]));
    }

    return { merged, overflow };
  }

  for (let i = 0; i < lefts.length; i += 2) {
    const aFront = lefts[i];
    const aBack = rights[i];
    const bFront = lefts[i + 1] ?? blankLike(aFront, opts);
    const bBack = rights[i + 1] ?? blankLike(aBack, opts);

    merged.push(merge(aFront, bFront));
    merged.push(merge(bBack, aBack));
  }

  return { merged, overflow };
}

async function buildOutput(
  merged: HTMLCanvasElement[],
  opts: Options,
  base: string,
  forcedPdf = false
): Promise<ResultItem> {
  const previews = merged.map((canvas) =>
    canvasPreview(canvas, opts.previewWidth)
  );

  if (merged.length === 1 && !forcedPdf) {
    const blob = await blobFromCanvas(merged[0], opts.fmt);
    const ext = opts.fmt === "PNG" ? "png" : "jpg";

    return {
      name: `${base}.${ext}`,
      ext,
      mime: blob.type,
      blob,
      pages: null,
      pairs: 1,
      previews,
      overflow: false,
    };
  }

  const blob = await canvasesToPdfBlob(merged, opts.dpi);

  return {
    name: `${base}.pdf`,
    ext: "pdf",
    mime: "application/pdf",
    blob,
    pages: null,
    pairs: merged.length,
    previews,
    overflow: false,
  };
}

async function processNormalFile(file: File, opts: Options) {
  const pdf = await openPdf(file);
  const lefts: HTMLCanvasElement[] = [];
  const rights: HTMLCanvasElement[] = [];

  for (let index = 0; index < pdf.numPages; index += 2) {
    const left = await renderPage(pdf, index, opts);
    const right =
      index + 1 < pdf.numPages
        ? await renderPage(pdf, index + 1, opts)
        : blankLike(left, opts);

    lefts.push(left);
    rights.push(right);
  }

  const { merged, overflow } = combinePairs(lefts, rights, opts);
  const result = await buildOutput(
    merged,
    opts,
    `${baseName(file.name)}_merged`
  );

  return {
    ...result,
    pages: pdf.numPages,
    pairs: merged.length,
    overflow,
  };
}

async function processDualFiles(fileA: File, fileB: File, opts: Options) {
  const pdfA = await openPdf(fileA);
  const pdfB = await openPdf(fileB);

  const left = await renderPage(pdfA, 0, opts);
  const right = await renderPage(pdfB, 0, opts);
  const merged = opts.cropMarks
    ? [fitTwoCardsOnA4(left, right, opts).canvas]
    : [mergeSideBySide(left, right, opts)];

  const result = await buildOutput(
    merged,
    opts,
    `${baseName(fileA.name)}+${baseName(fileB.name)}`
  );

  return {
    ...result,
    pages: null,
    pairs: 1,
    overflow: opts.cropMarks ? fitTwoCardsOnA4(left, right, opts).overflow : false,
  };
}

async function loadArrangePages(file: File, opts: Options) {
  const pdf = await openPdf(file);
  const pages: ArrangePage[] = [];

  for (let index = 0; index < pdf.numPages; index += 1) {
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 180 / Math.max(page.view[2], page.view[3]) });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Canvas indisponível.");

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    pages.push({
      index,
      thumb: canvas.toDataURL("image/png"),
    });
  }

  const pairs: Pair[] = [];

  for (let i = 0; i < pdf.numPages; i += 2) {
    pairs.push([i, i + 1 < pdf.numPages ? i + 1 : null]);
  }

  return { pdf, pages, pairs };
}

async function processArrangedFile(
  pdf: PDFDocumentProxy,
  pairs: Pair[],
  fileName: string,
  opts: Options
) {
  const lefts: HTMLCanvasElement[] = [];
  const rights: HTMLCanvasElement[] = [];

  for (const [leftIndex, rightIndex] of pairs) {
    const left = await renderPage(pdf, leftIndex, opts);
    const right =
      rightIndex === null ? blankLike(left, opts) : await renderPage(pdf, rightIndex, opts);

    lefts.push(left);
    rights.push(right);
  }

  const { merged, overflow } = combinePairs(lefts, rights, opts);
  const result = await buildOutput(
    merged,
    opts,
    `${baseName(fileName)}_arranjo`
  );

  return {
    ...result,
    pages: pdf.numPages,
    pairs: merged.length,
    overflow,
  };
}

function OptionsPanel({
  opts,
  setOpts,
}: {
  opts: Options;
  setOpts: React.Dispatch<React.SetStateAction<Options>>;
}) {
  function update<K extends keyof Options>(key: K, value: Options[K]) {
    setOpts((current) => ({ ...current, [key]: value }));
  }

  return (
    <aside className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
          Opções
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Equivalente à sidebar do original.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          DPI: {opts.dpi}
        </span>
        <input
          type="range"
          min={72}
          max={600}
          step={50}
          value={opts.dpi}
          onChange={(event) => update("dpi", Number(event.target.value))}
          className="w-full"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Formato
          </span>
          <select
            value={opts.fmt}
            onChange={(event) => update("fmt", event.target.value as OutputFormat)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option>PNG</option>
            <option>JPG</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Alinhar
          </span>
          <select
            value={opts.alignBy}
            onChange={(event) => update("alignBy", event.target.value as AlignBy)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option value="height">height</option>
            <option value="width">width</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Espaço entre páginas: {opts.gapPx}px
        </span>
        <input
          type="range"
          min={0}
          max={200}
          step={4}
          value={opts.gapPx}
          onChange={(event) => update("gapPx", Number(event.target.value))}
          className="w-full"
        />
      </label>

      <label className="space-y-1.5 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Fundo
        </span>
        <select
          value={opts.bgLabel}
          onChange={(event) => update("bgLabel", event.target.value as BgLabel)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option>Branco</option>
          <option>Cinza claro</option>
          <option>Preto</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
        Aumentar nitidez
        <input
          type="checkbox"
          checked={opts.sharpen}
          onChange={(event) => update("sharpen", event.target.checked)}
        />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
        Modo frente/verso
        <input
          type="checkbox"
          checked={opts.duplex}
          onChange={(event) => update("duplex", event.target.checked)}
        />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
        Marcas de corte
        <input
          type="checkbox"
          checked={opts.cropMarks}
          onChange={(event) => update("cropMarks", event.target.checked)}
        />
      </label>

      {opts.cropMarks ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Largura cm" value={opts.cropW} onChange={(v) => update("cropW", v)} step={0.1} />
            <NumberField label="Altura cm" value={opts.cropH} onChange={(v) => update("cropH", v)} step={0.1} />
            <NumberField label="Escala" value={opts.imgScale} onChange={(v) => update("imgScale", v)} step={0.01} />
            <NumberField label="Traço cm" value={opts.cropMarkLen} onChange={(v) => update("cropMarkLen", v)} step={0.1} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Left X mm" value={opts.leftOffsetX} onChange={(v) => update("leftOffsetX", v)} step={0.5} />
            <NumberField label="Left Y mm" value={opts.leftOffsetY} onChange={(v) => update("leftOffsetY", v)} step={0.5} />
            <NumberField label="Right X mm" value={opts.rightOffsetX} onChange={(v) => update("rightOffsetX", v)} step={0.5} />
            <NumberField label="Right Y mm" value={opts.rightOffsetY} onChange={(v) => update("rightOffsetY", v)} step={0.5} />
          </div>
        </div>
      ) : null}

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Preview: {opts.previewWidth}px
        </span>
        <input
          type="range"
          min={400}
          max={2000}
          step={100}
          value={opts.previewWidth}
          onChange={(event) => update("previewWidth", Number(event.target.value))}
          className="w-full"
        />
      </label>
    </aside>
  );
}

function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function ResultCard({ result }: { result: ResultItem }) {
  const sizeKb = result.blob.size / 1024;
  const size =
    sizeKb < 1024 ? `${sizeKb.toFixed(0)} KB` : `${(sizeKb / 1024).toFixed(1)} MB`;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-sm text-zinc-500">
            {result.name} · {result.ext.toUpperCase()} · {size}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {result.pages ? `${result.pages} páginas · ` : ""}
            {result.pairs} par(es)
          </p>
          {result.overflow ? (
            <p className="mt-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
              As dimensões de corte parecem exceder a área útil de metade do A4.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => downloadBlob(result.blob, result.name)}
          className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Descarregar
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {result.previews.map((preview, index) => (
          <div key={preview} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
            <img src={preview} alt={`Preview ${index + 1}`} className="w-full rounded-xl" />
            <p className="mt-2 text-center font-mono text-xs text-zinc-500">
              Pág. {index + 1}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PdfToolsClient() {
  const [mode, setMode] = useState<Mode>("normal");
  const [opts, setOpts] = useState<Options>({
    dpi: 300,
    fmt: "PNG",
    alignBy: "height",
    gapPx: 0,
    bgLabel: "Branco",
    sharpen: true,
    duplex: false,
    cropMarks: false,
    cropW: 13.0,
    cropH: 20.5,
    cropMarkLen: 0.4,
    imgScale: 1,
    leftOffsetX: 0,
    leftOffsetY: 0,
    rightOffsetX: 0,
    rightOffsetY: 0,
    previewWidth: 900,
  });

  const [normalFiles, setNormalFiles] = useState<File[]>([]);
  const [dualA, setDualA] = useState<File | null>(null);
  const [dualB, setDualB] = useState<File | null>(null);
  const [arrangeFile, setArrangeFile] = useState<File | null>(null);
  const [arrangePdf, setArrangePdf] = useState<PDFDocumentProxy | null>(null);
  const [arrangePages, setArrangePages] = useState<ArrangePage[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [dragPage, setDragPage] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);

  const selectedMode = useMemo(
    () => modes.find((item) => item.id === mode) ?? modes[0],
    [mode]
  );

  function resetOutput() {
    setStatus("");
    setResults([]);
  }

  async function runNormal() {
    if (!normalFiles.length) return;

    setBusy(true);
    resetOutput();

    try {
      const out: ResultItem[] = [];

      for (const file of normalFiles) {
        out.push(await processNormalFile(file, opts));
      }

      setResults(out);
      setStatus("Ficheiros processados.");
    } catch (error) {
      console.error(error);
      setStatus("Não consegui processar os PDFs.");
    } finally {
      setBusy(false);
    }
  }

  async function runDual() {
    if (!dualA || !dualB) return;

    setBusy(true);
    resetOutput();

    try {
      const result = await processDualFiles(dualA, dualB, opts);
      setResults([result]);
      setStatus("PDFs processados.");
    } catch (error) {
      console.error(error);
      setStatus("Não consegui processar os PDFs.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareArrange(file: File | null) {
    setArrangeFile(file);
    setArrangePdf(null);
    setArrangePages([]);
    setPairs([]);
    resetOutput();

    if (!file) return;

    setBusy(true);

    try {
      const loaded = await loadArrangePages(file, opts);
      setArrangePdf(loaded.pdf);
      setArrangePages(loaded.pages);
      setPairs(loaded.pairs);
      setStatus("Páginas carregadas.");
    } catch (error) {
      console.error(error);
      setStatus("Não consegui carregar o PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function runArrange() {
    if (!arrangePdf || !arrangeFile || !pairs.length) return;

    setBusy(true);
    resetOutput();

    try {
      const valid = pairs.filter(([left]) => left >= 0);
      const result = await processArrangedFile(
        arrangePdf,
        valid,
        arrangeFile.name,
        opts
      );
      setResults([result]);
      setStatus("Arranjo processado.");
    } catch (error) {
      console.error(error);
      setStatus("Não consegui gerar o arranjo.");
    } finally {
      setBusy(false);
    }
  }

  function setPairPage(pairIndex: number, side: "L" | "R", pageIndex: number | null) {
    setPairs((current) =>
      current.map((pair, index) => {
        if (index !== pairIndex) return pair;
        return side === "L" ? [pageIndex ?? -1, pair[1]] : [pair[0], pageIndex];
      })
    );
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 pb-6">
        <p className="mb-3 text-sm font-medium text-zinc-500">PDF tools</p>

        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
          PDF Side-by-Side
        </h1>

        <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
          Modo normal, modo dual e modo arranjo, com opções equivalentes à tool original.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <OptionsPanel opts={opts} setOpts={setOpts} />

        <main className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  resetOutput();
                }}
                className={[
                  "rounded-2xl border p-4 text-left transition",
                  mode === item.id
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50",
                ].join(" ")}
              >
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <p
                  className={[
                    "mt-2 text-sm leading-5",
                    mode === item.id ? "text-zinc-300" : "text-zinc-500",
                  ].join(" ")}
                >
                  {item.description}
                </p>
              </button>
            ))}
          </div>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              {selectedMode.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedMode.description}
            </p>

            {mode === "normal" ? (
              <div className="mt-5 space-y-4">
                <input
                  type="file"
                  multiple
                  accept="application/pdf"
                  onChange={(event) =>
                    setNormalFiles(Array.from(event.target.files ?? []))
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />

                <button
                  type="button"
                  onClick={runNormal}
                  disabled={!normalFiles.length || busy}
                  className="rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  {busy ? "A processar..." : "Gerar"}
                </button>
              </div>
            ) : null}

            {mode === "dual" ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      PDF esquerdo (A)
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setDualA(event.target.files?.[0] ?? null)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      PDF direito (B)
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setDualB(event.target.files?.[0] ?? null)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={runDual}
                  disabled={!dualA || !dualB || busy}
                  className="rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  {busy ? "A processar..." : "Gerar"}
                </button>
              </div>
            ) : null}

            {mode === "arrange" ? (
              <div className="mt-5 space-y-5">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => prepareArrange(event.target.files?.[0] ?? null)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />

                {arrangePages.length ? (
                  <>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Páginas disponíveis
                      </p>

                      <div className="flex flex-wrap gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-3">
                        {arrangePages.map((page) => (
                          <button
                            key={page.index}
                            type="button"
                            draggable
                            onDragStart={() => setDragPage(page.index)}
                            className="w-20 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
                          >
                            <img src={page.thumb} alt={`Pág. ${page.index + 1}`} />
                            <span className="block py-1 text-xs text-zinc-500">
                              Pág. {page.index + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Pares
                      </p>

                      <div className="space-y-3">
                        {pairs.map((pair, pairIndex) => (
                          <div
                            key={pairIndex}
                            className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3"
                          >
                            <span className="w-6 text-center text-xs font-semibold text-zinc-400">
                              {pairIndex + 1}
                            </span>

                            {(["L", "R"] as const).map((side) => {
                              const pageIndex = side === "L" ? pair[0] : pair[1];
                              const page =
                                pageIndex === null || pageIndex < 0
                                  ? null
                                  : arrangePages.find((item) => item.index === pageIndex);

                              return (
                                <div
                                  key={side}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() => {
                                    if (dragPage !== null) {
                                      setPairPage(pairIndex, side, dragPage);
                                      setDragPage(null);
                                    }
                                  }}
                                  className="flex h-28 w-24 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 bg-white text-xs text-zinc-400"
                                >
                                  {page ? (
                                    <button
                                      type="button"
                                      onClick={() => setPairPage(pairIndex, side, null)}
                                      className="h-full w-full"
                                    >
                                      <img
                                        src={page.thumb}
                                        alt={`Pág. ${page.index + 1}`}
                                        className="h-24 w-full object-contain"
                                      />
                                      <span className="block text-xs text-zinc-500">
                                        Pág. {page.index + 1}
                                      </span>
                                    </button>
                                  ) : (
                                    <span>{side === "L" ? "Esquerda" : "Direita"}</span>
                                  )}
                                </div>
                              );
                            })}

                            <button
                              type="button"
                              onClick={() =>
                                setPairs((current) =>
                                  current.filter((_, index) => index !== pairIndex)
                                )
                              }
                              className="ml-auto rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-red-50 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setPairs((current) => [...current, [0, null]])}
                          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-50"
                        >
                          ＋ Adicionar par
                        </button>

                        <button
                          type="button"
                          onClick={runArrange}
                          disabled={!pairs.length || busy}
                          className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                        >
                          {busy ? "A processar..." : "Gerar ficheiro"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>

          {status ? (
            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              {status}
            </section>
          ) : null}

          {results.map((result) => (
            <ResultCard key={result.name} result={result} />
          ))}
        </main>
      </section>
    </div>
  );
}
