import type { Buffer } from "node:buffer";

import type { ClientSheet, OrderSheet, SheetFulfillment } from "@lfd/contracts";

import {
  type Doc,
  drawQr,
  LEFT as CONTENT_LEFT,
  longDate,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  put,
  putCaps,
  putRight,
  render,
  RIGHT as CONTENT_RIGHT,
  ROW_GRAY,
  rule,
  WIDTH as CONTENT_WIDTH,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { sheetShowsTtc } from "./order-sheet.js";
import { money, unitPrice } from "./order-sheet-pdf-format.js";
import { PRETAX_ONLY_NOTE, totalRows } from "./order-sheet-pdf-totals.js";

/**
 * **Le bon de commande en PDF** — l'exemplaire qu'on tend au client.
 *
 * ## Ce qui le distingue des autres rendus
 *
 * Les rendus texte sont des fonctions pures qu'on recalcule à la demande.
 * Celui-ci est **écrit une fois et rangé** : le papier qui est parti du comptoir
 * est un fait, au même titre qu'un prix figé sur une ligne.
 *
 * ## La propriété qui décide de tout : le déterminisme
 *
 * Deux écritures concurrentes sous la même clé sont inoffensives **à une seule
 * condition** — les octets sont identiques, donc la seconde écrase la première
 * par le même objet. Les dates viennent d'`issuedAt`, l'instant de la
 * **révision** ; `Producer` et `Creator` sont posés en dur par la trousse
 * (`paper-pdf-kit.ts`) pour qu'une montée de `pdfkit` ne change pas les octets
 * d'un document déjà archivé. Le QR est dessiné en carrés pleins, le logo est
 * un fichier du dépôt : mêmes entrées, mêmes octets.
 *
 * ## Deux bons : pro et public
 *
 * `sheet.variant` (plan `documentation/order/plan-bon-public.md`, Hugo,
 * 2026-10-09). Le bon **public** — une commande sans société — ne porte ni
 * colonne de référence, ni hors taxe, ni révision, ni phrase sur les mentions
 * légales : un particulier lit un prix taxe comprise, et le téléphone de
 * l'acheteur sous son nom. Le bon **pro** garde son dessin (F5 compris).
 *
 * ## Le QR de retrait — réécrit le 2026-10-09
 *
 * Ce paragraphe disait « **Aucun QR** » : le jeton n'était pas sur la feuille,
 * et l'archive en aurait fait une copie permanente. Hugo a tranché l'inverse le
 * 2026-10-09 : le QR entre dans le bon, **retrait seulement**. Ce qui tient
 * encore de l'ancienne règle :
 *
 * - le jeton n'est toujours **pas sur la feuille** : l'URL arrive en second
 *   argument, comme pour le courriel, et le rendu ne la dessine qu'en
 *   `pickup` — le papier d'une livraison voyage dans le carton, où un
 *   coursier scannerait son propre colis ;
 * - **le risque accepté** : le PDF archivé porte le jeton, dans le stockage
 *   privé des documents client. Le QR n'élargit aucun droit — il ouvre
 *   `/retrait/<jeton>` du back-office, qui exige un membre du staff connecté
 *   avec le droit du retrait, et le client l'a déjà dans son courriel. Un
 *   second retrait est refusé par l'état de la commande :
 *   `OrderHandover.attest` (`handover/domain/entities/order-handover.ts`) lève
 *   sur une commande déjà retirée, et `PrismaOrderHandoverRepository.attest`
 *   ferme la course par l'unicité en base (vérifié le 2026-10-09 ; le
 *   `markHandedOver` que cite le plan n'existe plus côté commerce).
 *
 * ⚠️ **Les PDF déjà archivés gardent leur dessin d'origine**, sous leur
 * ancienne clé : le nouveau dessin a la sienne (`-d2`, cf. `orderSheetPdfKey`).
 */

/** Ce que le rendu reçoit à côté de la feuille — jamais dedans. */
export interface OrderSheetArt {
  /** Le logo de l'en-tête, en octets PNG. */
  readonly logo: Buffer;
  /**
   * L'URL du QR de retrait (`handoverUrlOf`), ou `""` : pas de jeton, pas
   * d'origine admin. Ignorée hors retrait.
   */
  readonly handoverUrl: string;
}

/** Les colonnes du tableau, telles que la référence les pose. */
const COL_QTY = 16 * MM;
const COL_SKU = 26 * MM;
const COL_UNIT = 22 * MM;
const COL_TOTAL = 26 * MM;
const X_NAME = CONTENT_LEFT + COL_QTY;
const X_SKU_RIGHT = CONTENT_RIGHT - COL_UNIT - COL_TOTAL;
const X_UNIT_RIGHT = CONTENT_RIGHT - COL_TOTAL;

const LOGO_SIZE = 18 * MM;
const QR_SIZE = 30 * MM;

/** La légende du QR — ce qu'on fait du papier au comptoir. */
export const HANDOVER_QR_CAPTION = "À présenter au retrait";

/** « Retrait au laboratoire » / « Livraison par coursier ». */
function methodLabel(fulfillment: SheetFulfillment): string {
  return fulfillment.method === "pickup" ? "Retrait au laboratoire" : "Livraison par coursier";
}

/**
 * Les lignes du bloc d'acheminement, dans l'ordre où on les lit. Le **créneau**
 * y figure : une feuille qui dit le lieu sans dire l'heure oblige à rouvrir
 * l'application pour la seule information qui décide de la journée.
 */
function fulfillmentLines(fulfillment: SheetFulfillment): readonly string[] {
  const address = fulfillment.address;
  const window = fulfillment.window;
  return [
    ...(fulfillment.pickupLabel === null ? [] : [fulfillment.pickupLabel]),
    ...(address === null
      ? []
      : [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`]),
    // `start` peut manquer — « avant 8 h » est une fenêtre valide.
    ...(window === null
      ? []
      : [window.start === null ? `Avant ${window.end}` : `${window.start} – ${window.end}`]),
    ...(fulfillment.contact === null
      ? []
      : [`${fulfillment.contact.name} · ${fulfillment.contact.phone}`]),
  ].filter((line) => line !== "");
}

/**
 * L'en-tête : le logo à gauche, le titre et la référence à sa droite, les
 * dates cadrées à droite. Le logo dit qui émet — « La Folie Coffee — B2B » et
 * « EXEMPLAIRE CHIFFRÉ » sont retirés (Hugo, 2026-10-09).
 */
function header(doc: Doc, sheet: ClientSheet, logo: Buffer): number {
  const top = MARGIN_Y;
  doc.image(logo, CONTENT_LEFT, top, { fit: [LOGO_SIZE, LOGO_SIZE] });
  const titleX = CONTENT_LEFT + LOGO_SIZE + 5 * MM;
  const y = top + 3 * MM;
  put(doc, "BON DE COMMANDE", titleX, y, { size: 16, bold: true });
  putRight(doc, `Passée le ${longDate(sheet.placedAt)}`, CONTENT_RIGHT, y + 3, 10);
  put(doc, sheet.reference, titleX, y + 7 * MM, { size: 13, bold: true });
  if (sheet.requestedFor !== null) {
    putRight(doc, `Souhaitée le ${longDate(sheet.requestedFor)}`, CONTENT_RIGHT, y + 7 * MM, 10);
  }
  const bottom = top + LOGO_SIZE + 2 * MM;
  rule(doc, bottom, 2);
  return bottom + 2;
}

/**
 * Le bloc client. Pro : l'enseigne, et la raison sociale si elle diffère.
 * Public : le nom de la personne, et son téléphone s'il en a un.
 */
function customerBlock(doc: Doc, sheet: ClientSheet, body: number): void {
  const name = sheet.variant === "public" ? sheet.customer.legalName : sheet.customer.tradeName;
  put(doc, name, CONTENT_LEFT, body, { size: 13, bold: true });
  const second =
    sheet.variant === "public"
      ? sheet.customerPhone === null
        ? null
        : `Tél. ${sheet.customerPhone}`
      : // Répétée seulement si elle diffère : sinon deux fois le même nom.
        sheet.customer.legalName === sheet.customer.tradeName
        ? null
        : sheet.customer.legalName;
  if (second !== null) {
    put(doc, second, CONTENT_LEFT, body + 5.5 * MM, { size: 10 });
  }
}

/** Les deux blocs de tête : à qui, et par quelle voie. */
function parties(doc: Doc, sheet: ClientSheet, top: number): number {
  const half = CONTENT_LEFT + CONTENT_WIDTH / 2;
  const y = top + 5 * MM;
  putCaps(doc, "CLIENT", CONTENT_LEFT, y);
  putCaps(doc, "ACHEMINEMENT", half, y);
  const body = y + 5 * MM;
  customerBlock(doc, sheet, body);
  put(doc, methodLabel(sheet.fulfillment), half, body, { size: 12, bold: true });

  let right = body + 5.5 * MM;
  for (const line of fulfillmentLines(sheet.fulfillment)) {
    put(doc, line, half, right, { size: 11 });
    right += 4.4 * MM;
  }
  const bottom = Math.max(right, body + 11 * MM) + 2 * MM;
  rule(doc, bottom, 1);
  return bottom + 1;
}

/** Le bon public n'a pas de colonne de référence (liste validée, 2026-10-09). */
function showsSku(sheet: ClientSheet): boolean {
  return sheet.variant === "pro";
}

/** L'annonce du tableau, puis sa barre de titres. */
function tableHead(doc: Doc, sheet: ClientSheet, top: number, withHeading: boolean): number {
  let y = top + 5 * MM;
  if (withHeading) {
    const pieces = sheet.lines.reduce((sum, line) => sum + line.quantity, 0);
    const count = sheet.lines.length;
    const lineWord = count > 1 ? "lignes" : "ligne";
    const pieceWord = pieces > 1 ? "pièces" : "pièce";
    putCaps(
      doc,
      `ARTICLES — ${String(count)} ${lineWord}, ${String(pieces)} ${pieceWord}`,
      CONTENT_LEFT,
      y,
    );
    y += 5 * MM;
  }
  putCaps(doc, "Qté", CONTENT_LEFT, y);
  putCaps(doc, "Article", X_NAME, y);
  if (showsSku(sheet)) {
    putRight(doc, "SKU", X_SKU_RIGHT, y, 9);
  }
  // 🔴 **Les titres suivent les montants, dans le même geste** (R3, 2026-09-21).
  const ttc = sheetShowsTtc(sheet);
  putRight(doc, ttc ? "PU TTC" : "PU HT", X_UNIT_RIGHT, y, 9);
  putRight(doc, ttc ? "Total TTC" : "Total HT", CONTENT_RIGHT, y, 9);
  const bottom = y + 4 * MM;
  rule(doc, bottom, 1);
  return bottom + 1;
}

/** Une ligne d'article, filet compris. Rend le bas de la ligne. */
function articleRow(
  doc: Doc,
  sheet: ClientSheet,
  line: ClientSheet["lines"][number],
  top: number,
): number {
  const ttc = sheetShowsTtc(sheet);
  const labels = line.priceLabels.join(" · ");
  const y = top + 4.6 * MM;
  put(doc, String(line.quantity), CONTENT_LEFT, y - 1.2 * MM, { size: 14, bold: true });
  // Le nom est BORNÉ à sa colonne ; sans SKU, la colonne s'étend jusqu'au prix.
  const nameRight = showsSku(sheet) ? X_SKU_RIGHT - COL_SKU : X_SKU_RIGHT - 2 * MM;
  put(doc, line.productName, X_NAME, y, { size: 11.5, width: nameRight - X_NAME });
  if (showsSku(sheet)) {
    putRight(doc, line.sku, X_SKU_RIGHT, y + 0.8 * MM, 8.5);
  }
  // Le hors taxe est en millicentimes et garde ses décimales, le taxe compris
  // est en centimes : c'est un montant que la vitrine a déjà arrêté.
  putRight(
    doc,
    ttc && line.unitPriceTtcCents !== null
      ? money(line.unitPriceTtcCents)
      : unitPrice(line.unitPriceMillicents),
    X_UNIT_RIGHT,
    y,
    10.5,
  );
  putRight(
    doc,
    money(ttc && line.lineTotalTtcCents !== null ? line.lineTotalTtcCents : line.lineTotalCents),
    CONTENT_RIGHT,
    y,
    10.5,
    true,
  );

  let bottom = y + 4.6 * MM;
  if (labels !== "") {
    // Les libellés tarifaires SOUS le nom : ce sont eux qui expliquent un prix
    // qui n'est pas celui du catalogue.
    put(doc, labels, X_NAME, bottom + 0.4 * MM, { size: 8.5 });
    bottom += 4 * MM;
  }
  rule(doc, bottom, 0.6, ROW_GRAY);
  return bottom + 0.6;
}

/**
 * Le QR de retrait, à gauche du pavé de totaux — seulement en retrait et avec
 * une URL. Rend le bas du bloc, ou `top` s'il n'y en a pas.
 */
function handoverQr(doc: Doc, sheet: ClientSheet, handoverUrl: string, top: number): number {
  if (sheet.fulfillment.method !== "pickup" || handoverUrl === "") {
    return top;
  }
  drawQr(doc, handoverUrl, CONTENT_LEFT, top, QR_SIZE);
  const caption = top + QR_SIZE + 2 * MM;
  put(doc, HANDOVER_QR_CAPTION, CONTENT_LEFT, caption, { size: 9, bold: true });
  put(doc, sheet.reference, CONTENT_LEFT, caption + 4 * MM, { size: 9 });
  return caption + 8 * MM;
}

/** Le pavé de totaux, cadré à droite, la mention F5, et le QR à gauche. */
function totals(doc: Doc, sheet: ClientSheet, handoverUrl: string, top: number): number {
  const blockLeft = CONTENT_RIGHT - 78 * MM;
  let y = top + 5 * MM;
  const qrBottom = handoverQr(doc, sheet, handoverUrl, y);
  for (const row of totalRows(sheet)) {
    if (row.rule === true) {
      doc
        .save()
        .rect(blockLeft, y, CONTENT_RIGHT - blockLeft, 1)
        .fill()
        .restore();
      y += 2 * MM;
    }
    put(doc, row.label, blockLeft, y, { size: 10.5, bold: row.strong === true });
    putRight(doc, row.value, CONTENT_RIGHT, y, 11, row.strong === true);
    y += 5 * MM;
  }
  if (sheet.variant === "pro" && sheet.money.settlement === "account") {
    put(doc, PRETAX_ONLY_NOTE, blockLeft, y, { size: 9 });
    y += 5 * MM;
  }
  return Math.max(y, qrBottom);
}

/** La note du client, si elle existe. `pdfkit` l'habille dans la largeur utile. */
function note(doc: Doc, sheet: ClientSheet, top: number): number {
  if (sheet.note === "") {
    return top;
  }
  const y = top + 3 * MM;
  putCaps(doc, "NOTE", CONTENT_LEFT, y);
  put(doc, sheet.note, CONTENT_LEFT, y + 4.8 * MM, { size: 11, width: CONTENT_WIDTH });
  return doc.y + 2 * MM;
}

/**
 * Le pied. « **Arrêté** » et non « tiré » : l'instant est celui où la révision
 * est devenue vraie, pas celui de l'impression.
 *
 * « Ce n'est pas une facture » reste pour tous : un document chiffré muet
 * là-dessus sera classé comme une facture par le premier comptable qui le
 * reçoit. Le bon public s'arrête là, avec sa date — sans révision ni phrase sur
 * les mentions légales. « Reçu par » est retiré pour tous (Hugo, 2026-10-09).
 */
function footer(doc: Doc, sheet: ClientSheet, top: number): void {
  let y = top + 4 * MM;
  rule(doc, y, 1);
  y += 3 * MM;
  put(doc, "Ce n'est pas une facture.", CONTENT_LEFT, y, { size: 9, bold: true });
  y += 4 * MM;
  if (sheet.variant === "public") {
    put(doc, `Arrêté le ${longDate(sheet.issuedAt)}`, CONTENT_LEFT, y, { size: 9 });
    return;
  }
  put(
    doc,
    "Aucun numéro de série, aucune mention légale : la facture est émise séparément.",
    CONTENT_LEFT,
    y,
    { size: 9 },
  );
  y += 4 * MM;
  put(
    doc,
    `Arrêté le ${longDate(sheet.issuedAt)} · révision ${String(sheet.revision)}`,
    CONTENT_LEFT,
    y,
    { size: 9 },
  );
}

/** Ce qu'il faut de place pour ne pas séparer le tableau de son pavé de totaux. */
const TAIL_SPACE = 70 * MM;
const ROW_SPACE = 12 * MM;

/**
 * Dessine le bon dans un document ouvert. La pagination est **ici** : `pdfkit`
 * saurait ajouter une page, pas qu'on ne coupe ni entre une ligne et son filet,
 * ni juste avant les totaux.
 */
function draw(doc: Doc, sheet: ClientSheet, art: OrderSheetArt): void {
  let y = tableHead(doc, sheet, parties(doc, sheet, header(doc, sheet, art.logo)), true);

  for (const line of sheet.lines) {
    if (y > PAGE_HEIGHT - MARGIN_Y - ROW_SPACE - TAIL_SPACE) {
      doc.addPage();
      y = tableHead(doc, sheet, MARGIN_Y - 5 * MM, false);
    }
    y = articleRow(doc, sheet, line, y);
  }

  if (y > PAGE_HEIGHT - MARGIN_Y - TAIL_SPACE) {
    doc.addPage();
    y = MARGIN_Y;
  }
  footer(doc, sheet, note(doc, sheet, totals(doc, sheet, art.handoverUrl, y)));
}

/**
 * Rend le PDF du bon de commande. **Déterministe** : mêmes entrées, mêmes octets.
 * Les dates sortent de la RÉVISION, pas de l'horloge.
 */
export async function renderOrderSheetPdf(sheet: ClientSheet, art: OrderSheetArt): Promise<Buffer> {
  return render(new Date(sheet.issuedAt), `Bon de commande ${sheet.reference}`, (doc) => {
    draw(doc, sheet, art);
  });
}

/**
 * La version du **dessin**, dans la clé. Le bon du 2026-10-09 (logo, bon
 * public, QR) est le deuxième ; les PDF rangés avant restent en stockage sous
 * leur ancienne clé (`…-r<rev>.pdf`), jamais supprimés et plus jamais relus.
 */
const DRAWING_VERSION = 2;

/**
 * La **clé de rangement** : la révision et la version de dessin y figurent.
 *
 * Le port du stockage dit qu'« une même clé écrase ». Un chemin sans révision
 * ferait donc disparaître, au premier avenant, le PDF qui circule déjà ; un
 * chemin sans version de dessin servirait l'ancien dessin à jamais.
 *
 * La clé ne vient jamais du client : elle se dérive d'identifiants vérifiés.
 */
export function orderSheetPdfKey(sheet: OrderSheet): string {
  return `orders/${sheet.orderId}/bon-de-commande-r${String(sheet.revision)}-d${String(DRAWING_VERSION)}.pdf`;
}

/** Le nom proposé au téléchargement — lisible sur un bureau, pas une clé opaque. */
export function orderSheetPdfFileName(sheet: OrderSheet): string {
  return `bon-de-commande-${sheet.reference}.pdf`;
}
