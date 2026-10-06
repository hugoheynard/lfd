import type { Buffer } from "node:buffer";

import type { ProductionOrderSnapshot } from "../entities/production-day.js";
import type { DayDossier, DossierRecapGroup } from "./day-dossier.js";
import {
  LEFT,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  drawQr,
  longDate,
  methodLabel,
  put,
  putCaps,
  putRight,
  render,
  rule,
  type Doc,
} from "./paper-pdf-kit.js";

/**
 * **Le dossier du jour, en PDF** — le récapitulatif, puis un bon par commande,
 * en UN fichier : c'est le paquet qui part au fournil (plan
 * `documentation/production/plan-envoi-du-dossier.md`, E1).
 *
 * Même mise en page que la feuille d'atelier et le compte à produire, dont il
 * partage la trousse (`paper-pdf-kit.ts`). Comme l'écran : le lot est
 * **compté** (« N commandes · P pièces »), chaque bon est **numéroté**
 * (« bon 3/14 ») — si l'imprimante manque de feuilles, le trou se voit — et la
 * pile suit la référence. Aucun montant : la journée figée n'en porte pas.
 *
 * Déterministe : ses dates viennent de la clôture et du retirage, jamais de
 * l'horloge, si bien qu'un second tirage écrit les mêmes octets.
 */

/** Sous cette hauteur, on tourne la page plutôt que d'écrire sur le pied. */
const BOTTOM = PAGE_HEIGHT - MARGIN_Y - 10 * MM;
const SCAN_SIZE = 26 * MM;

/** Les instants qui datent le papier. */
export interface DossierStamp {
  readonly serviceDay: string;
  readonly closedAt: Date;
  /** Le dernier retirage, `null` tant que la journée porte son tirage d'origine. */
  readonly retakenAt: Date | null;
}

/**
 * Rend le dossier. `colisageUrlOf` rend l'URL du QR d'un bon, ou une chaîne
 * vide — aucun code n'est alors imprimé, comme sur la feuille d'atelier.
 */
export function renderDayDossierPdf(
  dossier: DayDossier,
  stamp: DossierStamp,
  colisageUrlOf: (reference: string) => string,
): Promise<Buffer> {
  return render(stamp.retakenAt ?? stamp.closedAt, `Dossier du jour ${stamp.serviceDay}`, (doc) => {
    drawRecap(doc, dossier, stamp);
    dossier.sheets.forEach((order, index) => {
      doc.addPage();
      footer(doc, stamp);
      const rank = `bon ${String(index + 1)}/${String(dossier.sheets.length)}`;
      const end = drawSheet(doc, order, rank, stamp);
      const url = colisageUrlOf(order.reference);
      if (url !== "") {
        drawScan(doc, url, order.reference, room(doc, end, SCAN_SIZE + 4 * MM, stamp));
      }
    });
  });
}

/**
 * La clé d'archive. **Une par tirage arrêté** : la clôture, puis chaque
 * retirage, dont l'instant entre dans le nom — le dossier complété ne
 * remplace pas celui qui est parti avant lui, il s'y ajoute.
 */
export function dayDossierPdfKey(serviceDay: string, retakenAt: Date | null): string {
  if (retakenAt === null) {
    return `${serviceDay}/dossier-du-jour.pdf`;
  }
  return `${serviceDay}/dossier-du-jour-retirage-${retakenAt.toISOString().replace(/[:.]/g, "-")}.pdf`;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/** « N commandes · P pièces » — le lot compté, en une phrase. */
function lotCount(dossier: DayDossier): string {
  return `${plural(dossier.sheets.length, "commande")} · ${plural(dossier.pieces, "pièce")}`;
}

function drawRecap(doc: Doc, dossier: DayDossier, stamp: DossierStamp): void {
  let y = MARGIN_Y;
  put(doc, "À FABRIQUER", LEFT, y, { size: 16, bold: true });
  putRight(doc, `Lot du ${longDate(stamp.serviceDay)}`, RIGHT, y + 3, 12, true);
  y += 6 * MM;
  rule(doc, y, 2);
  y += 5 * MM;
  putCaps(doc, `RÉCAPITULATIF — ${lotCount(dossier)}`, LEFT, y);
  y += 8 * MM;
  for (const group of dossier.recap) {
    y = drawGroup(doc, group, y, stamp);
  }
  footer(doc, stamp);
}

function drawGroup(doc: Doc, group: DossierRecapGroup, top: number, stamp: DossierStamp): number {
  let y = room(doc, top, 16 * MM, stamp);
  put(doc, group.label.toUpperCase(), LEFT, y, { size: 11, bold: true });
  putRight(doc, String(group.quantity), RIGHT, y, 11, true);
  y += 5 * MM;
  rule(doc, y, 1);
  y += 3.5 * MM;
  for (const line of group.lines) {
    y = room(doc, y, 10 * MM, stamp);
    put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 16, bold: true });
    put(doc, line.productName, LEFT + 20 * MM, y, { size: 12, width: WIDTH - 75 * MM });
    putRight(doc, line.sku, RIGHT - 22 * MM, y + 1 * MM, 9);
    // Sur combien de commandes ça se répartit : 240 en 3 fois ne se prépare
    // pas comme 240 en 40.
    putRight(doc, `${String(line.orderCount)} cde${line.orderCount > 1 ? "s" : ""}`, RIGHT, y, 10);
    y += 6 * MM;
    rule(doc, y, 0.6, ROW_GRAY);
    y += 3 * MM;
  }
  return y + 4 * MM;
}

