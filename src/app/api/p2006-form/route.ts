import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const FORM_FILENAME =
  "RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function commonHeaders(size: number) {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${FORM_FILENAME}"`,
    "Accept-Ranges": "bytes",
    "Content-Length": String(size),
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
    "X-Content-Type-Options": "nosniff",
  };
}

function parseRange(range: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return null;

  const rawStart = match[1];
  const rawEnd = match[2];
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const length = Math.min(size, suffixLength);
    return { start: size - length, end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;

  const requestedEnd = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isFinite(requestedEnd) || requestedEnd < start) return null;

  return {
    start,
    end: Math.min(size - 1, requestedEnd),
  };
}

async function loadForm() {
  const filePath = path.join(process.cwd(), FORM_FILENAME);
  const fileInfo = await stat(filePath);
  return { filePath, size: fileInfo.size };
}

export async function HEAD() {
  try {
    const { size } = await loadForm();
    return new Response(null, {
      status: 200,
      headers: commonHeaders(size),
    });
  } catch (error) {
    console.error("Unable to inspect the P2006T form PDF", error);
    return new Response(null, { status: 404 });
  }
}

export async function GET(request: Request) {
  try {
    const { filePath, size } = await loadForm();
    const rangeHeader = request.headers.get("range");

    if (!rangeHeader) {
      const pdf = await readFile(filePath);
      return new Response(pdf, {
        status: 200,
        headers: commonHeaders(pdf.byteLength),
      });
    }

    const range = parseRange(rangeHeader, size);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const pdf = (await readFile(filePath)).subarray(range.start, range.end + 1);

    return new Response(pdf, {
      status: 206,
      headers: {
        ...commonHeaders(pdf.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  } catch (error) {
    console.error("Unable to read the P2006T form PDF", error);

    return Response.json(
      { error: "P2006T form PDF is unavailable." },
      { status: 404 }
    );
  }
}
