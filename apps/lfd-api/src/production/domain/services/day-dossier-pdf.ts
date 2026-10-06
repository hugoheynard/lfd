import type { Buffer } from "node:buffer";

import { type PlanSigner, signedVerb, staffSigner } from "../entities/plan-signer.js";
import type { ProductionOrderSnapshot } from "../entities/production-day.js";
import { methodSplitOf } from "./dossier-addressees.js";
import type { DayDossier, DossierRecapGroup } from "./day-dossier.js";
import { dossierSheetHeadOf, type DossierSheetHead } from "./dossier-sheet-head.js";
import {
  LEFT,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  drawQr,
  methodLabel,
  parisDateTime,
  put,
  putCaps,
  putRight,
  render,
  rule,
  weekdayLongDate,
  weekdayShortDate,
  type Doc,
} from "./paper-pdf-kit.js";

/**
 * **Le dossier du jour, en PDF** — le récapitulatif, puis un bon par commande,
 * en UN fichier : c'est le paquet qui part au fournil (plan
 * `documentation/production/dossier-prod-du-jour.md`, E1).
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
  /** Qui l'a arrêté — `null` : inconnu (journée arrêtée avant 2026-10-06). */
  readonly closedBy: PlanSigner | null;
  /** Le dernier retirage, `null` tant que la journée porte son tirage d'origine. */
  readonly retakenAt: Date | null;
  /** Qui a complété, nom figé au retirage ; `null` si inconnu. */
  readonly retakenByName: string | null;
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
  return render(
    stamp.retakenAt ?? stamp.closedAt,
    `Dossier du jour ${stamp.serviceDay}`,
    (doc) => {
      drawRecap(doc, dossier, stamp);
      dossier.sheets.forEach((order, index) => {
        doc.addPage();
        const rank = `bon ${String(index + 1)}/${String(dossier.sheets.length)}`;
        const end = drawSheet(doc, order, rank, stamp);
        const url = colisageUrlOf(order.reference);
        if (url !== "") {
          drawScan(doc, url, order.reference, room(doc, end, SCAN_SIZE + 4 * MM, stamp));
        }
      });
      footers(doc, stamp);
    },
    true,
  );
}

/**
 * La clé d'archive. **Une par tirage arrêté** : la clôture, puis chaque
 * retirage, dont l'instant entre dans le nom — le dossier complété ne
 * remplace pas celui qui est parti avant lui, il s'y ajoute.
 *
 * `v2` (E1b, 2026-10-06) : le bon porte désormais ce que la journée a figé
 * au-delà de l'étiquette, et le pied l'heure de Paris. Un dossier archivé sous
 * l'ancienne clé dirait encore le papier d'avant ; changer la clé le laisse en
 * place, sans jamais le resservir. Toute mise en page qui change ce qu'un
 * dossier déjà archivé dirait monte cette version.
 *
 * `v3` (2026-10-06) : le lot dit le jour de service en toutes lettres
 * (« Lot pour le mercredi 7 octobre 2026 ») et chaque pied porte « x/N ».
 *
 * `v4` (2026-10-06) : le pied dit QUI a arrêté (« Arrêté par Marie Dupont le
 * … », « Arrêté automatiquement le … ») et qui a complété ; le récapitulatif
 * sépare les commandes en retrait et en livraison.
 */
export const DOSSIER_LAYOUT_VERSION = "v4";

