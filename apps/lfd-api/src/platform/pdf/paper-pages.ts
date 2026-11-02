import type { Buffer } from "node:buffer";

import {
  BLACK,
  BOLD,
  LEFT,
  MARGIN_X,
  MM,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type PageLayout,
  REGULAR,
  ROW_GRAY,
  put,
  putRight,
  type Doc,
} from "./paper-pdf-kit.js";
import { strokeBox } from "./paper-pdf-shapes.js";

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
 *
 * Une section peut être **tournée** au milieu d'un papier en portrait (le
 * calendrier du dossier du jour, 2026-11-02) : la feuille reste un A4
 * PORTRAIT, et son contenu — en-tête et pied compris — est dessiné en paysage
 * puis tourné d'un quart de tour. Hugo, le même jour : une vraie page paysage
 * au milieu d'un PDF portrait fait poser la question du sens à l'impression,
 * et un pilote qui la tranche mal recadre ou réduit la page. Une feuille
 * toujours portrait s'imprime sans question ; on la lit en la tournant.
 */

const LOGO_TOP = 8 * MM;
const LOGO_SIZE = 13 * MM;
const HEADER_RULE = LOGO_TOP + LOGO_SIZE + 2 * MM;
/** Où le contenu d'une page commence, sous l'en-tête. */
export const CONTENT_TOP = HEADER_RULE + 6 * MM;
const FOLIO_WIDTH = 22 * MM;
const FOLIO_HEIGHT = 8.5 * MM;
/** Sous cette hauteur, on tourne la page plutôt que d'écrire sur le pied (portrait). */
export const CONTENT_BOTTOM = contentBottomOf("portrait");

/** La géométrie d'une page selon son sens : le paysage échange largeur et hauteur. */
function pageHeightOf(layout: PageLayout): number {
  return layout === "landscape" ? PAGE_WIDTH : PAGE_HEIGHT;
}

/** Le bord droit du contenu d'une page de ce sens. */
export function contentRightOf(layout: PageLayout): number {
  return (layout === "landscape" ? PAGE_HEIGHT : PAGE_WIDTH) - MARGIN_X;
}

function folioTopOf(layout: PageLayout): number {
  return pageHeightOf(layout) - 8 * MM - FOLIO_HEIGHT;
}

/** Sous cette hauteur, on tourne la page plutôt que d'écrire sur le pied. */
export function contentBottomOf(layout: PageLayout): number {
  return folioTopOf(layout) - 2.5 * MM - 6 * MM;
}

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
  readonly layout: PageLayout;
}

/** Les pages d'un papier, rangées par section. Le document doit tamponner ses pages. */
export class PaperPages {
  private readonly marks: PageMark[] = [];
  private section = 0;

  constructor(private readonly doc: Doc) {}

  /** Le sens du document — celui des sections ouvertes par `open`. */
  private get base(): PageLayout {
    return this.doc.options.layout ?? "portrait";
  }

  /** Ouvre une section sur une page neuve (la première page du document sert à la première). */
  open(title: string): number {
    if (this.marks.length > 0) {
      this.newPage(this.base);
    }
    this.section += 1;
    this.marks.push({ section: this.section, title, layout: this.base });
    return CONTENT_TOP;
  }

  /**
   * Ouvre une section en **paysage**, toujours sur une page neuve. Ses pages
   * suivantes (`room`) restent en paysage ; la section d'après revient au
   * sens du document par `open`.
   */
  openLandscape(title: string): number {
    this.newPage("landscape");
    this.section += 1;
    this.marks.push({ section: this.section, title, layout: "landscape" });
    return CONTENT_TOP;
  }

  /** Le sens de la page courante. */
  get layout(): PageLayout {
    return this.marks[this.marks.length - 1]?.layout ?? this.base;
  }

  /** Tourne la page s'il ne reste pas `needed` sous `y` ; rend le `y` où écrire. */
  room(y: number, needed: number): number {
    const layout = this.layout;
    if (y + needed <= contentBottomOf(layout)) {
      return y;
    }
    const last = this.marks[this.marks.length - 1];
    this.newPage(layout);
    this.marks.push({ section: last?.section ?? 0, title: last?.title ?? null, layout });
    return CONTENT_TOP;
  }

  /** Une page neuve qu'un autre dessine, avec les pages qu'il tourne lui-même. */
  foreign(draw: (doc: Doc) => void): void {
    this.handOver(null, draw);
  }

