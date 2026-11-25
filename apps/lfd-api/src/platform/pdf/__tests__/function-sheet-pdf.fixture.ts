import { Buffer } from "node:buffer";

import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * **Un PDF déposé, fabriqué pour le test** — comme une fiche de fonction
 * exportée d'Excel : `pages` pages, chacune portant `label` et son rang.
 */
export async function depositedPdf(label: string, pages: number): Promise<Buffer> {
  const document = await PDFDocument.create({ updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let page = 1; page <= pages; page += 1) {
    document.addPage([595.28, 841.89]).drawText(`${label} page ${String(page)}`, {
      x: 50,
      y: 780,
      size: 14,
      font,
    });
  }
  return Buffer.from(await document.save());
}

/** Le nombre de pages d'un PDF, lu par `pdf-lib`. */
export async function pageCountOf(pdf: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
}
