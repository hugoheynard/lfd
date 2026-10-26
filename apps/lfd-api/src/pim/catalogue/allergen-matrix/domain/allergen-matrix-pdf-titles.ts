import { type Doc, put } from "../../../../platform/pdf/paper-pdf-kit.js";
import { SHEET_LEFT, SHEET_RIGHT } from "./allergen-matrix-pdf-grid.js";

/** La place réservée au titre d'une famille, au-dessus de sa table. */
export const FAMILY_TITLE_HEIGHT = 26;
const FAMILY_TITLE_SIZE = 18;

/** Une page de la famille : où son titre s'écrira, une fois le compte connu. */
interface FamilyTitleMark {
  readonly family: number;
  readonly name: string;
  readonly page: number;
  readonly y: number;
}

/**
 * **Les titres de famille** de la matrice (décision de Hugo, 2026-10-26) : le
 * nom EN GROS au-dessus de la table, sur chaque page de la famille, et
 * « Pain (1/2) », « Pain (2/2) » quand elle déborde — rien quand elle tient
 * sur une page, comme les papiers du fournil (`platform/pdf/
 * paper-pages.ts`, vérifié le 2026-10-26).
 *
 * Le compte des pages d'une famille n'est connu qu'une fois tout dessiné : on
 * réserve la place en dessinant, on écrit à la fin (`finish`).
 */
export class FamilyTitles {
  private readonly marks: FamilyTitleMark[] = [];
  private family = 0;

  constructor(private readonly doc: Doc) {}

  /** Ouvre une famille sur la page courante ; rend le `y` sous son titre. */
  open(name: string, y: number): number {
    this.family += 1;
    return this.reserve(name, y);
  }

  /** La famille continue sur une page neuve ; rend le `y` sous son titre. */
  continue(name: string, y: number): number {
    return this.reserve(name, y);
  }

  finish(): void {
    const start = this.doc.bufferedPageRange().start;
    for (const mark of this.marks) {
      this.doc.switchToPage(start + mark.page);
      put(this.doc, `${mark.name}${this.rankOf(mark)}`, SHEET_LEFT, mark.y, {
        size: FAMILY_TITLE_SIZE,
        bold: true,
        width: SHEET_RIGHT - SHEET_LEFT,
      });
    }
  }

  private reserve(name: string, y: number): number {
    const range = this.doc.bufferedPageRange();
    this.marks.push({ family: this.family, name, page: range.count - 1, y });
    return y + FAMILY_TITLE_HEIGHT;
  }

  /** « (2/3) » quand la famille tient sur plusieurs pages ; rien sinon. */
  private rankOf(mark: FamilyTitleMark): string {
    const pages = this.marks.filter((other) => other.family === mark.family);
    if (pages.length < 2) {
      return "";
    }
    return ` (${String(pages.indexOf(mark) + 1)}/${String(pages.length)})`;
  }
}
