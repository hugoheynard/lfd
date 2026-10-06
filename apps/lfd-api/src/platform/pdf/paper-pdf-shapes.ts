import { BLACK, BOLD, type Doc, put, REGULAR } from "./paper-pdf-kit.js";

/*
 * **Les formes des papiers** — cadres, aplats, étiquettes, pastilles. Sorties
 * à côté de la trousse le 2026-10-06 quand la feuille de tournée en a eu
 * besoin : génériques, sans métier, et la trousse restait sous sa taille.
 */

/** Un cadre au trait, sans remplissage — une case à cocher, un encadré. */
export function strokeBox(
  doc: Doc,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  lineWidth: number,
  color = BLACK,
): void {
  doc
    .save()
    .lineWidth(lineWidth)
    .strokeColor(color)
    .rect(box.x, box.y, box.width, box.height)
    .stroke()
    .restore();
}

/** Un aplat — un fond d'encadré, un bandeau. */
export function fillBox(
  doc: Doc,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  color: string,
): void {
  doc.save().rect(box.x, box.y, box.width, box.height).fill(color).restore();
  doc.fillColor(BLACK);
}

/** Le texte d'une étiquette encadrée, et ce qui l'entoure. */
export interface TagStyle {
  readonly size: number;
  readonly bold?: boolean;
  readonly lineWidth?: number;
  readonly color?: string;
}

/** La marge intérieure d'une étiquette, en multiples du corps. */
const TAG_PAD_X = 0.45;
const TAG_PAD_Y = 0.3;

/**
 * La place qu'occupe une étiquette encadrée — mesurée AVANT de la poser, pour
 * qu'une rangée d'étiquettes passe à la ligne sans déborder.
 */
export function tagSize(
  doc: Doc,
  text: string,
  style: TagStyle,
): { readonly width: number; readonly height: number } {
  const textWidth = doc
    .font(style.bold === true ? BOLD : REGULAR)
    .fontSize(style.size)
    .widthOfString(text);
  return {
    width: textWidth + 2 * TAG_PAD_X * style.size,
    height: style.size * (1 + 2 * TAG_PAD_Y),
  };
}

/** Une étiquette encadrée posée à `(x, y)` ; rend sa largeur. */
export function drawTag(doc: Doc, text: string, x: number, y: number, style: TagStyle): number {
  const size = tagSize(doc, text, style);
  const color = style.color ?? BLACK;
  strokeBox(doc, { x, y, ...size }, style.lineWidth ?? 1, color);
  put(doc, text, x + TAG_PAD_X * style.size, y + TAG_PAD_Y * style.size + style.size * 0.08, {
    size: style.size,
    bold: style.bold === true,
    color,
  });
  return size.width;
}

/**
 * Une pastille pleine et son libellé en réserve blanche, centrés sur
 * `(cx, cy)` — le rang d'un arrêt, qui se lit de loin.
 */
export function drawDisc(
  doc: Doc,
  label: string,
  center: { readonly x: number; readonly y: number },
  radius: number,
  color = BLACK,
): void {
  const size = label.length > 2 ? radius * 0.85 : radius * 1.1;
  doc.save().circle(center.x, center.y, radius).fill(color).restore();
  const width = doc.font(BOLD).fontSize(size).widthOfString(label);
  put(doc, label, center.x - width / 2, center.y - size * 0.36, {
    size,
    bold: true,
    color: "#FFFFFF",
  });
}
