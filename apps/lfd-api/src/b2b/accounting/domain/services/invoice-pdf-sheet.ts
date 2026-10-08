import { BOLD, type InvoiceDoc, REGULAR } from "./facturx-pdf-document.js";

/**
 * **La feuille de la facture** : géométrie A4 et une plume à curseur qui
 * change de page d'elle-même (E3b). Une facture du mois peut porter des
 * dizaines de lignes : chaque bloc demande sa hauteur avant de se poser, et
 * la feuille ouvre une page plutôt que de laisser `pdfkit` couper un bloc
 * au milieu.
 */

/** A4 en points PostScript, et le millimètre dans lequel la page est pensée. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MM = PAGE_WIDTH / 210;

export const LEFT = 15 * MM;
export const RIGHT = PAGE_WIDTH - 15 * MM;
export const CONTENT_WIDTH = RIGHT - LEFT;
const TOP = 15 * MM;
/** Sous cette ligne, le pied de page : rien du corps n'y descend. */
const BODY_BOTTOM = PAGE_HEIGHT - 22 * MM;
/** La ligne du pied de page. */
export const FOOTER_Y = PAGE_HEIGHT - 15 * MM;

export const INK = "#000000";
export const MUTED = "#555555";
const RULE_COLOR = "#8C8C8C";

export interface TextStyle {
  readonly size: number;
  readonly bold?: boolean;
  readonly color?: string;
  /** Largeur de la colonne : sans elle, le texte tient sur une ligne. */
  readonly width?: number;
  readonly align?: "left" | "center" | "right";
}

/** Une plume qui tient la hauteur courante, et la page. */
export class InvoiceSheet {
  private cursor = TOP;

  constructor(
    readonly doc: InvoiceDoc,
    /** Redessiné en tête de chaque page ouverte par débordement (rappel du numéro). */
    private readonly onNewPage: (sheet: InvoiceSheet) => void,
  ) {}

  get y(): number {
    return this.cursor;
  }

  /** Descend de `points`. */
  advance(points: number): void {
    this.cursor += points;
  }

  /** `height` tient-il encore sous le curseur, sur cette page ? */
  fits(height: number): boolean {
    return this.cursor + height <= BODY_BOTTOM;
  }

  /** Ouvre une page si `height` ne tient plus sous le curseur. */
  ensure(height: number): void {
    if (this.fits(height)) {
      return;
    }
    this.doc.addPage();
    this.cursor = TOP;
    this.onNewPage(this);
  }

  /** Pose un texte à une position absolue ; rend la hauteur qu'il occupe. */
  put(text: string, x: number, y: number, style: TextStyle): number {
    this.styled(style).text(
      text,
      x,
      y,
      style.width === undefined
        ? { lineBreak: false }
        : { width: style.width, align: style.align ?? "left" },
    );
    return this.heightOf(text, style);
  }

  /** La hauteur qu'un texte prendrait dans ce style. */
  heightOf(text: string, style: TextStyle): number {
    const doc = this.styled(style);
    return style.width === undefined
      ? doc.currentLineHeight(true)
      : doc.heightOfString(text, { width: style.width });
  }

  /** La largeur d'un texte sur une ligne. */
  widthOf(text: string, style: TextStyle): number {
    return this.styled(style).widthOfString(text);
  }

  /** Un filet horizontal sur toute la largeur utile, à la hauteur donnée. */
  rule(y: number, thickness = 0.6): void {
    this.doc
      .save()
      .lineWidth(thickness)
      .strokeColor(RULE_COLOR)
      .moveTo(LEFT, y)
      .lineTo(RIGHT, y)
      .stroke()
      .restore();
  }

  private styled(style: TextStyle): InvoiceDoc {
    return this.doc
      .font(style.bold === true ? BOLD : REGULAR)
      .fontSize(style.size)
      .fillColor(style.color ?? INK);
  }
}
