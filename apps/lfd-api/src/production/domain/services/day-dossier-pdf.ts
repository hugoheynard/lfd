import type { Buffer } from "node:buffer";

import type { DeliveryNoteDrawing } from "../../channels/commerce/planned-delivery-notes.reader.js";
import { type PlanSigner, signedVerb, staffSigner } from "../entities/plan-signer.js";
import type { ProductionOrderSnapshot } from "../entities/production-day.js";
import type { DayDossier } from "./day-dossier.js";
import { drawDossierCover } from "./day-dossier-cover-pdf.js";
import { drawRecapGroup } from "./day-dossier-recap-pdf.js";
import { dossierSheetHeadOf, type DossierSheetHead } from "./dossier-sheet-head.js";
import { drawResupplySheet } from "./day-dossier-resupplies-pdf.js";
import {
  LEFT,
  MM,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  drawQr,
  parisDateTime,
  put,
  putCaps,
  putRight,
  render,
  rule,
  weekdayShortDate,
  type Doc,
} from "../../../platform/pdf/paper-pdf-kit.js";
import { drawRouting } from "./order-routing-pdf.js";
import { PaperPages } from "./paper-pages.js";

/**
 * **Le dossier du jour, en PDF** — une couverture, le récapitulatif (un rayon
 * par page), puis un bon par commande suivi de son BL de transport, et un bon
 * par réassort, en UN fichier : c'est le paquet qui part au fournil (plan
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
 * Ce que le dossier pose à côté de la journée figée, lu au tirage.
 *
 * - `colisageUrlOf` rend l'URL du QR d'un bon, ou une chaîne vide — aucun code
 *   n'est alors imprimé, comme sur la feuille d'atelier.
 * - `colors` porte la pastille de chaque commande, par `orderId` (§0 bis du
 *   plan de la planche des documents v2, 2026-10-22), posée devant son
 *   acheminement (« Retrait Village · pro ») ; une commande absente n'en a pas.
 * - `resupplyColors` porte, par `siteId`, la teinte de réassort du site
 *   destinataire (Hugo, 2026-10-22) ; un site absent n'en a pas.
 * - `deliveryNotes` porte, par `orderId`, le BL de transport imprimé derrière
 *   le bon (Hugo, 2026-10-25) ; une commande absente n'en a pas.
 */
export interface DossierPrint {
  readonly logo: Buffer;
  readonly colisageUrlOf: (reference: string) => string;
  readonly colors: ReadonlyMap<string, string>;
  readonly resupplyColors: ReadonlyMap<string, string>;
  readonly deliveryNotes: ReadonlyMap<string, DeliveryNoteDrawing>;
}

/** Rend le dossier. */
export function renderDayDossierPdf(
  dossier: DayDossier,
  stamp: DossierStamp,
  print: DossierPrint,
): Promise<Buffer> {
  return render(
    stamp.retakenAt ?? stamp.closedAt,
    `Dossier du jour ${stamp.serviceDay}`,
    (doc) => {
      const pages = new PaperPages(doc);
      const room = (at: number, needed: number): number => pages.room(at, needed);
      drawDossierCover(doc, dossier, stamp.serviceDay, pages.open("Dossier de production"), room, {
        orders: print.colors,
        resupplies: print.resupplyColors,
      });
      for (const group of dossier.recap) {
        drawRecapGroup(doc, group, pages.open(`${group.label} — total à produire`), room);
      }
      dossier.sheets.forEach((order, index) => {
        const rank = `bon ${String(index + 1)}/${String(dossier.sheets.length)}`;
        const top = pages.open(`${order.reference} — Fiche de commande`);
        drawOrder(doc, order, { top, rank, stamp, room }, print);
        const note = print.deliveryNotes.get(order.orderId);
        if (note !== undefined) {
          pages.foreign(note);
        }
      });
      dossier.resupplySheets.forEach((resupply, index) => {
        const rank = `réassort ${String(index + 1)}/${String(dossier.resupplySheets.length)}`;
        const top = pages.open("Fiche de réassort");
        drawResupplySheet(
          doc,
          resupply,
          top,
          lotBanner(stamp),
          rank,
          room,
          print.resupplyColors.get(resupply.siteId) ?? null,
        );
      });
      pages.finish({
        logo: print.logo,
        headerRight: `Lot pour le ${weekdayShortDate(stamp.serviceDay)}`,
        footerLeft: stampLine(stamp),
      });
    },
    true,
  );
}

/** Où et comment dessiner un bon : son haut, son rang, le lot, la page à tourner. */
interface SheetPlace {
  readonly top: number;
  readonly rank: string;
  readonly stamp: DossierStamp;
  readonly room: (at: number, needed: number) => number;
}

/** Le bon d'une commande, puis son QR de colisage s'il y en a un. */
function drawOrder(
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
 *
 * `v6` (2026-10-21, R3d du réassort) : la section « Réassorts » par point, et
 * leurs pièces dans le compte du lot.
 *
 * `v7` (2026-10-21, R3d-bis du réassort) : les fiches de poste comptent
 * commandes + réassorts (« dont N réassort » en détail), et un bon par
 * réassort suit les bons de commande ; la section « Réassorts » est retirée.
 *
 * `v8` (2026-10-21, R1g du réassort) : le bon d'un réassort nommé se titre
 * « Vitrine du matin — Village ».
 *
 * `v9` (2026-10-22, §0 bis du plan de la planche des documents v2) : chaque
 * bon de commande porte la pastille de sa couleur devant sa référence.
 *
 * `v10` (2026-10-22, Hugo) : chaque bon de réassort porte la pastille de la
 * teinte de réassort de son site devant son titre.
 *
 * `v11` (2026-10-25, Hugo) : en-tête au logo sur chaque page, couverture
 * « Dossier de production du … », un rayon par page (« (1/2) » s'il
 * déborde), numéro de page encadré, acheminement « Retrait <site> · pro »
 * derrière la pastille, et le BL de transport derrière chaque bon.
 */
export const DOSSIER_LAYOUT_VERSION = "v11";

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
  const pieces = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  y += 5 * MM;
  putCaps(doc, `À PRÉPARER — ${plural(pieces, "pièce")}`, LEFT, y);
  putCaps(doc, "FAIT", RIGHT - 8 * MM, y);
  y += 6 * MM;
  for (const line of order.lines) {
    y = place.room(y, 10 * MM);
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
function lotBanner(stamp: DossierStamp): string {
  return `LOT POUR LE ${weekdayShortDate(stamp.serviceDay).toUpperCase()}`;
}

/** Le pied : quand le tirage a été arrêté — et complété. */
function stampLine(stamp: DossierStamp): string {
  const arrested = `${signedVerb("Arrêté", stamp.closedBy)} ${parisDateTime(stamp.closedAt)}`;
  const completer = stamp.retakenByName === null ? null : staffSigner("", stamp.retakenByName);
  return stamp.retakenAt === null
    ? arrested
    : `${arrested} — ${signedVerb("complété", completer)} ${parisDateTime(stamp.retakenAt)}`;
}
