import type { Buffer } from "node:buffer";

import {
  BOLD,
  type Doc,
  LEFT,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  parisDateTime,
  put,
  putCaps,
  putRight,
  REGULAR,
  render,
  RIGHT,
  ROW_GRAY,
  rule,
  weekdayLongDate,
  WIDTH,
} from "../../../platform/pdf/paper-pdf-kit.js";
import {
  type RoundPaper,
  type RoundPaperSheetStop,
  type RoundPaperStop,
  roundPaperTitle,
  stopCountPaperLabel,
  windowPaperLabel,
} from "./round-paper.js";

/** Sous cette ligne, on tourne la page : le pied garde sa place. */
const BOTTOM = PAGE_HEIGHT - MARGIN_Y - 8 * MM;
/** Le retrait des lignes d'un arrêt sous son titre. */
const INDENT = 4 * MM;
/** Ce qu'il faut au moins pour commencer un arrêt : son titre et deux lignes. */
const STOP_HEAD_ROOM = 22 * MM;

/** Le curseur vertical, porté d'un arrêt à l'autre et d'une page à l'autre. */
interface Cursor {
  y: number;
}

/**
 * **La feuille de tournée en PDF** — l'en-tête de la tournée, puis un bloc par
 * arrêt dans l'ordre de passage, « Arrêt i/N », et le pied « Tiré le … · x/N ».
 *
 * Rendu déterministe : le seul instant est `printedAt`, recopié dans le pied et
 * les métadonnées. Pas de photo de procédure : le papier porte le texte des
 * étapes, et l'écran du livreur montre les photos.
 */
export function renderRoundPaperPdf(paper: RoundPaper): Promise<Buffer> {
  const title = `Tournée ${roundPaperTitle(paper)} — ${paper.serviceDay}`;
  return render(
    paper.printedAt,
    title,
    (doc) => {
      const cursor: Cursor = { y: MARGIN_Y };
      header(doc, cursor, paper);
      paper.stops.forEach((stop, index) => {
        stopBlock(doc, cursor, stop, `Arrêt ${String(index + 1)}/${String(paper.stops.length)}`);
      });
      footers(doc, paper);
    },
    true,
  );
}

/** Le nom de fichier proposé au téléchargement. */
export function roundPaperFileName(paper: RoundPaper): string {
  const passage = paper.passage > 1 ? `-passage-${String(paper.passage)}` : "";
  return `tournee-${paper.serviceDay}-${paper.vehicleName}${passage}.pdf`;
}

function header(doc: Doc, cursor: Cursor, paper: RoundPaper): void {
  putCaps(doc, "FEUILLE DE TOURNÉE", LEFT, cursor.y);
  cursor.y += 6 * MM;
  put(doc, roundPaperTitle(paper), LEFT, cursor.y, { size: 20, bold: true });
  cursor.y += 10 * MM;
  const day = `${weekdayLongDate(paper.serviceDay)} · ${stopCountPaperLabel(paper.stops.length)}`;
  put(doc, day, LEFT, cursor.y, { size: 12 });
  cursor.y += 6 * MM;
  const driver =
    paper.driverName === null ? "Aucun livreur affecté" : `Livreur : ${paper.driverName}`;
  put(doc, driver, LEFT, cursor.y, { size: 12 });
  cursor.y += 7 * MM;
  rule(doc, cursor.y, 1.2);
  cursor.y += 5 * MM;
}

function stopBlock(doc: Doc, cursor: Cursor, stop: RoundPaperStop, label: string): void {
  if (cursor.y + STOP_HEAD_ROOM > BOTTOM) {
    newPage(doc, cursor);
  }
  putCaps(doc, label.toUpperCase(), LEFT, cursor.y);
  cursor.y += 5 * MM;
  if (stop.kind === "absent") {
    line(doc, cursor, `Commande ${stop.orderId}`, { size: 13, bold: true });
    line(doc, cursor, "Absente de la feuille de route du jour", { size: 11, indent: INDENT });
  } else {
    sheetStop(doc, cursor, stop);
  }
  cursor.y += 2 * MM;
  rule(doc, cursor.y, 0.5, ROW_GRAY);
  cursor.y += 4 * MM;
}