  /**
   * Une section **titrée** que son propre rendu dessine entre `CONTENT_TOP`
   * et `CONTENT_BOTTOM`, en tournant lui-même ses pages (la feuille de
   * tournée dans le dossier des tournées, 2026-10-26) : le cadre pose
   * l'en-tête, « (1/2) » et le pied sur chacune.
   */
  drawn(title: string, draw: (doc: Doc) => void): void {
    this.handOver(title, draw);
  }

  private handOver(title: string | null, draw: (doc: Doc) => void): void {
    if (this.marks.length > 0) {
      this.newPage(this.base);
    }
    const before = this.count() - 1;
    draw(this.doc);
    this.section += 1;
    for (let index = before; index < this.count(); index++) {
      this.marks.push({ section: this.section, title, layout: this.base });
    }
  }

  /** Les en-têtes et les pieds, une fois le compte des pages connu. */
  finish(frame: PaperFrame): void {
    this.untwist();
    const range = this.doc.bufferedPageRange();
    this.marks.forEach((mark, index) => {
      this.doc.switchToPage(range.start + index);
      const turned = mark.layout === "landscape" && this.base === "portrait";
      if (turned) {
        this.doc.save();
        turn(this.doc);
      }
      const folio = `${String(index + 1)}/${String(range.count)}`;
      const right = contentRightOf(mark.layout);
      const folioTop = folioTopOf(mark.layout);
      if (mark.title !== null) {
        drawHeader(this.doc, frame, `${mark.title}${this.rankOf(index)}`, right);
        ruleAcross(this.doc, folioTop - 2.5 * MM, 0.6, right, ROW_GRAY);
        put(this.doc, frame.footerLeft, LEFT, folioTop + 2.6 * MM, {
          size: 8.5,
          width: right - LEFT - FOLIO_WIDTH - 6 * MM,
        });
      }
      drawFolio(this.doc, folio, right, folioTop);
      if (turned) {
        this.doc.restore();
      }
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

  /** Une page tournée est ouverte : sa rotation est à refermer avant de la quitter. */
  private twisted = false;

  /**
   * Une feuille neuve, toujours du sens du DOCUMENT ; tournée si la section
   * l'est. La rotation de la page quittée est refermée d'abord : `finish`
   * reviendra y poser le cadre, et une matrice laissée ouverte l'y tournerait.
   */
  private newPage(layout: PageLayout): void {
    this.untwist();
    this.doc.addPage(this.doc.options);
    if (layout === "landscape" && this.base === "portrait") {
      this.doc.save();
      turn(this.doc);
      this.twisted = true;
    }
  }

  private untwist(): void {
    if (this.twisted) {
      this.doc.restore();
      this.twisted = false;
    }
  }

  private count(): number {
    return this.doc.bufferedPageRange().count;
  }
}

/**
 * Le quart de tour : un point (x, y) du paysage va en (hauteur − y, x) sur la
 * feuille portrait — le haut du paysage longe le bord droit de la feuille.
 */
function turn(doc: Doc): void {
  doc.transform(0, 1, -1, 0, PAGE_WIDTH, 0);
}

/** Un trait sur toute la largeur du contenu, quel que soit le sens de la page. */
function ruleAcross(doc: Doc, y: number, thickness: number, right: number, color = BLACK): void {
  doc
    .save()
    .rect(LEFT, y, right - LEFT, thickness)
    .fill(color)
    .restore();
  doc.fillColor(BLACK);
}

/** Le logo à gauche, le titre de la page à sa droite, le jour cadré à droite. */
function drawHeader(doc: Doc, frame: PaperFrame, title: string, right: number): void {
  doc.image(frame.logo, LEFT, LOGO_TOP, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const x = LEFT + LOGO_SIZE + 4 * MM;
  const dayWidth = doc.font(REGULAR).fontSize(10).widthOfString(frame.headerRight);
  put(doc, title, x, LOGO_TOP + 4 * MM, {
    size: 14,
    bold: true,
    width: right - x - dayWidth - 6 * MM,
  });
  putRight(doc, frame.headerRight, right, LOGO_TOP + 5 * MM, 10);
  ruleAcross(doc, HEADER_RULE, 1.5, right);
}

/** Le numéro de page, encadré et en gros : il se lit de loin sur une pile. */
function drawFolio(doc: Doc, folio: string, right: number, top: number): void {
  const x = right - FOLIO_WIDTH;
  strokeBox(doc, { x, y: top, width: FOLIO_WIDTH, height: FOLIO_HEIGHT }, 1.2);
  const width = doc.font(BOLD).fontSize(13).widthOfString(folio);
  put(doc, folio, x + (FOLIO_WIDTH - width) / 2, top + 2.3 * MM, { size: 13, bold: true });
}