function drawSheet(
  doc: Doc,
  order: ProductionOrderSnapshot,
  rank: string,
  stamp: DossierStamp,
): number {
  let y = MARGIN_Y;
  putCaps(
    doc,
    `LOT DU ${longDate(stamp.serviceDay).toUpperCase()} · ${rank.toUpperCase()}`,
    LEFT,
    y,
  );
  y += 5 * MM;
  put(doc, order.customerLabel, LEFT, y, { size: 16, bold: true, width: WIDTH - 40 * MM });
  putRight(doc, methodLabel(order.fulfillmentMethod).toUpperCase(), RIGHT, y + 1, 12, true);
  y += 8 * MM;
  put(doc, order.reference, LEFT, y, { size: 12, bold: true });
  putRight(doc, order.dueAt === null ? "Sans heure convenue" : `Pour ${order.dueAt}`, RIGHT, y, 11);
  y += 5.5 * MM;
  put(doc, order.destination, LEFT, y, { size: 11, width: WIDTH });
  y += 8 * MM;
  rule(doc, y, 2);
  const pieces = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  y += 5 * MM;
  putCaps(doc, `À PRÉPARER — ${plural(pieces, "pièce")}`, LEFT, y);
  putCaps(doc, "FAIT", RIGHT - 8 * MM, y);
  y += 6 * MM;
  for (const line of order.lines) {
    y = room(doc, y, 10 * MM, stamp);
    put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 18, bold: true });
    put(doc, line.productName, LEFT + 18 * MM, y, { size: 13, width: WIDTH - 70 * MM });
    putRight(doc, line.sku, RIGHT - 14 * MM, y + 1 * MM, 9);
    // La case à cocher au stylo : on coche en remplissant le bac.
    doc
      .save()
      .lineWidth(0.8)
      .rect(RIGHT - 6 * MM, y - 0.5 * MM, 5 * MM, 5 * MM)
      .stroke()
      .restore();
    y += 6.4 * MM;
    rule(doc, y, 0.6, ROW_GRAY);
    y += 3 * MM;
  }
  return y + 4 * MM;
}

/** Le QR de colisage, en bas du bon — il encode un NOM, déjà écrit en clair. */
function drawScan(doc: Doc, url: string, reference: string, y: number): void {
  const size = SCAN_SIZE;
  drawQr(doc, url, LEFT, y, size);
  put(doc, "Scanner pour signaler", LEFT + size + 6 * MM, y + 7 * MM, { size: 12, bold: true });
  put(doc, "que la commande est prête.", LEFT + size + 6 * MM, y + 12 * MM, { size: 12 });
  put(doc, reference, LEFT + size + 6 * MM, y + 18 * MM, { size: 10 });
}

/** Tourne la page s'il ne reste pas `needed` sous `y` ; rend le `y` où écrire. */
function room(doc: Doc, y: number, needed: number, stamp: DossierStamp): number {
  if (y + needed <= BOTTOM) {
    return y;
  }
  doc.addPage();
  footer(doc, stamp);
  putCaps(doc, `LOT DU ${longDate(stamp.serviceDay).toUpperCase()} — SUITE`, LEFT, MARGIN_Y);
  return MARGIN_Y + 8 * MM;
}

/** Le pied : quand le tirage a été arrêté — et complété, après un retirage. */
function footer(doc: Doc, stamp: DossierStamp): void {
  const arrested = `Arrêté le ${longDate(stamp.closedAt.toISOString())}`;
  const text =
    stamp.retakenAt === null
      ? arrested
      : `${arrested} — complété le ${longDate(stamp.retakenAt.toISOString())}`;
  put(doc, text, LEFT, PAGE_HEIGHT - MARGIN_Y, { size: 9 });
  putRight(doc, "La Folie Coffee — fournil", RIGHT, PAGE_HEIGHT - MARGIN_Y, 9);
}
