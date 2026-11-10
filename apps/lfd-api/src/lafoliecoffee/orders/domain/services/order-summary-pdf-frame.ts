import type { Buffer } from "node:buffer";

import {
  type Doc,
  LEFT,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  parisDateTime,
  put,
  putRight,
  RIGHT,
  rule,
  WIDTH,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import {
  type OrderSummaryPaper,
  selectionSentence,
  SUMMARY_SCOPE_NOTE,
} from "./order-summary-paper.js";
import { periodSentence } from "./order-summary-period.js";

/**
 * **Le cadre du récapitulatif en PDF** — l'en-tête de la première page et le
 * folio de chaque page. Sorti du rendu pour que la table se relise d'un bloc.
 */

const LOGO_SIZE = 18 * MM;

/** La place réservée au folio en bas de page. */
export const FOOT_SPACE = 10 * MM;

/** La dernière ordonnée utile, au-dessus du folio. */
export const SUMMARY_LIMIT = PAGE_HEIGHT - MARGIN_Y - FOOT_SPACE;

/** Une page neuve si `needed` ne tient plus ; rend l'ordonnée où écrire. */
export function summaryRoom(doc: Doc, y: number, needed: number): number {
  if (y + needed <= SUMMARY_LIMIT) {
    return y;
  }
  doc.addPage();
  return MARGIN_Y;
}

/**
 * Le logo, le titre et « montants à la commande », la société demandeuse, la
 * période s'il y en a une, la sélection, la date de génération et ce que les montants ne sont pas (§6.4).
 *
 * @returns l'ordonnée sous le filet de l'en-tête.
 */
export function drawSummaryHeader(doc: Doc, paper: OrderSummaryPaper, logo: Buffer): number {
  const top = MARGIN_Y;
  doc.image(logo, LEFT, top, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const x = LEFT + LOGO_SIZE + 5 * MM;
  put(doc, "RÉCAPITULATIF DE COMMANDES", x, top + 2 * MM, { size: 16, bold: true });
  put(doc, "Montants à la commande", x, top + 9 * MM, { size: 11 });
  putRight(doc, `Généré le ${parisDateTime(paper.generatedAt)}`, RIGHT, top + 3 * MM, 9);
  let y = top + LOGO_SIZE + 2 * MM;
  rule(doc, y, 2);
  y += 5 * MM;
  put(doc, paper.requesterName, LEFT, y, { size: 13, bold: true });
  y += 6 * MM;
  const period = periodSentence(paper.period);
  if (period !== null) {
    put(doc, period, LEFT, y, { size: 10, bold: true });
    y += 5 * MM;
  }
  put(doc, selectionSentence(paper.summary), LEFT, y, { size: 10 });
  y += 5 * MM;
  put(doc, SUMMARY_SCOPE_NOTE, LEFT, y, { size: 9, width: WIDTH });
  y = doc.y + 3 * MM;
  rule(doc, y, 1);
  return y + 5 * MM;
}

/** Le folio de chaque page, posé une fois le total connu (`bufferPages`). */
export function drawSummaryFolios(doc: Doc, paper: OrderSummaryPaper): void {
  const range = doc.bufferedPageRange();
  const y = PAGE_HEIGHT - MARGIN_Y - 3 * MM;
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    put(doc, `Récapitulatif de commandes — ${paper.requesterName}`, LEFT, y, { size: 8 });
    putRight(doc, `Page ${String(index + 1)}/${String(range.count)}`, RIGHT, y, 8);
  }
}
