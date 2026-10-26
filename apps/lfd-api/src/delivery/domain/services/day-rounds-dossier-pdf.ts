import type { Buffer } from "node:buffer";

import {
  BOLD,
  type Doc,
  LEFT,
  MM,
  parisDateTime,
  put,
  REGULAR,
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
import type { DossierCheck } from "./day-rounds-dossier-checks.js";
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
const CHECK_HEAD = 6 * MM;
const CHECK_REASON = 5 * MM;
const REASON_WIDTH = WIDTH - 4 * MM;

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

/** Les mois, en toutes lettres et sans accent : un nom de fichier n'en porte pas. */
const FILE_MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
] as const;

/**
 * Le nom de fichier proposé au téléchargement (décision de Hugo,
 * 2026-10-26) — `dossier-de-livraison-du-26-octobre-2026.pdf`. Le jour de
 * service est déjà un jour de Paris : aucun fuseau ici. Le back-office nomme
 * son lien de repli de la même façon (`dayDossierFileName`).
 */
export function dayRoundsDossierFileName(serviceDay: string): string {
  const [year = "", month = "", date = ""] = serviceDay.split("-");
  const monthName = FILE_MONTHS[Number(month) - 1] ?? month;
  return `dossier-de-livraison-du-${String(Number(date))}-${monthName}-${year}.pdf`;
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
  y = drawUnplaced(doc, dossier.unplaced, y + 4 * MM, room);
  drawChecks(doc, dossier.checks, y + 6 * MM, room);
}

/** « 3 tournées · 14 arrêts · 9/12 bacs chargés · 2 livraisons non placées · 1 à vérifier ». */
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
    ...(dossier.checks.length === 0 ? [] : [`${String(dossier.checks.length)} à vérifier`]),
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

const CUSTOMER_COLUMN = 32 * MM;
const HEAD_GAP = 3 * MM;

/**
 * La commande en gras, son BL à côté quand il existe (2026-10-26), puis le
 * client — dans sa colonne, ou repoussé après le BL quand la référence et le
 * numéro la débordent.
 */
function putOrderHead(
  doc: Doc,
  order: {
    readonly reference: string;
    readonly deliveryNoteNumber: string | null;
    readonly customerLabel: string;
  },
  y: number,
  right: number = RIGHT,
): void {
  put(doc, order.reference, LEFT, y, { size: 11, bold: true });
  let end = LEFT + doc.font(BOLD).fontSize(11).widthOfString(order.reference);
  if (order.deliveryNoteNumber !== null) {
    const x = end + HEAD_GAP;
    put(doc, order.deliveryNoteNumber, x, y, { size: 11 });
    end = x + doc.font(REGULAR).fontSize(11).widthOfString(order.deliveryNoteNumber);
  }
  const customerX = Math.max(LEFT + CUSTOMER_COLUMN, end + HEAD_GAP);
  const label = fitted(doc, order.customerLabel, right - HEAD_GAP - customerX);
  put(doc, label, customerX, y, { size: 11, color: MUTED });
}

/** Le texte tel quel s'il tient, sinon raccourci d'un « … » : il ne chevauche pas la tournée. */
function fitted(doc: Doc, text: string, width: number): string {
  doc.font(REGULAR).fontSize(11);
  if (doc.widthOfString(text) <= width) {
    return text;
  }
  let cut = text;
  while (cut.length > 0 && doc.widthOfString(`${cut}…`) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** Les livraisons du jour qu'aucune tournée ne porte : elles ne disparaissent pas du dossier. */
function drawUnplaced(
  doc: Doc,
  unplaced: readonly UnplacedDelivery[],
  top: number,
  room: (at: number, needed: number) => number,
): number {
  let y = room(top, 3 * UNPLACED_ROW);
  putCaps(doc, `LIVRAISONS NON PLACÉES — ${String(unplaced.length)}`, LEFT, y);
  rule(doc, y + 5 * MM, 1);
  y += 8 * MM;
  if (unplaced.length === 0) {
    put(doc, "Toutes les livraisons du jour sont dans une tournée.", LEFT, y, { size: 11 });
    return y + UNPLACED_ROW;
  }
  for (const order of unplaced) {
    y = room(y, UNPLACED_ROW);
    putOrderHead(doc, order, y);
    y += UNPLACED_ROW;
  }
  return y;
}

/**
 * **À vérifier** (2026-10-26) — les alertes de l'ancienne feuille de route :
 * la commande, sa tournée, puis une ligne par raison. Une commande ne se
 * coupe pas entre deux pages.
 */
function drawChecks(
  doc: Doc,
  checks: readonly DossierCheck[],
  top: number,
  room: (at: number, needed: number) => number,
): void {
  let y = room(top, 3 * UNPLACED_ROW);
  putCaps(doc, `À VÉRIFIER — ${String(checks.length)}`, LEFT, y);
  rule(doc, y + 5 * MM, 1);
  y += 8 * MM;
  if (checks.length === 0) {
    put(doc, "Rien à vérifier sur les livraisons du jour.", LEFT, y, { size: 11 });
    return;
  }
  for (const check of checks) {
    const lines = check.reasons.map((reason) => `•  ${reason}`);
    const heights = lines.map((text) =>
      Math.max(
        CHECK_REASON,
        doc.font(REGULAR).fontSize(10.5).heightOfString(text, { width: REASON_WIDTH }),
      ),
    );
    const height = CHECK_HEAD + heights.reduce((sum, h) => sum + h, 0) + 2 * MM;
    y = room(y, height);
    const roundTitle = check.roundTitle ?? "Hors tournée";
    const titleWidth = doc.font(REGULAR).fontSize(10.5).widthOfString(roundTitle);
    putOrderHead(doc, check, y, RIGHT - titleWidth);
    putRight(doc, roundTitle, RIGHT, y, 10.5, false);
    let line = y + CHECK_HEAD;
    lines.forEach((text, index) => {
      put(doc, text, LEFT + 4 * MM, line, { size: 10.5, width: REASON_WIDTH });
      line += heights[index] ?? CHECK_REASON;
    });
    y += height;
  }
}
