import type { Buffer } from "node:buffer";

import { BLACK, BOLD, type Doc, drawQr, MM, put, REGULAR } from "./paper-pdf-kit.js";
import { fillBox, strokeBox } from "./paper-pdf-shapes.js";

/**
 * **La trousse des étiquettes** — une feuille A6 portrait (105 × 148 mm) par
 * étiquette, son en-tête, des lignes centrées qui se resserrent plutôt que de
 * déborder, un carré de couleur et un QR centré. Aucune règle métier : ce que
 * dit une étiquette appartient au contexte qui la dessine.
 *
 * Née le 2026-10-25 (Hugo : « imprimer l'étiquette devrait donner un beau
 * PDF, là on est sur une capture d'écran »), avec deux lecteurs : l'étiquette
 * de SAC, que dessine le colisage, et celle de BAC, que dessine la livraison.
 * Dans `platform/` pour la raison de la trousse A4 : `packing → delivery` et
 * `delivery → packing` sont fermés, et les deux doivent se ressembler.
 */

export const LABEL_WIDTH = 105 * MM;
export const LABEL_HEIGHT = 148 * MM;
const LABEL_MARGIN = 6 * MM;
export const LABEL_LEFT = LABEL_MARGIN;
export const LABEL_RIGHT = LABEL_WIDTH - LABEL_MARGIN;
export const LABEL_INNER = LABEL_RIGHT - LABEL_LEFT;
/** Le bas utile de l'étiquette, au-dessus de la marge. */
export const LABEL_BOTTOM = LABEL_HEIGHT - LABEL_MARGIN;

const LOGO_SIZE = 11 * MM;
const HEADER_RULE = LABEL_MARGIN + LOGO_SIZE + 2 * MM;
/** Où le corps d'une étiquette commence, sous son en-tête. */
export const LABEL_CONTENT_TOP = HEADER_RULE + 4 * MM;

/** Le pas entre deux corps essayés quand une ligne ne tient pas. */
const SHRINK_STEP = 0.5;

/** Une étiquette par feuille, dans l'ordre : la première feuille sert à la première. */
export function eachLabel<T>(doc: Doc, labels: readonly T[], draw: (label: T) => void): void {
  labels.forEach((label, index) => {
    if (index > 0) {
      doc.addPage();
    }
    draw(label);
  });
}

/**
 * Le logo à gauche, ce qu'est l'étiquette en petites capitales à droite, et
 * un filet dessous — la même tête que les papiers du fournil, en réduit.
 */
export function drawLabelHeader(doc: Doc, logo: Buffer, caption: string): void {
  doc.image(logo, LABEL_LEFT, LABEL_MARGIN, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const text = caption.toUpperCase();
  const width = doc.font(REGULAR).fontSize(8).widthOfString(text, { characterSpacing: 0.8 });
  doc
    .font(REGULAR)
    .fontSize(8)
    .fillColor(BLACK)
    .text(text, LABEL_RIGHT - width, LABEL_MARGIN + LOGO_SIZE / 2 - 3, {
      lineBreak: false,
      characterSpacing: 0.8,
    });
  doc.save().rect(LABEL_LEFT, HEADER_RULE, LABEL_INNER, 1.2).fill(BLACK).restore();
  doc.fillColor(BLACK);
}

/** Le corps auquel `text` tient dans `width`, entre `max` et `min`. */
export function fittedSize(
  doc: Doc,
  text: string,
  style: { readonly max: number; readonly min: number; readonly bold?: boolean },
  width = LABEL_INNER,
): number {
  const font = style.bold === true ? BOLD : REGULAR;
  let size = style.max;
  while (size > style.min && doc.font(font).fontSize(size).widthOfString(text) > width) {
    size -= SHRINK_STEP;
  }
  return size;
}

/**
 * Une ligne centrée, resserrée jusqu'à tenir sur la largeur de l'étiquette ;
 * rend le `y` de la ligne suivante. Au corps minimal, une ligne encore trop
 * longue se coupe en fin plutôt que de sortir de la feuille.
 */
export function putCentered(
  doc: Doc,
  text: string,
  y: number,
  style: { readonly max: number; readonly min: number; readonly bold?: boolean },
): number {
  const size = fittedSize(doc, text, style);
  const bold = style.bold === true;
  const shown = clipped(doc, text, size, bold);
  const width = doc
    .font(bold ? BOLD : REGULAR)
    .fontSize(size)
    .widthOfString(shown);
  put(doc, shown, LABEL_LEFT + (LABEL_INNER - width) / 2, y, { size, bold });
  return y + size * 1.25;
}

/** `text`, coupé en fin d'un « … » s'il dépasse encore la largeur à ce corps. */
function clipped(doc: Doc, text: string, size: number, bold: boolean): string {
  const measure = (candidate: string): number =>
    doc
      .font(bold ? BOLD : REGULAR)
      .fontSize(size)
      .widthOfString(candidate);
  if (measure(text) <= LABEL_INNER) {
    return text;
  }
  let kept = text;
  while (kept.length > 1 && measure(`${kept}…`) > LABEL_INNER) {
    kept = kept.slice(0, -1);
  }
  return `${kept.trimEnd()}…`;
}

/**
 * Un carré de couleur cerclé de noir suivi de son libellé, le tout centré ;
 * sans couleur, le libellé seul — jamais une teinte devinée. Rend le `y`
 * suivant.
 */
export function putSwatchLine(
  doc: Doc,
  color: string | null,
  label: string,
  y: number,
  style: { readonly max: number; readonly min: number },
): number {
  const square = color === null ? 0 : style.max * 0.95;
  const gap = color === null ? 0 : 2 * MM;
  const size = fittedSize(doc, label, { ...style, bold: true }, LABEL_INNER - square - gap);
  const text = doc.font(BOLD).fontSize(size).widthOfString(label);
  const x = LABEL_LEFT + (LABEL_INNER - square - gap - text) / 2;
  if (color !== null) {
    const box = { x, y: y - 0.5, width: square, height: square };
    fillBox(doc, box, color);
    strokeBox(doc, box, 0.8);
  }
  put(doc, label, x + square + gap, y, { size, bold: true });
  return y + Math.max(size, square) * 1.3;
}

/** Un texte encadré, centré — « Sac 2/3 », le code d'un bac. Rend le `y` suivant. */
export function putBoxedCentered(
  doc: Doc,
  text: string,
  y: number,
  style: { readonly size: number; readonly spacing?: number },
): number {
  const spacing = style.spacing ?? 0;
  const width = doc
    .font(BOLD)
    .fontSize(style.size)
    .widthOfString(text, { characterSpacing: spacing });
  const padX = style.size * 0.5;
  const padY = style.size * 0.3;
  const box = {
    x: LABEL_LEFT + (LABEL_INNER - width - 2 * padX) / 2,
    y,
    width: width + 2 * padX,
    height: style.size + 2 * padY,
  };
  strokeBox(doc, box, 1.5);
  doc
    .font(BOLD)
    .fontSize(style.size)
    .fillColor(BLACK)
    .text(text, box.x + padX, y + padY + style.size * 0.08, {
      lineBreak: false,
      characterSpacing: spacing,
    });
  return y + box.height + 2 * MM;
}

/** Le QR centré sur la largeur ; rend le `y` sous lui. */
export function putCenteredQr(doc: Doc, value: string, y: number, size: number): number {
  drawQr(doc, value, LABEL_LEFT + (LABEL_INNER - size) / 2, y, size);
  return y + size + 2 * MM;
}
