import fs from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

async function inspect(path) {
  console.log(`\n=== ${path} ===`);

  const bytes = await fs.readFile(path);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  console.log(`Pages: ${pdfDoc.getPageCount()}`);
  console.log(`Fields: ${fields.length}`);

  for (const [index, field] of fields.entries()) {
    const name = field.getName();
    const type = field.constructor.name;
    console.log(`${String(index + 1).padStart(3, "0")} | ${type} | ${name}`);
  }
}

await inspect("public/legacy/templates/NAVLOG_FORM.pdf");
await inspect("public/legacy/templates/NAVLOG_FORM_1.pdf");
