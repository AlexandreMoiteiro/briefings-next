import { readFile } from "node:fs/promises";
import path from "node:path";

const FORM_FILENAME =
  "RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), FORM_FILENAME);
    const pdf = await readFile(filePath);

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${FORM_FILENAME}"`,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
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
