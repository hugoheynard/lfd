import { Buffer } from "node:buffer";

import { degrees, PDFDocument, type PDFPage } from "pdf-lib";

/**
 * **Un PDF venu d'ailleurs, lu et prêt à poser** dans un papier que
 * `pdfkit` dessine — pdfkit écrit, il ne lit pas ; `pdf-lib` lit.
 *
 * Le papier réserve d'abord autant de pages que le PDF en compte (le folio
 * « x/N » les compte toutes, et le cadre y pose son numéro), puis
 * `overlaidPdf` y pose chaque page, tournée en portrait si elle est en
 * paysage, puis réduite pour tenir au-dessus du pied.
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

/** Un quart de tour, en degrés. */
const QUARTER_TURN = 90;
const FULL_TURN = 360;

/**
 * Pose chaque page étrangère sur la page réservée du papier. Une page en
 * paysage (telle qu'un lecteur l'affiche, `/Rotate` compris) est **tournée
 * d'un quart de tour** pour occuper la feuille portrait, comme les
 * calendriers du dossier, au lieu d'être réduite à une bande illisible ;
 * elle se lit en tournant la feuille. Puis la page est réduite (jamais
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
    const turn = turnToPortrait(sourcePage, embedded.width, embedded.height);
    const sideways = turn % (2 * QUARTER_TURN) !== 0;
    const footprint = sideways
      ? { width: embedded.height, height: embedded.width }
      : { width: embedded.width, height: embedded.height };
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const room = { width: pageWidth, height: band.bottom - band.top };
    const scale = Math.min(1, room.width / footprint.width, room.height / footprint.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    const left = (pageWidth - footprint.width * scale) / 2;
    const bottom = pageHeight - band.top - footprint.height * scale;
    page.drawPage(embedded, {
      ...anchorFor(turn, left, bottom, width, height),
      width,
      height,
      rotate: degrees(turn),
    });
  }
  return Buffer.from(await target.save());
}

/**
 * L'angle (anti-horaire, multiple de 90) qui rend la page droite comme un
 * lecteur l'affiche — `embedPage` ignore `/Rotate` — puis, si elle est en
 * paysage, d'un quart de tour de plus pour la mettre en portrait.
 */
export function turnToPortrait(sourcePage: PDFPage, width: number, height: number): number {
  const shown = normalized(sourcePage.getRotation().angle);
  const upright = normalized(-shown);
  const shownSideways = shown % (2 * QUARTER_TURN) !== 0;
  const landscape = shownSideways ? height > width : width > height;
  return normalized(upright + (landscape ? QUARTER_TURN : 0));
}

function normalized(angle: number): number {
  const quarter = Math.round(angle / QUARTER_TURN) * QUARTER_TURN;
  return ((quarter % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/**
 * Le point d'ancrage de `drawPage` : pdf-lib tourne autour du coin bas-gauche
 * du dessin, donc l'ancre se décale pour que l'emprise tournée commence en
 * (`left`, `bottom`).
 */
function anchorFor(
  turn: number,
  left: number,
  bottom: number,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  switch (turn) {
    case QUARTER_TURN:
      return { x: left + height, y: bottom };
    case 2 * QUARTER_TURN:
      return { x: left + width, y: bottom + height };
    case 3 * QUARTER_TURN:
      return { x: left, y: bottom + width };
    default:
      return { x: left, y: bottom };
  }
}
