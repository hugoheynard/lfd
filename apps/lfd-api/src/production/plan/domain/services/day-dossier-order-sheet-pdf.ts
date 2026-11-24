import type { ProductionOrderSnapshot } from "../../../day/index.js";
import { dossierSheetHeadOf, type DossierSheetHead } from "../../../shared/print/index.js";
import { figureFontSize, lineFigure, piecesOfLines } from "../../../shared/print/index.js";
import { isMadeToOrder, MADE_TO_ORDER_MENTION } from "../../../shared/print/index.js";
import { drawRouting } from "../../../shared/print/index.js";
import {
  LEFT,
  MM,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  drawQr,
  put,
  putCaps,
  putRight,
  rule,
  weekdayShortDate,
  type Doc,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import type { DossierPrint, DossierStamp } from "./day-dossier-pdf.js";

/**
 * **Le bon d'une commande** dans le dossier du jour : l'en-tête du lot, qui
 * et par où, les lignes à préparer avec leur case, la note du client et le QR
 * de colisage. Le dossier entier et un tirage partiel le dessinent de la même
 * façon.
 */

const SCAN_SIZE = 26 * MM;

/** Où et comment dessiner un bon : son haut, son rang, le lot, la page à tourner. */
export interface SheetPlace {
  readonly top: number;
  readonly rank: string;
  readonly stamp: DossierStamp;
  readonly room: (at: number, needed: number) => number;
}

/** Le bon d'une commande, puis son QR de colisage s'il y en a un. */
export function drawOrder(
  doc: Doc,
  order: ProductionOrderSnapshot,
  place: SheetPlace,
  print: DossierPrint,
): void {
  const end = drawSheet(doc, order, place, print.colors.get(order.orderId) ?? null);
  const url = print.colisageUrlOf(order.reference);
  if (url !== "") {
    drawScan(doc, url, order.reference, place.room(end, SCAN_SIZE + 4 * MM));
  }
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

function drawSheet(
  doc: Doc,
  order: ProductionOrderSnapshot,
  place: SheetPlace,
  color: string | null,
): number {
  let y = place.top;
  putCaps(doc, `${lotBanner(place.stamp)} · ${place.rank.toUpperCase()}`, LEFT, y);
  const head = dossierSheetHeadOf(order);
  y = drawHead(doc, order, head, y + 6 * MM, color);
  rule(doc, y, 2);
  // Un article au poids compte pour une ligne dans ce total (P6).
  const pieces = piecesOfLines(order.lines);
  y += 5 * MM;
  putCaps(doc, `À PRÉPARER — ${plural(pieces, "pièce")}`, LEFT, y);
  putCaps(doc, "FAIT", RIGHT - 8 * MM, y);
  y += 6 * MM;
  for (const line of order.lines) {
    const marked = isMadeToOrder(line);
    y = place.room(y, marked ? 14 * MM : 10 * MM);
    put(doc, lineFigure(line), LEFT, y - 1.2 * MM, { size: figureFontSize(line, 18), bold: true });
    put(doc, line.productName, LEFT + 18 * MM, y, { size: 13, width: WIDTH - 70 * MM });
    putRight(doc, line.sku, RIGHT - 14 * MM, y + 1 * MM, 9);
    if (marked) {
      // Comme la fiche d'atelier (`plan-sur-mesure-partout.md`, M3).
      putCaps(doc, MADE_TO_ORDER_MENTION, LEFT + 18 * MM, y + 6 * MM);
    }
    // La case à cocher au stylo : on coche en remplissant le bac.
    doc
      .save()
      .lineWidth(0.8)
      .rect(RIGHT - 6 * MM, y - 0.5 * MM, 5 * MM, 5 * MM)
      .stroke()
      .restore();
    y += marked ? 10.4 * MM : 6.4 * MM;
    rule(doc, y, 0.6, ROW_GRAY);
    y += 3 * MM;
  }
  return drawNote(doc, head.note, y + 4 * MM, place.room);
}

/**
 * Qui, et par où ça part (« Retrait Village · pro », derrière la pastille de
 * la commande) ; puis la référence et l'heure, et les mentions. Rend le `y`
 * du trait.
 */
function drawHead(
  doc: Doc,
  order: ProductionOrderSnapshot,
  head: DossierSheetHead,
  top: number,
  color: string | null,
): number {
  let y = top;
  put(doc, head.title, LEFT, y, { size: 16, bold: true, width: WIDTH * 0.55 });
  drawRouting(doc, order, color, { right: RIGHT, y: y + 1, size: 12 });
  y += 8 * MM;
  if (head.subtitle !== null) {
    // La raison sociale sous l'enseigne : elle lève l'ambiguïté entre deux
    // devantures voisines.
    put(doc, head.subtitle, LEFT, y - 1.5 * MM, { size: 11 });
    y += 5 * MM;
  }
  put(doc, order.reference, LEFT, y, { size: 12, bold: true });
  putRight(doc, head.when, RIGHT, y, 11);
  return drawMentions(doc, head, y + 5.5 * MM) + 2.5 * MM;
}

/** Où, puis ce que le livreur doit savoir avant de sonner — une ligne par mention. */
function drawMentions(doc: Doc, head: DossierSheetHead, top: number): number {
  let y = top;
  const mentions = [...head.where, head.contact, head.signature, head.origin];
  for (const mention of mentions) {
    if (mention !== null) {
      put(doc, mention, LEFT, y, { size: 11, width: WIDTH });
      y += 5 * MM;
    }
  }
  return y;
}

/** La note du client, sous les lignes — comme sur la fiche de l'écran. */
function drawNote(
  doc: Doc,
  note: string | null,
  top: number,
  room: (at: number, needed: number) => number,
): number {
  if (note === null) {
    return top;
  }
  const y = room(top, 16 * MM);
  putCaps(doc, "NOTE DU CLIENT", LEFT, y);
  put(doc, note, LEFT, y + 5 * MM, { size: 11, width: WIDTH });
  return y + 5 * MM + doc.heightOfString(note, { width: WIDTH }) + 4 * MM;
}

/** Le QR de colisage, en bas du bon — il encode un NOM, déjà écrit en clair. */
function drawScan(doc: Doc, url: string, reference: string, y: number): void {
  const size = SCAN_SIZE;
  drawQr(doc, url, LEFT, y, size);
  put(doc, "Scanner pour signaler", LEFT + size + 6 * MM, y + 7 * MM, { size: 12, bold: true });
  put(doc, "que la commande est prête.", LEFT + size + 6 * MM, y + 12 * MM, { size: 12 });
  put(doc, reference, LEFT + size + 6 * MM, y + 18 * MM, { size: 10 });
}

/**
 * « LOT POUR LE MER. 7 OCT. » — le jour où la marchandise est attendue
 * (retrait ou livraison), pas celui où on la fabrique.
 */
export function lotBanner(stamp: DossierStamp): string {
  return `LOT POUR LE ${weekdayShortDate(stamp.serviceDay).toUpperCase()}`;
}
