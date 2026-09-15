import { BLACK, box, BOLD, type Doc, MM, put, REGULAR, RULE } from "./mandate-pdf-drawing.js";

/**
 * **La grille du mandat CORE** — colonnes relevées sur le modèle EPC, et les
 * rangées qu'on y pose (ligne pointillée, case à cocher, numéro de zone).
 *
 * Propre à cette mise en page : le mandat interentreprises (`b2b-mandate-pdf.ts`)
 * suit le gabarit DGFiP, qui n'a ni zones numérotées ni lignes pointillées.
 *
 * Le cadre général et ses filets ne sont pas décoratifs : c'est ce quadrillage
 * qui fait qu'un chargé de clientèle reconnaît la fiche au premier coup d'œil et
 * qu'un banquier y retrouve la zone qu'il cite.
 */
export const BOX_LEFT = 10 * MM;
export const BOX_RIGHT = 200 * MM;
export const LABEL_X = 12 * MM;
/** La colonne des astérisques — la norme marque ainsi ce qui est obligatoire. */
const STAR_X = 51 * MM;
export const FIELD_X = 55 * MM;
export const FIELD_RIGHT = 191 * MM;
/** Le numéro de zone, dans la marge intérieure droite. */
const NUM_X = 194 * MM;
/** La colonne « Ville » des lignes qui portent un code postal. */
export const CITY_STAR_X = 112 * MM;
export const CITY_X = 116 * MM;

/** Le pas d'une ligne de zone. Serré : le modèle tient en une page, et doit. */
export const ROW = 8.5 * MM;

/**
 * La **ligne de pointillés** à remplir.
 *
 * Dessinée point par point plutôt qu'avec `dash()` : le tireté de `pdfkit` pose
 * des segments, pas des points ronds, et le formulaire officiel est en points.
 */
export function leader(doc: Doc, x1: number, y: number, x2: number): void {
  doc.save().lineWidth(0.7).strokeColor(BLACK).lineCap("round");
  const step = 1.7 * MM;
  for (let x = x1; x <= x2; x += step) {
    doc.moveTo(x, y).lineTo(x + 0.1, y);
  }
  doc.stroke().restore();
}

/**
 * Un libellé suivi de sa case. Rend l'abscisse de fin de la case.
 *
 * La croix est **dessinée**, pas écrite : un « X » en Helvetica ne remplit pas
 * la case de la même façon selon la police substituée. La case se pose après le
 * texte MESURÉ (`widthOfString`) : à un décalage deviné, elle toucherait la
 * dernière lettre.
 */
export function checkbox(doc: Doc, x: number, y: number, text: string, checked = false): number {
  put(doc, text, x, y, { size: 9.5 });
  const width = doc.font(REGULAR).fontSize(9.5).widthOfString(text);
  const left = x + width + 2 * MM;
  const top = y - 0.5 * MM;
  const side = 3.4 * MM;
  box(doc, left, top, side, side);
  if (checked) {
    const inset = 0.8 * MM;
    doc.save();
    doc.lineWidth(RULE).strokeColor(BLACK);
    doc
      .moveTo(left + inset, top + inset)
      .lineTo(left + side - inset, top + side - inset)
      .moveTo(left + side - inset, top + inset)
      .lineTo(left + inset, top + side - inset)
      .stroke();
    doc.restore();
  }
  return left + side;
}

/** L'astérisque de la norme : ce qui est marqué doit être rempli. */
export function star(doc: Doc, x: number, y: number): void {
  put(doc, "*", x, y + 0.6 * MM, { size: 9 });
}

/**
 * Le numéro de zone, dans la marge intérieure droite, **à hauteur de la ligne**
 * qu'il désigne — décalé, il se lirait comme le numéro de la zone précédente.
 */
export function zone(doc: Doc, value: number, y: number): void {
  put(doc, String(value), NUM_X, y + 2.4 * MM, { size: 8, font: BOLD });
}

/** La légende sous une ligne — « Nom / Prénoms du débiteur ». */
export function caption(doc: Doc, text: string, x: number, y: number): void {
  put(doc, text, x, y, { size: 6.2 });
}

/** Le libellé de la colonne de gauche. */
export function label(doc: Doc, text: string, y: number, size = 9.5): void {
  put(doc, text, LABEL_X, y, { size, width: STAR_X - LABEL_X - 2 * MM });
}

/** Les réglages d'une ligne pointillée — tous facultatifs. */
export interface DottedRowOptions {
  readonly value?: string;
  readonly x?: number;
  readonly right?: number;
  readonly required?: boolean;
}

/**
 * Une zone à **ligne pointillée** : astérisque, pointillés, légende, numéro.
 * `value` la préremplit — c'est ce qui distingue notre bloc de celui du client.
 */
export function dottedRow(
  doc: Doc,
  y: number,
  legend: string,
  zoneNumber: number | null,
  options: DottedRowOptions = {},
): void {
  const x = options.x ?? FIELD_X;
  const value = options.value ?? "";
  if (options.required ?? true) {
    star(doc, x - 4 * MM, y);
  }
  if (value !== "") {
    put(doc, value, x + 1 * MM, y - 0.4 * MM, { size: 9.5, font: BOLD });
  }
  leader(doc, x, y + 4 * MM, options.right ?? FIELD_RIGHT);
  caption(doc, legend, x, y + 4.6 * MM);
  if (zoneNumber !== null) {
    zone(doc, zoneNumber, y);
  }
}
