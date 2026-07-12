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

export async function GET(request: Request) {
  try {
    const filePath = path.join(process.cwd(), FORM_FILENAME);
    const fileInfo = await stat(filePath);
    const range = request.headers.get("range");

    if (!range) {
      const pdf = await readFile(filePath);
      return new Response(pdf, {
        status: 200,
        headers: commonHeaders(pdf.byteLength),
      });
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileInfo.size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const requestedStart = match[1] ? Number(match[1]) : 0;
    const requestedEnd = match[2]
      ? Number(match[2])
      : Math.min(fileInfo.size - 1, requestedStart + 1024 * 1024 - 1);
    const start = Math.max(0, Math.min(requestedStart, fileInfo.size - 1));
    const end = Math.max(start, Math.min(requestedEnd, fileInfo.size - 1));
    const pdf = (await readFile(filePath)).subarray(start, end + 1);

    return new Response(pdf, {
      status: 206,
      headers: {
        ...commonHeaders(pdf.byteLength),
        "Content-Range": `bytes ${start}-${end}/${fileInfo.size}`,
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
