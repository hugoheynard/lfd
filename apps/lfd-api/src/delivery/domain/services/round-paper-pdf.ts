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
  render,
  RIGHT,
  ROW_GRAY,
  rule,
  weekdayLongDate,
  WIDTH,
} from "../../../platform/pdf/paper-pdf-kit.js";
import { fillBox } from "../../../platform/pdf/paper-pdf-shapes.js";
import { type RoundPaper, roundPaperTitle, stopCountPaperLabel } from "./round-paper.js";
import { type Cursor, placeBlock, SOFT } from "./round-paper-pdf-layout.js";
import { absentStopBlock, sheetStopBlock } from "./round-paper-pdf-stop.js";

/** L'espace entre deux arrêts, de part et d'autre du filet. */
const STOP_GAP = 3.5 * MM;

/**
 * **La feuille de tournée en PDF** — l'en-tête de la tournée et son récap,
 * puis un bloc par arrêt dans l'ordre de passage : la pastille du rang à
 * gauche, le client, la fenêtre, l'adresse, le contact, les bacs en étiquettes,
 * et la case « Livré ». Un bloc ne se coupe pas entre deux pages, sauf s'il
 * dépasse une page entière (cf. `placeBlock`).
 *
 * Noir et gris seulement : le papier sort d'une imprimante de bureau. Rendu
 * déterministe : le seul instant est `printedAt`, recopié dans le pied et les
 * métadonnées. Pas de photo de procédure : l'écran du livreur les montre.
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
        if (index > 0) {
          rule(doc, cursor.y + STOP_GAP, 0.5, ROW_GRAY);
          cursor.y += 2 * STOP_GAP;
        }
        const block =
          stop.kind === "absent"
            ? absentStopBlock(doc, stop, index + 1)
            : sheetStopBlock(doc, stop, index + 1);
        placeBlock(doc, cursor, block);
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
  putRight(doc, stopCountPaperLabel(paper.stops.length), RIGHT, cursor.y - 1, 12, true);
  cursor.y += 5 * MM;
  put(doc, roundPaperTitle(paper), LEFT, cursor.y, { size: 24, bold: true, width: WIDTH });
  cursor.y += doc.font(BOLD).fontSize(24).heightOfString(roundPaperTitle(paper), { width: WIDTH });
  cursor.y += 1 * MM;
  put(doc, weekdayLongDate(paper.serviceDay), LEFT, cursor.y, { size: 13, bold: true });
  const driver =
    paper.driverName === null ? "Aucun livreur affecté" : `Livreur : ${paper.driverName}`;
  putRight(doc, driver, RIGHT, cursor.y, 13);
  cursor.y += 8 * MM;
  recap(doc, cursor, paper);
  rule(doc, cursor.y, 1.2);
  cursor.y += 5 * MM;
}

/** Une ligne de récap : ce qu'on vérifie au chargement, avant de partir. */
function recap(doc: Doc, cursor: Cursor, paper: RoundPaper): void {
  const live = paper.stops.flatMap((stop) =>
    stop.kind === "sheet" && !stop.cancelled ? [stop] : [],
  );
  const bins = live.reduce((sum, stop) => sum + stop.binCodes.length, 0);
  const signatures = live.filter((stop) => stop.signatureRequired).length;
  const cancelled = paper.stops.filter((stop) => stop.kind === "sheet" && stop.cancelled).length;
  const parts = [
    bins === 1 ? "1 bac à charger" : `${String(bins)} bacs à charger`,
    signatures === 1 ? "1 signature exigée" : `${String(signatures)} signatures exigées`,
    ...(cancelled === 0 ? [] : [cancelled === 1 ? "1 annulée" : `${String(cancelled)} annulées`]),
  ];
  const height = 7 * MM;
  fillBox(doc, { x: LEFT, y: cursor.y, width: WIDTH, height }, SOFT);
  put(doc, parts.join("   ·   "), LEFT + 3 * MM, cursor.y + 2 * MM, { size: 11, bold: true });
  cursor.y += height + 3 * MM;
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
