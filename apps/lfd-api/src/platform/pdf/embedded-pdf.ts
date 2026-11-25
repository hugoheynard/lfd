import { Buffer } from "node:buffer";

import { PDFDocument } from "pdf-lib";

/**
 * **Un PDF venu d'ailleurs, lu et prêt à poser** dans un papier que
 * `pdfkit` dessine — pdfkit écrit, il ne lit pas ; `pdf-lib` lit.
 *
 * Le papier réserve d'abord autant de pages que le PDF en compte (le folio
 * « x/N » les compte toutes, et le cadre y pose son numéro), puis
 * `overlaidPdf` y pose chaque page, réduite pour tenir au-dessus du pied.
 */
export interface ReadablePdf {
  readonly pageCount: number;
  readonly source: PDFDocument;
}

/**
 * Le PDF, ou `null` s'il ne se lit pas : octets abîmés, chiffré, sans page,
 * ou une page dont le contenu ne s'embarque pas. L'essai d'embarquement se
 * fait ici, dans un document jetable, pour que l'échec se sache AVANT de
 * réserver ses pages — jamais une page blanche au milieu du papier.
 */
export async function readablePdfOf(bytes: Uint8Array): Promise<ReadablePdf | null> {
  try {
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = source.getPages();
    if (pages.length === 0) {
      return null;
    }
    const scratch = await PDFDocument.create({ updateMetadata: false });
    await scratch.embedPages(pages);
    return { pageCount: pages.length, source };
  } catch {
    // Le refus de lire EST la réponse : l'appelant imprime « illisible ».
    return null;
  }
}

/** La page `sourcePage` de `source`, à poser sur la page `pageIndex` du papier. */
export interface PdfOverlay {
  readonly pageIndex: number;
  readonly source: PDFDocument;
  readonly sourcePage: number;
}

/**
 * La zone où poser une page étrangère, en points, **depuis le haut** de la
 * feuille comme pdfkit les compte : de `top` à `bottom`, toute la largeur.
 */
export interface OverlayBand {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Pose chaque page étrangère sur la page réservée du papier, réduite (jamais
 * agrandie) pour tenir dans la bande, centrée en largeur, calée en haut.
 * Les métadonnées du papier ne bougent pas : un même tirage rend les mêmes
 * octets.
 */
export async function overlaidPdf(
  paper: Buffer,
  overlays: readonly PdfOverlay[],
  band: OverlayBand,
): Promise<Buffer> {
  if (overlays.length === 0) {
    return paper;
  }
  const target = await PDFDocument.load(paper, { updateMetadata: false });
  for (const overlay of overlays) {
    const page = target.getPage(overlay.pageIndex);
    const sourcePage = overlay.source.getPage(overlay.sourcePage);
    const [embedded] = await target.embedPages([sourcePage]);
    if (embedded === undefined) {
      continue;
    }
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const room = { width: pageWidth, height: band.bottom - band.top };
    const scale = Math.min(1, room.width / embedded.width, room.height / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    page.drawPage(embedded, {
      x: (pageWidth - width) / 2,
      y: pageHeight - band.top - height,
      width,
      height,
    });
  }
  return Buffer.from(await target.save());
}
