import type { Buffer } from "node:buffer";

import {
  ALLERGEN_MATRIX_WORDING,
  type AllergenMatrixWording,
  type Locale,
} from "@lfd/pim-contracts";

import {
  type Doc,
  MARGIN_Y,
  MM,
  put,
  putRight,
  render,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { fillBox, strokeBox } from "../../../../platform/pdf/paper-pdf-shapes.js";
import type { AllergenMatrix, MatrixFamily, MatrixFilters } from "./allergen-matrix.js";
import {
  drawColumnHeaders,
  drawRow,
  type Grid,
  gridOf,
  rowHeight,
  SHEET_HEIGHT,
  SHEET_LEFT,
  SHEET_RIGHT,
} from "./allergen-matrix-pdf-grid.js";
import { drawPageFoot, FOOT_HEIGHT } from "./allergen-matrix-pdf-foot.js";
import { fill, localDateTime } from "./allergen-matrix-pdf-words.js";

/** Ce que le PDF imprime : la matrice, son périmètre et ses deux dates. */
export interface AllergenMatrixPaper {
  readonly matrix: AllergenMatrix;
  readonly filters: MatrixFilters;
  /** Le nom de la famille filtrée ; `null` = toutes. */
  readonly familyName: string | null;
  readonly generatedAt: Date;
  readonly lastModifiedAt: Date | null;
}

const LOGO_SIZE = 16 * MM;
const FAMILY_BAND = 13;
const BAND_GRAY = "#E2E2E2";
const CONTENT_BOTTOM = SHEET_HEIGHT - MARGIN_Y - FOOT_HEIGHT;

/** Le nom du fichier servi : la langue y est, un PDF par langue (Q4). */
export function allergenMatrixPdfFileName(locale: Locale): string {
  return `matrice-allergenes-${locale}.pdf`;
}

/** Ce que le rendu traîne de page en page. */
interface Sheet {
  readonly doc: Doc;
  readonly paper: AllergenMatrixPaper;
  readonly wording: AllergenMatrixWording;
  readonly grid: Grid;
  y: number;
}

function perimeterLine(paper: AllergenMatrixPaper, wording: AllergenMatrixWording): string {
  const words = wording.document;
  const family =
    paper.familyName === null ? words.allFamilies : fill(words.family, { name: paper.familyName });
  const undeclared = paper.filters.includeUndeclared
    ? words.undeclaredIncluded
    : words.undeclaredExcluded;
  return fill(words.perimeter, {
    value: [words.scopes[paper.filters.scope], family, undeclared].join(" · "),
  });
}

/** La tête de la première page : logo, titre, périmètre, dates. */
function firstHeader(sheet: Sheet, logo: Buffer): void {
  const { doc, paper, wording } = sheet;
  const words = wording.document;
  const top = MARGIN_Y;
  doc.image(logo, SHEET_LEFT, top, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const x = SHEET_LEFT + LOGO_SIZE + 5 * MM;
  put(doc, wording.title, x, top + 4, { size: 14, bold: true });
  put(doc, perimeterLine(paper, wording), x, top + 24, { size: 8.5 });
  putRight(
    doc,
    fill(words.generatedAt, { date: localDateTime(paper.generatedAt, words) }),
    SHEET_RIGHT,
    top + 24,
    8.5,
  );
  if (paper.lastModifiedAt !== null) {
    const date = localDateTime(paper.lastModifiedAt, words);
    putRight(doc, fill(words.lastModifiedAt, { date }), SHEET_RIGHT, top + 35, 8.5);
  }
  sheet.y = top + LOGO_SIZE + 3 * MM;
  if (!paper.matrix.mentionsTranslated) {
    untranslatedNotice(sheet);
  }
}

/** Q4 : une mention manquante s'affiche en français, et le PDF le dit EN TÊTE. */
function untranslatedNotice(sheet: Sheet): void {
  const { doc, wording } = sheet;
  const box = { x: SHEET_LEFT, y: sheet.y, width: SHEET_RIGHT - SHEET_LEFT, height: 16 };
  fillBox(doc, box, "#F0F0F0");
  strokeBox(doc, box, 1);
  put(doc, wording.document.untranslated, SHEET_LEFT + 6, sheet.y + 4.5, { size: 8.5, bold: true });
  sheet.y += box.height + 2 * MM;
}

/** La tête des pages suivantes : le titre seul, la date est au pied. */
function nextPage(sheet: Sheet): void {
  sheet.doc.addPage();
  put(sheet.doc, sheet.wording.title, SHEET_LEFT, MARGIN_Y, { size: 9, bold: true });
  sheet.y = MARGIN_Y + 5 * MM;
  sheet.y = drawColumnHeaders(sheet.doc, sheet.grid, sheet.y, sheet.wording);
}

function familyBand(sheet: Sheet, family: MatrixFamily, continued: boolean): void {
  const { doc } = sheet;
  fillBox(
    doc,
    { x: SHEET_LEFT, y: sheet.y, width: SHEET_RIGHT - SHEET_LEFT, height: FAMILY_BAND },
    BAND_GRAY,
  );
  const name = continued ? `${family.name} ${sheet.wording.document.continued}` : family.name;
  put(doc, name, SHEET_LEFT + 3, sheet.y + 3, { size: 8.5, bold: true });
  sheet.y += FAMILY_BAND;
}

/** Une famille, ligne à ligne ; une page pleine se tourne et redit la famille. */
function drawFamily(sheet: Sheet, family: MatrixFamily): void {
  const heights = family.rows.map((row) => rowHeight(sheet.doc, sheet.grid, row, sheet.wording));
  if (sheet.y + FAMILY_BAND + (heights[0] ?? 0) > CONTENT_BOTTOM) {
    nextPage(sheet);
  }
  familyBand(sheet, family, false);
  family.rows.forEach((row, index) => {
    const height = heights[index] ?? 0;
    if (sheet.y + height > CONTENT_BOTTOM) {
      nextPage(sheet);
      familyBand(sheet, family, true);
    }
    drawRow(sheet.doc, sheet.grid, row, sheet.y, height, index % 2 === 1, sheet.wording);
    sheet.y += height;
  });
}

function drawBody(sheet: Sheet, logo: Buffer): void {
  firstHeader(sheet, logo);
  sheet.y = drawColumnHeaders(sheet.doc, sheet.grid, sheet.y, sheet.wording);
  if (sheet.paper.matrix.families.length === 0) {
    put(sheet.doc, sheet.wording.document.empty, SHEET_LEFT, sheet.y + 4 * MM, {
      size: 10,
      bold: true,
    });
  }
  for (const family of sheet.paper.matrix.families) {
    drawFamily(sheet, family);
  }
}

/**
 * **La matrice des allergènes en PDF** — A4 paysage, ENTIER dans sa langue
 * (plan `documentation/pim/plan-matrice-des-allergenes.md`, lot AM2, Q4).
 *
 * Pure : le logo est passé (port `BrandLogoSource`), l'instant aussi — mêmes
 * entrées, mêmes octets. Les en-têtes de colonnes se répètent à chaque page ;
 * chaque page porte au pied la légende, la date de génération et son folio.
 */
export function renderAllergenMatrixPdf(paper: AllergenMatrixPaper, logo: Buffer): Promise<Buffer> {
  const wording = ALLERGEN_MATRIX_WORDING[paper.filters.locale];
  return render(
    paper.generatedAt,
    wording.title,
    (doc) => {
      const sheet: Sheet = { doc, paper, wording, grid: gridOf(paper.matrix.columns), y: MARGIN_Y };
      drawBody(sheet, logo);
      drawPageFoot(doc, wording, paper.generatedAt);
    },
    true,
    "landscape",
  );
}
