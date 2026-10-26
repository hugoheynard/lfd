import type { Buffer } from "node:buffer";

import {
  type Doc,
  LEFT,
  MM,
  parisDateTime,
  put,
  putCaps,
  putRight,
  render,
  RIGHT,
  ROW_GRAY,
  rule,
  weekdayLongDate,
  weekdayShortDate,
  WIDTH,
} from "../../../platform/pdf/paper-pdf-kit.js";
import { CONTENT_BOTTOM, CONTENT_TOP, PaperPages } from "../../../platform/pdf/paper-pages.js";
import { fillBox } from "../../../platform/pdf/paper-pdf-shapes.js";
import type { DayRoundsDossier, RoundDispatchRow, UnplacedDelivery } from "./day-rounds-dossier.js";
import { stopCountPaperLabel, timeLabel } from "./round-paper.js";
import { drawRoundPaper } from "./round-paper-pdf.js";
import { MUTED } from "./round-paper-pdf-layout.js";

/** Ce que le cadre pose à côté du dossier, lu au tirage. */
export interface RoundsDossierPrint {
  /** Le logo, en octets PNG ou JPEG. */
  readonly logo: Buffer;
}

const DISPATCH_ROW = 19 * MM;
const UNPLACED_ROW = 7 * MM;
const SWATCH = 3.2 * MM;

/**
 * **Le dossier des tournées du jour, en PDF** (décision de Hugo du
 * 2026-10-26) — sur le modèle du dossier du jour du fournil : le même cadre
 * (`PaperPages` : logo, titre de section, « (1/2) » quand elle déborde, numéro
 * de page encadré). D'abord la répartition — une ligne par tournée, puis les
 * livraisons du jour qu'aucune tournée ne porte —, puis la feuille de chaque
 * tournée, **exactement** celle remise au livreur (`drawRoundPaper`, le corps
 * de `round.pdf`), chacune sur une page neuve.
 *
 * Déterministe : le seul instant est `printedAt`. Aucun montant.
 */
export function renderDayRoundsDossierPdf(
  dossier: DayRoundsDossier,
  print: RoundsDossierPrint,
): Promise<Buffer> {
  return render(
    dossier.printedAt,
    `Dossier des tournées ${dossier.serviceDay}`,
    (doc) => {
      const pages = new PaperPages(doc);
      drawDispatch(doc, dossier, pages);
      for (const paper of dossier.papers) {
        pages.drawn(sectionTitleOf(paper), (inner) => {
          drawRoundPaper(
            inner,
            { y: CONTENT_TOP, top: CONTENT_TOP, bottom: CONTENT_BOTTOM },
            paper,
          );
        });
      }
      pages.finish({
        logo: print.logo,
        headerRight: `Tournées du ${weekdayShortDate(dossier.serviceDay)}`,
        footerLeft: `Tiré le ${parisDateTime(dossier.printedAt)}`,
      });
    },
    true,
  );
}

/** Le nom de fichier proposé au téléchargement. */
export function dayRoundsDossierFileName(serviceDay: string): string {
  return `dossier-tournees-${serviceDay}.pdf`;
}

/** « Camion 1 · passage 1 » — le passage toujours dit, même le premier. */
export function sectionTitleOf(round: {
  readonly vehicleName: string;
  readonly passage: number;
}): string {
  return `${round.vehicleName} · passage ${String(round.passage)}`;
}

function drawDispatch(doc: Doc, dossier: DayRoundsDossier, pages: PaperPages): void {
  const room = (at: number, needed: number): number => pages.room(at, needed);
  let y = pages.open("Répartition des tournées") + 2 * MM;
  put(doc, `Tournées du ${weekdayLongDate(dossier.serviceDay)}`, LEFT, y, {
    size: 20,
    bold: true,
    width: WIDTH,
  });
  y += 11 * MM;
  put(doc, countLine(dossier), LEFT, y, { size: 12, width: WIDTH });
  y += 7 * MM;
  rule(doc, y, 2);
  y += 5 * MM;
  if (dossier.dispatch.length === 0) {
    put(doc, "Aucune tournée composée pour ce jour.", LEFT, y, { size: 12 });
    y += 8 * MM;
  }
  for (const row of dossier.dispatch) {
    y = room(y, DISPATCH_ROW);
    drawDispatchRow(doc, row, y);
    y += DISPATCH_ROW;
  }
  drawUnplaced(doc, dossier.unplaced, y + 4 * MM, room);
}

