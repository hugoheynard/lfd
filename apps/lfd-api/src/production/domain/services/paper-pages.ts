import type { Buffer } from "node:buffer";

import {
  BOLD,
  LEFT,
  MM,
  PAGE_HEIGHT,
  REGULAR,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  put,
  putRight,
  rule,
  type Doc,
} from "../../../platform/pdf/paper-pdf-kit.js";
import { strokeBox } from "../../../platform/pdf/paper-pdf-shapes.js";

/**
 * **Le cadre des papiers du fournil** (Hugo, 2026-10-25 : « très
 * professionnel et lisible ») — sur chaque page, une en-tête avec le logo et
 * le titre de la page, et un pied avec le numéro de page encadré.
 *
 * Le papier est découpé en **sections** — le récapitulatif d'un rayon, la
 * fiche d'une commande, celle d'un réassort. Une section qui déborde porte
 * « (1/2) », « (2/2) » dans son titre ; le compte n'est connu qu'une fois tout
 * dessiné, d'où les en-têtes et les pieds posés à la fin (`finish`), comme
 * l'étaient déjà les pieds « x/N ».
 *
 * Une page **étrangère** (le BL que le commerce dessine) garde son propre
 * en-tête : le cadre n'y pose que le numéro de page.
 */

const LOGO_TOP = 8 * MM;
const LOGO_SIZE = 13 * MM;
const HEADER_RULE = LOGO_TOP + LOGO_SIZE + 2 * MM;
/** Où le contenu d'une page commence, sous l'en-tête. */
export const CONTENT_TOP = HEADER_RULE + 6 * MM;
const FOLIO_WIDTH = 22 * MM;
const FOLIO_HEIGHT = 8.5 * MM;
const FOLIO_TOP = PAGE_HEIGHT - 8 * MM - FOLIO_HEIGHT;
const FOOTER_RULE = FOLIO_TOP - 2.5 * MM;
/** Sous cette hauteur, on tourne la page plutôt que d'écrire sur le pied. */
export const CONTENT_BOTTOM = FOOTER_RULE - 6 * MM;

/** Ce que le cadre écrit sur chaque page, hormis le titre de la section. */
export interface PaperFrame {
  /** Le logo, en octets PNG ou JPEG. */
  readonly logo: Buffer;
  /** Cadré à droite de l'en-tête — le jour du lot. */
  readonly headerRight: string;
  /** À gauche du pied — qui a arrêté, et quand. */
  readonly footerLeft: string;
}

interface PageMark {
  readonly section: number;
  /** `null` : page étrangère, sans en-tête du cadre. */
  readonly title: string | null;
}

/** Les pages d'un papier, rangées par section. Le document doit tamponner ses pages. */
export class PaperPages {
  private readonly marks: PageMark[] = [];
  private section = 0;

  constructor(private readonly doc: Doc) {}

  /** Ouvre une section sur une page neuve (la première page du document sert à la première). */
  open(title: string): number {
    if (this.marks.length > 0) {
      this.doc.addPage();
    }
    this.section += 1;
    this.marks.push({ section: this.section, title });
    return CONTENT_TOP;
  }

  /** Tourne la page s'il ne reste pas `needed` sous `y` ; rend le `y` où écrire. */
  room(y: number, needed: number): number {
    if (y + needed <= CONTENT_BOTTOM) {
      return y;
    }
    const last = this.marks[this.marks.length - 1];
    this.doc.addPage();
    this.marks.push({ section: last?.section ?? 0, title: last?.title ?? null });
    return CONTENT_TOP;
  }

  /** Une page neuve qu'un autre dessine, avec les pages qu'il tourne lui-même. */
  foreign(draw: (doc: Doc) => void): void {
    this.doc.addPage();
    const before = this.count() - 1;
    draw(this.doc);
    this.section += 1;
    for (let index = before; index < this.count(); index++) {
      this.marks.push({ section: this.section, title: null });
    }
  }

  /** Les en-têtes et les pieds, une fois le compte des pages connu. */
  finish(frame: PaperFrame): void {
    const range = this.doc.bufferedPageRange();
    this.marks.forEach((mark, index) => {
      this.doc.switchToPage(range.start + index);
      const folio = `${String(index + 1)}/${String(range.count)}`;
      if (mark.title !== null) {
        drawHeader(this.doc, frame, `${mark.title}${this.rankOf(index)}`);
        rule(this.doc, FOOTER_RULE, 0.6, ROW_GRAY);
        put(this.doc, frame.footerLeft, LEFT, FOLIO_TOP + 2.6 * MM, {
          size: 8.5,
          width: WIDTH - FOLIO_WIDTH - 6 * MM,
        });
      }
      drawFolio(this.doc, folio);
    });
  }

  /** « (2/3) » quand la section tient sur plusieurs pages ; rien sinon. */
  private rankOf(index: number): string {
    const section = this.marks[index]?.section;
    const pages = this.marks
      .map((mark, at) => ({ mark, at }))
      .filter((entry) => entry.mark.section === section);
    if (pages.length < 2) {
      return "";
    }
    const rank = pages.findIndex((entry) => entry.at === index) + 1;
    return ` (${String(rank)}/${String(pages.length)})`;
  }

  private count(): number {
    return this.doc.bufferedPageRange().count;
  }
}

/** Le logo à gauche, le titre de la page à sa droite, le jour cadré à droite. */
function drawHeader(doc: Doc, frame: PaperFrame, title: string): void {
  doc.image(frame.logo, LEFT, LOGO_TOP, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const x = LEFT + LOGO_SIZE + 4 * MM;
  const right = doc.font(REGULAR).fontSize(10).widthOfString(frame.headerRight);
  put(doc, title, x, LOGO_TOP + 4 * MM, {
    size: 14,
    bold: true,
    width: RIGHT - x - right - 6 * MM,
  });
  putRight(doc, frame.headerRight, RIGHT, LOGO_TOP + 5 * MM, 10);
  rule(doc, HEADER_RULE, 1.5);
}

/** Le numéro de page, encadré et en gros : il se lit de loin sur une pile. */
function drawFolio(doc: Doc, folio: string): void {
  const x = RIGHT - FOLIO_WIDTH;
  strokeBox(doc, { x, y: FOLIO_TOP, width: FOLIO_WIDTH, height: FOLIO_HEIGHT }, 1.2);
  const width = doc.font(BOLD).fontSize(13).widthOfString(folio);
  put(doc, folio, x + (FOLIO_WIDTH - width) / 2, FOLIO_TOP + 2.3 * MM, { size: 13, bold: true });
}
