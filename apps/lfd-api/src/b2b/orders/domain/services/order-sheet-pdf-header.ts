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
 * Depuis le 2026-10-13 (Hugo, plan `commandes/back-office/tri-depart-et-couleurs.md`,
 * L5) : un trait épais de la couleur de la commande entre « Bon de commande »
 * et son numéro. Sans couleur, l'en-tête est celui d'avant, au point près.
 *
 * @returns l'ordonnée sous le filet de l'en-tête.
 */
export function header(doc: Doc, sheet: ClientSheet, logo: Buffer, color: string | null): number {
  return paperHeader(
    doc,
    {
      title: "BON DE COMMANDE",
      reference: sheet.reference,
      dateLine: `Passée le ${longDate(sheet.placedAt)}`,
      subLine: sheet.requestedFor === null ? null : `Souhaitée le ${longDate(sheet.requestedFor)}`,
    },
    logo,
    color,
  );
}

/**
 * Ce que l'en-tête du papier écrit : le titre et le numéro à gauche, deux
 * lignes cadrées à droite. Le bon de livraison (plan E5a, § 2) prend le même
 * en-tête — même logo, même place — avec ses propres mots.
 */
export interface PaperHead {
  readonly title: string;
  readonly reference: string;
  readonly dateLine: string;
  readonly subLine: string | null;
}

/** L'en-tête, quels que soient ses mots. @returns l'ordonnée sous son filet. */
export function paperHeader(doc: Doc, head: PaperHead, logo: Buffer, color: string | null): number {
  const top = MARGIN_Y;
  doc.image(logo, CONTENT_LEFT, top, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const titleX = CONTENT_LEFT + LOGO_SIZE + 5 * MM;
  const y = top + 3 * MM;
  put(doc, head.title, titleX, y, { size: TITLE_SIZE, bold: true });
  putRight(doc, head.dateLine, CONTENT_RIGHT, y + 3, 10);
  const referenceY = y + (color === null ? REFERENCE_OFFSET : REFERENCE_OFFSET_UNDER_RULE);
  if (color !== null) {
    const width = doc.font(BOLD).fontSize(TITLE_SIZE).widthOfString(head.title);
    fillBox(doc, { x: titleX, y: y + COLOR_RULE_TOP, width, height: COLOR_RULE_HEIGHT }, color);
  }
  put(doc, head.reference, titleX, referenceY, { size: 13, bold: true });
  if (head.subLine !== null) {
    putRight(doc, head.subLine, CONTENT_RIGHT, referenceY, 10);
  }
  const bottom = top + LOGO_SIZE + 2 * MM;
  rule(doc, bottom, 2);
  return bottom + 2;
}
