import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const FORM_FILENAME =
  "RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf";

export default async function P2006FormFieldsPage() {
  const bytes = await readFile(path.join(process.cwd(), FORM_FILENAME));
  const pdf = await PDFDocument.load(bytes);
  const fields = pdf.getForm().getFields().map((field) => ({
    name: field.getName(),
    type: field.constructor.name,
  }));
  const pages = pdf.getPages().map((page, index) => ({
    page: index + 1,
    size: page.getSize(),
    mediaBox: page.getMediaBox(),
    cropBox: page.getCropBox(),
    rotation: page.getRotation().angle,
  }));

  console.log(
    "P2006T_FORM_INSPECTION",
    JSON.stringify({ fieldCount: fields.length, fields, pages })
  );

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">P2006T form inspection</h1>
      <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-zinc-950 p-4 text-xs text-white">
        {JSON.stringify({ fieldCount: fields.length, fields, pages }, null, 2)}
      </pre>
    </main>
  );
}
