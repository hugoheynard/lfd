import type { Buffer } from "node:buffer";

import {
  type OverlayBand,
  type PdfOverlay,
  type ReadablePdf,
  readablePdfOf,
} from "../../../../platform/pdf/embedded-pdf.js";
import { LEFT, MM, WIDTH, put, type Doc } from "../../../../platform/pdf/paper-pdf-kit.js";
import { CONTENT_BOTTOM, type PaperPages } from "../../../../platform/pdf/paper-pages.js";

/** La hauteur d'une ligne de l'intercalaire. */
const LINE = 7 * MM;

/** Une fiche de fonction déposée, telle que le dossier la reçoit. */
export interface FunctionSheetInput {
  readonly sheetId: string;
  readonly fileName: string;
  readonly bytes: Buffer;
}

/** Les fiches d'un événement du jour, dans l'ordre de leur rang. */
export interface EventSheetsInput {
  readonly eventName: string;
  readonly sheets: readonly FunctionSheetInput[];
}

/** Une fiche lue : son PDF, ou `null` s'il est illisible. */
export interface PreparedFunctionSheet {
  readonly sheetId: string;
  readonly fileName: string;
  readonly pdf: ReadablePdf | null;
}

/** Les fiches d'un événement, lues, prêtes à se poser au dossier. */
export interface PreparedEventSheets {
  readonly eventName: string;
  readonly sheets: readonly PreparedFunctionSheet[];
}

/**
 * Lit chaque fiche AVANT le dessin : le folio « x/N » doit compter leurs
 * pages, et une fiche illisible doit le savoir avant qu'on lui réserve sa
 * place. Un événement sans fiche ne prend pas d'intercalaire.
 */
export async function preparedFunctionSheetsOf(
  events: readonly EventSheetsInput[],
): Promise<readonly PreparedEventSheets[]> {
  const prepared = await Promise.all(
    events.map(async (event) => ({
      eventName: event.eventName,
      sheets: await Promise.all(
        event.sheets.map(async (sheet) => ({
          sheetId: sheet.sheetId,
          fileName: sheet.fileName,
          pdf: await readablePdfOf(sheet.bytes),
        })),
      ),
    })),
  );
  return prepared.filter((event) => event.sheets.length > 0);
}

/** Les identifiants des fiches qu'un dossier imprime, dans l'ordre du papier. */
export function printedSheetIdsOf(events: readonly PreparedEventSheets[]): readonly string[] {
  return events.flatMap((event) => event.sheets.map((sheet) => sheet.sheetId));
}

/**
 * La bande où se pose une page de fiche : sous le bord haut, au-dessus du
 * folio — le cadre ne pose sur ces pages que le numéro, la fiche porte son
 * propre en-tête.
 */
export const FUNCTION_SHEET_BAND: OverlayBand = {
  top: 8 * MM,
  bottom: CONTENT_BOTTOM + 6 * MM,
};

/**
 * Par événement, un intercalaire « Événement : <nom> — fiches de fonction »
 * dans le cadre du dossier, puis les pages de chaque fiche, réservées ici et
 * remplies après le rendu (`overlaidPdf`). Une fiche illisible prend une
 * page titrée qui le dit, à sa place : le dossier sort quand même.
 */
export function drawFunctionSheets(
  doc: Doc,
  pages: PaperPages,
  events: readonly PreparedEventSheets[],
): readonly PdfOverlay[] {
  const overlays: PdfOverlay[] = [];
  for (const event of events) {
    drawDivider(doc, pages, event);
    for (const sheet of event.sheets) {
      const pdf = sheet.pdf;
      if (pdf === null) {
        drawIllegible(doc, pages.open(`Fiche illisible : ${sheet.fileName}`), sheet.fileName);
        continue;
      }
      pages.foreign((drawn) => {
        const first = drawn.bufferedPageRange().count - 1;
        for (let page = 0; page < pdf.pageCount; page += 1) {
          if (page > 0) {
            drawn.addPage(drawn.options);
          }
          overlays.push({ pageIndex: first + page, source: pdf.source, sourcePage: page });
        }
      });
    }
  }
  return overlays;
}

/** L'intercalaire : les fiches qui suivent, dans l'ordre, avec leurs pages. */
function drawDivider(doc: Doc, pages: PaperPages, event: PreparedEventSheets): void {
  const top = pages.open(`Événement : ${event.eventName} — fiches de fonction`);
  const intro = "Les fiches de fonction déposées pour cet événement suivent, dans cet ordre :";
  put(doc, intro, LEFT, top, { size: 11, width: WIDTH });
  let y = top + 10 * MM;
  event.sheets.forEach((sheet, index) => {
    y = pages.room(y, LINE);
    const extent = sheet.pdf === null ? "illisible" : pagesLabel(sheet.pdf.pageCount);
    put(doc, `${String(index + 1)}. ${sheet.fileName} — ${extent}`, LEFT, y, {
      size: 11,
      width: WIDTH,
    });
    y += LINE;
  });
}

function pagesLabel(count: number): string {
  return count > 1 ? `${String(count)} pages` : "1 page";
}

/** La place d'une fiche que le dossier n'a pas su lire. */
function drawIllegible(doc: Doc, top: number, fileName: string): void {
  put(
    doc,
    `Le PDF « ${fileName} » n'a pas pu être lu. Ouvrez l'événement, vérifiez la fiche et redéposez-la exportée en PDF depuis Excel, puis réimprimez cette partie.`,
    LEFT,
    top,
    { size: 11, width: WIDTH },
  );
}

/**
 * Le pied d'un dossier dont les fiches de fonction n'ont pas pu être lues :
 * il part sans elles, et le dit sur chaque page.
 */
export function functionSheetsFooter(footer: string, sheetsMissing: boolean): string {
  return sheetsMissing ? `${footer} · sans les fiches de fonction (illisibles)` : footer;
}