/** « 3 tournées · 14 arrêts · 9/12 bacs chargés · 2 livraisons non placées ». */
function countLine(dossier: DayRoundsDossier): string {
  const rounds = dossier.dispatch.length;
  const stops = dossier.dispatch.reduce((sum, row) => sum + row.stopCount, 0);
  const loaded = dossier.dispatch.reduce((sum, row) => sum + row.binsLoaded, 0);
  const expected = dossier.dispatch.reduce((sum, row) => sum + row.binsExpected, 0);
  const unplaced = dossier.unplaced.length;
  return [
    rounds === 1 ? "1 tournée" : `${String(rounds)} tournées`,
    stopCountPaperLabel(stops),
    binsLabel(loaded, expected),
    ...(unplaced === 0
      ? []
      : [unplaced === 1 ? "1 livraison non placée" : `${String(unplaced)} livraisons non placées`]),
  ].join(" · ");
}

function binsLabel(loaded: number, expected: number): string {
  return `${String(loaded)}/${String(expected)} ${expected > 1 ? "bacs chargés" : "bac chargé"}`;
}

/** Une tournée : son titre et son départ, puis le livreur et les comptes, puis ses transferts. */
function drawDispatchRow(doc: Doc, row: RoundDispatchRow, top: number): void {
  put(doc, sectionTitleOf(row), LEFT, top, { size: 13, bold: true, width: WIDTH * 0.6 });
  const departure =
    row.departure === null ? "Départ non calculé" : `Départ ${timeLabel(row.departure)}`;
  putRight(doc, departure, RIGHT, top, 13, true);
  const driver = row.driverName === null ? "Aucun livreur affecté" : `Livreur : ${row.driverName}`;
  const deadline =
    row.tightestDeadline === null ? null : `échéance avant ${timeLabel(row.tightestDeadline)}`;
  const facts = [
    driver,
    stopCountPaperLabel(row.stopCount),
    binsLabel(row.binsLoaded, row.binsExpected),
    ...(deadline === null ? [] : [deadline]),
  ];
  put(doc, facts.join("   ·   "), LEFT, top + 6 * MM, { size: 10.5, width: WIDTH });
  drawTransfers(doc, row, top + 11.5 * MM);
  rule(doc, top + DISPATCH_ROW - 2.5 * MM, 0.5, ROW_GRAY);
}

/** « Transfert vers Val Village », derrière le carré de la couleur du site s'il en a une. */
function drawTransfers(doc: Doc, row: RoundDispatchRow, y: number): void {
  let x = LEFT;
  for (const transfer of row.transfers) {
    if (transfer.color !== null) {
      fillBox(doc, { x, y: y - 0.2 * MM, width: SWATCH, height: SWATCH }, transfer.color);
      x += SWATCH + 1.5 * MM;
    }
    const text = `Transfert vers ${transfer.siteLabel}`;
    put(doc, text, x, y, { size: 10.5, bold: true });
    x += doc.widthOfString(text) + 6 * MM;
  }
}

/** Les livraisons du jour qu'aucune tournée ne porte : elles ne disparaissent pas du dossier. */
function drawUnplaced(
  doc: Doc,
  unplaced: readonly UnplacedDelivery[],
  top: number,
  room: (at: number, needed: number) => number,
): void {
  let y = room(top, 3 * UNPLACED_ROW);
  putCaps(doc, `LIVRAISONS NON PLACÉES — ${String(unplaced.length)}`, LEFT, y);
  rule(doc, y + 5 * MM, 1);
  y += 8 * MM;
  if (unplaced.length === 0) {
    put(doc, "Toutes les livraisons du jour sont dans une tournée.", LEFT, y, { size: 11 });
    return;
  }
  for (const order of unplaced) {
    y = room(y, UNPLACED_ROW);
    put(doc, order.reference, LEFT, y, { size: 11, bold: true });
    put(doc, order.customerLabel, LEFT + 32 * MM, y, { size: 11, color: MUTED });
    y += UNPLACED_ROW;
  }
}