export function dayDossierPdfKey(serviceDay: string, retakenAt: Date | null): string {
  const base = `${serviceDay}/dossier-du-jour-${DOSSIER_LAYOUT_VERSION}`;
  if (retakenAt === null) {
    return `${base}.pdf`;
  }
  return `${base}-retirage-${retakenAt.toISOString().replace(/[:.]/g, "-")}.pdf`;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/**
 * « N commandes (R en retrait, L en livraison) · P pièces » — le lot compté,
 * en une phrase. Une part à zéro ne s'écrit pas : « 3 commandes (3 en retrait) ».
 */
function lotCount(dossier: DayDossier): string {
  const pickup = dossier.sheets.filter((order) => order.fulfillmentMethod === "pickup").length;
  const split = methodSplitOf(pickup, dossier.sheets.length - pickup);
  const orders = plural(dossier.sheets.length, "commande");
  return `${split === "" ? orders : `${orders} (${split})`} · ${plural(dossier.pieces, "pièce")}`;
}

function drawRecap(doc: Doc, dossier: DayDossier, stamp: DossierStamp): void {
  let y = MARGIN_Y;
  put(doc, "À FABRIQUER", LEFT, y, { size: 16, bold: true });
  putRight(doc, `Lot pour le ${weekdayLongDate(stamp.serviceDay)}`, RIGHT, y + 3, 12, true);
  y += 6 * MM;
  rule(doc, y, 2);
  y += 5 * MM;
  putCaps(doc, `RÉCAPITULATIF — ${lotCount(dossier)}`, LEFT, y);
  y += 8 * MM;
  for (const group of dossier.recap) {
    y = drawGroup(doc, group, y, stamp);
  }
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
  putCaps(doc, `${lotBanner(stamp)} · ${rank.toUpperCase()}`, LEFT, y);
  const head = dossierSheetHeadOf(order);
  y = drawHead(doc, order, head, y + 5 * MM);
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
  return drawNote(doc, head.note, y + 4 * MM, stamp);
}

/** Qui, la référence et l'heure, puis les mentions ; rend le `y` du trait. */
function drawHead(
  doc: Doc,
  order: ProductionOrderSnapshot,
  head: DossierSheetHead,
  top: number,
): number {
  let y = top;
  put(doc, head.title, LEFT, y, { size: 16, bold: true, width: WIDTH - 40 * MM });
  putRight(doc, methodLabel(order.fulfillmentMethod).toUpperCase(), RIGHT, y + 1, 12, true);
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
function drawNote(doc: Doc, note: string | null, top: number, stamp: DossierStamp): number {
  if (note === null) {
    return top;
  }
  const y = room(doc, top, 16 * MM, stamp);
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

/** Tourne la page s'il ne reste pas `needed` sous `y` ; rend le `y` où écrire. */
function room(doc: Doc, y: number, needed: number, stamp: DossierStamp): number {
  if (y + needed <= BOTTOM) {
    return y;
  }
  doc.addPage();
  putCaps(doc, `${lotBanner(stamp)} — SUITE`, LEFT, MARGIN_Y);
  return MARGIN_Y + 8 * MM;
}

/**
 * « LOT POUR LE MER. 7 OCT. » — le jour où la marchandise est attendue
 * (retrait ou livraison), pas celui où on la fabrique.
 */
function lotBanner(stamp: DossierStamp): string {
  return `LOT POUR LE ${weekdayShortDate(stamp.serviceDay).toUpperCase()}`;
}

/**
 * Les pieds, posés à la fin : le total des pages n'est connu qu'une fois tout
 * dessiné, pages « SUITE » comprises.
 */
function footers(doc: Doc, stamp: DossierStamp): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    footer(doc, stamp, `${String(index + 1)}/${String(range.count)}`);
  }
}

/** Le pied : quand le tirage a été arrêté — et complété —, puis « x/N ». */
function footer(doc: Doc, stamp: DossierStamp, folio: string): void {
  const arrested = `${signedVerb("Arrêté", stamp.closedBy)} ${parisDateTime(stamp.closedAt)}`;
  const completer = stamp.retakenByName === null ? null : staffSigner("", stamp.retakenByName);
  const text =
    stamp.retakenAt === null
      ? arrested
      : `${arrested} — ${signedVerb("complété", completer)} ${parisDateTime(stamp.retakenAt)}`;
  put(doc, `${text} · ${folio}`, LEFT, PAGE_HEIGHT - MARGIN_Y, { size: 9 });
  putRight(doc, "La Folie Coffee — fournil", RIGHT, PAGE_HEIGHT - MARGIN_Y, 9);
}
