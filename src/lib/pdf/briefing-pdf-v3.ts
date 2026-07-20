import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildBriefingPdf as buildBriefingPdfV2 } from "./briefing-pdf-v2";
import {
  getBriefingAircraftOverride,
  getMissionObjectivesPdf,
} from "@/lib/briefing-enhancements-store";

export async function buildBriefingPdf(
  input: Parameters<typeof buildBriefingPdfV2>[0]
) {
  const aircraftOverride = getBriefingAircraftOverride();
  const objectivesPdf = getMissionObjectivesPdf();
  const mission = aircraftOverride?.enabled
    ? {
        ...input.mission,
        aircraftType: aircraftOverride.aircraftType,
        registration: aircraftOverride.registration,
      }
    : input.mission;

  const baseBytes = await buildBriefingPdfV2({ ...input, mission });
  const pdfDoc = await PDFDocument.load(baseBytes);
  const missionPage = pdfDoc.getPageCount() > 1 ? pdfDoc.getPage(1) : null;

  if (missionPage) {
    missionPage.drawRectangle({
      x: 48,
      y: 48,
      width: missionPage.getWidth() - 96,
      height: 52,
      color: rgb(1, 1, 1),
    });
  }

  if (objectivesPdf) {
    const objectivesDoc = await PDFDocument.load(await objectivesPdf.arrayBuffer());
    const copiedPages = await pdfDoc.copyPages(
      objectivesDoc,
      objectivesDoc.getPageIndices()
    );
    copiedPages.forEach((page, index) => {
      pdfDoc.insertPage(2 + index, page);
    });

    if (missionPage) {
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      missionPage.drawText("Mission objectives are included on the following page(s).", {
        x: 60,
        y: 70,
        size: 10,
        font,
        color: rgb(0.34, 0.37, 0.42),
      });
    }
  }

  pdfDoc.setTitle(`Briefing ${mission.registration || "Aircraft"}`);
  return pdfDoc.save();
}
