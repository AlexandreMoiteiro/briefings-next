import fs from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

async function inspect(path) {
  console.log(`\n=== ${path} ===`);

  const bytes = await fs.readFile(path);
  const pdfDoc = await PDFDocument.load(bytes);
  const pageCount = pdfDoc.getPageCount();

  console.log(`Pages: ${pageCount}`);

  let fields = [];

  try {
    const form = pdfDoc.getForm();
    fields = form.getFields();
  } catch (error) {
    console.log("No AcroForm or unreadable form.");
    return;
  }

  console.log(`Fields: ${fields.length}`);

  for (const [index, field] of fields.entries()) {
    const name = field.getName();
    const type = field.constructor.name;

    let widgets = 0;

    try {
      widgets = field.acroField.getWidgets().length;
    } catch {
      widgets = 0;
    }

    console.log(
      `${String(index + 1).padStart(3, "0")} | ${type.padEnd(18)} | widgets ${String(widgets).padStart(2, "0")} | ${name}`
    );
  }
}

await inspect("public/legacy/templates/RVP.CFI.067.02PiperPA28MBandPerformanceSheet.pdf");
await inspect("public/legacy/templates/TecnamP2008MBPerformanceSheet_MissionX.pdf");
