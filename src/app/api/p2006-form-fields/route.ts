import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const FORM_FILENAME =
  "RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bytes = await readFile(path.join(process.cwd(), FORM_FILENAME));
    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();

    const fields = form.getFields().map((field) => ({
      name: field.getName(),
      type: field.constructor.name,
    }));

    return Response.json({
      file: FORM_FILENAME,
      pages: pdf.getPageCount(),
      fieldCount: fields.length,
      fields,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
