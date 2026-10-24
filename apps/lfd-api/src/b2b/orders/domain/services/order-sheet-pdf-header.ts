import type { Buffer } from "node:buffer";

import type { ClientSheet } from "@lfd/contracts";

import {
  BOLD,
  type Doc,
  LEFT as CONTENT_LEFT,
  longDate,
  MARGIN_Y,
  MM,
  put,
  putRight,
  RIGHT as CONTENT_RIGHT,
  rule,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { fillBox } from "../../../../platform/pdf/paper-pdf-shapes.js";

const LOGO_SIZE = 18 * MM;
const TITLE_SIZE = 16;
/** Le trait de couleur : épais, sous le titre, de sa largeur (L5). */
const COLOR_RULE_TOP = 6 * MM;
const COLOR_RULE_HEIGHT = 1.8 * MM;
/** Le numéro descend sous le trait quand il y en a un ; sinon, à sa place d'origine. */
const REFERENCE_OFFSET = 7 * MM;
const REFERENCE_OFFSET_UNDER_RULE = 9 * MM;

/**
 * L'en-tête : le logo à gauche, le titre et la référence à sa droite, les
 * dates cadrées à droite. Le logo dit qui émet — « La Folie Coffee — B2B » et
 * « EXEMPLAIRE CHIFFRÉ » sont retirés (Hugo, 2026-10-09).
 *
 * Depuis le 2026-10-13 (Hugo, plan `commandes/back-office/plan-tri-depart-et-couleurs.md`,
 * L5) : un trait épais de la couleur de la commande entre « Bon de commande »
 * et son numéro. Sans couleur, l'en-tête est celui d'avant, au point près.
 *
 * @returns l'ordonnée sous le filet de l'en-tête.
 */
export function header(doc: Doc, sheet: ClientSheet, logo: Buffer, color: string | null): number {
  const top = MARGIN_Y;
  doc.image(logo, CONTENT_LEFT, top, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const titleX = CONTENT_LEFT + LOGO_SIZE + 5 * MM;
  const y = top + 3 * MM;
  put(doc, "BON DE COMMANDE", titleX, y, { size: TITLE_SIZE, bold: true });
  putRight(doc, `Passée le ${longDate(sheet.placedAt)}`, CONTENT_RIGHT, y + 3, 10);
  const referenceY = y + (color === null ? REFERENCE_OFFSET : REFERENCE_OFFSET_UNDER_RULE);
  if (color !== null) {
    const width = doc.font(BOLD).fontSize(TITLE_SIZE).widthOfString("BON DE COMMANDE");
    fillBox(doc, { x: titleX, y: y + COLOR_RULE_TOP, width, height: COLOR_RULE_HEIGHT }, color);
  }
  put(doc, sheet.reference, titleX, referenceY, { size: 13, bold: true });
  if (sheet.requestedFor !== null) {
    putRight(doc, `Souhaitée le ${longDate(sheet.requestedFor)}`, CONTENT_RIGHT, referenceY, 10);
  }
  const bottom = top + LOGO_SIZE + 2 * MM;
  rule(doc, bottom, 2);
  return bottom + 2;
}