function sheetStop(doc: Doc, cursor: Cursor, stop: RoundPaperSheetStop): void {
  line(doc, cursor, `${stop.reference} · ${stop.customerLabel}`, { size: 13, bold: true });
  if (stop.cancelled) {
    line(doc, cursor, "COMMANDE ANNULÉE — ne pas livrer", { size: 11, bold: true, indent: INDENT });
  }
  line(doc, cursor, windowPaperLabel(stop.window), { size: 11, bold: true, indent: INDENT });
  if (stop.addressLines.length === 0) {
    line(doc, cursor, "Aucune adresse sur la commande", { size: 11, indent: INDENT });
  }
  for (const address of stop.addressLines) {
    line(doc, cursor, address, { size: 11, indent: INDENT });
  }
  const contact =
    stop.contact === null
      ? "Contact : aucun"
      : `Contact : ${stop.contact.prenom} ${stop.contact.nom} · ${stop.contact.telephone}`;
  line(doc, cursor, contact, { size: 11, indent: INDENT });
  if (stop.signatureRequired) {
    line(doc, cursor, "Signature exigée", { size: 11, bold: true, indent: INDENT });
  }
  const bins = stop.binCodes.length === 0 ? "aucun bac déclaré" : stop.binCodes.join(" · ");
  line(doc, cursor, `Bacs : ${bins}`, { size: 11, indent: INDENT });
  notesAndSteps(doc, cursor, stop);
}

function notesAndSteps(doc: Doc, cursor: Cursor, stop: RoundPaperSheetStop): void {
  if (stop.orderNote !== "") {
    line(doc, cursor, `Note de commande : ${stop.orderNote}`, { size: 11, indent: INDENT });
  }
  if (stop.addressNote !== null && stop.addressNote !== "") {
    line(doc, cursor, `Note de l'adresse : ${stop.addressNote}`, { size: 11, indent: INDENT });
  }
  stop.steps.forEach((step, index) => {
    line(doc, cursor, `${String(index + 1)}. ${step.title}`, {
      size: 11,
      bold: true,
      indent: INDENT,
    });
    if (step.body !== "") {
      line(doc, cursor, step.body, { size: 10, indent: 2 * INDENT });
    }
  });
}

/** Une ligne qui passe à la ligne dans sa largeur, et tourne la page s'il le faut. */
function line(
  doc: Doc,
  cursor: Cursor,
  text: string,
  options: { readonly size: number; readonly bold?: boolean; readonly indent?: number },
): void {
  const indent = options.indent ?? 0;
  const width = WIDTH - indent;
  const height = doc
    .font(options.bold === true ? BOLD : REGULAR)
    .fontSize(options.size)
    .heightOfString(text, { width });
  if (cursor.y + height > BOTTOM) {
    newPage(doc, cursor);
  }
  put(doc, text, LEFT + indent, cursor.y, {
    size: options.size,
    width,
    ...(options.bold === true ? { bold: true } : {}),
  });
  cursor.y += height + 1.2 * MM;
}

function newPage(doc: Doc, cursor: Cursor): void {
  doc.addPage();
  cursor.y = MARGIN_Y;
}

/** Les pieds, posés à la fin : le total des pages n'est connu qu'une fois tout dessiné. */
function footers(doc: Doc, paper: RoundPaper): void {
  const range = doc.bufferedPageRange();
  const printed = `Tiré le ${parisDateTime(paper.printedAt)}`;
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    const folio = `${String(index + 1)}/${String(range.count)}`;
    put(doc, `${printed} · ${folio}`, LEFT, PAGE_HEIGHT - MARGIN_Y, { size: 9 });
    putRight(doc, roundPaperTitle(paper), RIGHT, PAGE_HEIGHT - MARGIN_Y, 9);
  }
}
