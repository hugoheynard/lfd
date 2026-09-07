import { Buffer } from "node:buffer";

import type { ClientSheet, OrderSheet, PricedSheet, SheetFulfillment } from "@lfd/contracts";
import PDFDocument from "pdfkit";

/**
 * **Le bon de commande en PDF** — l'exemplaire qu'on tend au client.
 *
 * ## Ce qui le distingue des autres rendus
 *
 * Les rendus texte sont des fonctions pures qu'on recalcule à la demande.
 * Celui-ci est **écrit une fois et rangé** : le papier qui est parti du comptoir
 * est un fait, au même titre qu'un prix figé sur une ligne. Recalculer après un
 * avenant donnerait un document qui ne ressemble plus à celui que le client a
 * dans la poche — et c'est exactement la situation où il appelle.
 *
 * ## La propriété qui décide de tout : le déterminisme
 *
 * L'écriture au premier téléchargement n'a pas de verrou. Deux onglets
 * simultanés entrent tous les deux dans la branche « la clé manque » et écrivent
 * tous les deux ; c'est inoffensif **à une seule condition** — les octets sont
 * identiques, donc le second écrase le premier par le même objet.
 *
 * 🔴 C'est pour ça qu'un générateur avait été écrit à la main : les
 * bibliothèques posent une `/CreationDate` et un `/ID` tirés au moment du rendu.
 * L'argument valait pour un Chromium sans tête ; **il était faux pour `pdfkit`**,
 * et une sonde l'a tranché — dates figées, les octets sont identiques au bit
 * près, et son `/ID` se dérive du contenu. Le générateur maison est parti avec
 * sa table de métriques recopiée à la main : environ 450 lignes.
 *
 * Les dates viennent d'`issuedAt`, l'instant de la **révision**. Ce n'est pas un
 * contournement : la date de création de ce document EST l'instant où sa
 * révision est devenue vraie. `Producer` et `Creator` sont posés en dur pour la
 * même raison — laissés à `pdfkit`, ils porteraient son numéro de version, et
 * une montée de dépendance changerait les octets d'un document déjà archivé.
 *
 * ## Ce qu'il ne porte pas
 *
 * **Aucun QR.** Le jeton de remise n'est pas sur la feuille, donc ce rendu ne
 * peut pas l'imprimer — c'est une erreur de compilation, pas une consigne. Deux
 * raisons se rejoignent : le papier d'une livraison voyage dans le carton, où un
 * coursier scannerait son propre colis ; et ce fichier-ci est **archivé sous une
 * clé qui porte la révision**, donc y déposer un secret en ferait une copie
 * permanente dans un stockage objet.
 *
 * ⚠️ **Les PDF déjà archivés gardent leur dessin d'origine**, et c'est ce que
 * l'archivage promet. Seules les commandes dont le bon n'a jamais été tiré, et
 * les révisions à venir, portent celui-ci.
 */

/** A4 en points PostScript, et le millimètre dans lequel le dessin est spécifié. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MM = PAGE_WIDTH / 210;
const MARGIN_X = 12 * MM;
const MARGIN_Y = 14 * MM;
const CONTENT_LEFT = MARGIN_X;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

/** Les colonnes du tableau, telles que la référence les pose. */
const COL_QTY = 16 * MM;
const COL_SKU = 26 * MM;
const COL_UNIT = 22 * MM;
const COL_TOTAL = 26 * MM;
const X_NAME = CONTENT_LEFT + COL_QTY;
const X_SKU_RIGHT = CONTENT_RIGHT - COL_UNIT - COL_TOTAL;
const X_UNIT_RIGHT = CONTENT_RIGHT - COL_TOTAL;

/** Le gris des filets entre deux articles. Les filets de bloc restent noirs. */
const ROW_GRAY = "#999999";
const BLACK = "#000000";

const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/**
 * Une date ISO → « 2 septembre 2026 ».
 *
 * Découpée à la main plutôt que par `Intl` : le rendu doit être **identique**
 * quelle que soit la machine, et `Intl` dépend des données de locale de l'hôte.
 * Un document archivé ne peut pas changer de forme parce qu'un conteneur a été
 * reconstruit sur une autre image de base.
 */
function longDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const name = MONTHS[Number(month) - 1];
  if (year === undefined || day === undefined || name === undefined) {
    return iso.slice(0, 10);
  }
  return `${String(Number(day))} ${name} ${year}`;
}

/**
 * Le signe d'un montant négatif.
 *
 * 🔴 C'était « − » (U+2212, le vrai signe moins mathématique), et il **n'existe
 * pas en WinAnsi** — l'encodage que les polices standard du PDF déclarent. Il
 * sortait en guillemet : « Remise " 58,90 € ». Le générateur maison le
 * traduisait en trait d'union à l'encodage ; `pdfkit` ne le fait pas, et c'est
 * une conversion qu'on ne remarque qu'à l'œil.
 *
 * Le trait d'union ASCII est donc écrit tel quel : il traverse n'importe quel
 * encodage, et sur un document comptable un signe faux vaut moins qu'un signe
 * moins élégant.
 */
const MINUS = "-";

/** Des centimes → « 1 284,60 € », avec l'espace des milliers. */
function money(cents: number): string {
  const [units, decimals] = Math.abs(cents / 100)
    .toFixed(2)
    .split(".");
  const grouped = (units ?? "0").replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
  return `${cents < 0 ? `${MINUS} ` : ""}${grouped},${decimals ?? "00"} €`;
}

/**
 * Un prix **unitaire** vit en millicentimes : 1 € = 100 000.
 *
 * 🔴 Cette fonction divisait par 10 — elle affichait donc **cent fois** le prix.
 * La faute n'est pas l'erreur de facteur, c'est d'avoir refait l'arithmétique de
 * l'argent au lieu d'appeler ce qui fait autorité : `MILLICENTS_PER_CENT` vaut
 * 1 000 dans `@lfd/money`, et le front divise par 100 000 pour obtenir des euros.
 *
 * Deux à cinq décimales, comme `formatMillicents` côté front : un prix unitaire
 * dérivé d'une remise n'est pas rond, et l'arrondir au centime ferait que
 * `PU × quantité` ne retombe plus sur le total de ligne — un client le refait à
 * la calculatrice, et il a raison de le faire.
 *
 * ⚠️ Jumeau volontaire de `formatMillicents` (`@lfd/b2b-ui`), qui est Angular et
 * que le serveur ne peut pas importer. `Intl` est écarté ici pour la raison qui
 * vaut partout dans ce fichier : il dépend des données de locale de l'hôte, et
 * ce document est archivé.
 */
function unitPrice(millicents: number): string {
  const abs = Math.abs(millicents);
  const units = Math.trunc(abs / 100_000);
  const rest = String(abs % 100_000).padStart(5, "0");
  const trimmed = rest.replace(/0+$/u, "");
  const decimals = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
  return `${millicents < 0 ? `${MINUS} ` : ""}${grouped},${decimals} €`;
}

/** « Retrait au laboratoire » / « Livraison par coursier ». */
function methodLabel(fulfillment: SheetFulfillment): string {
  return fulfillment.method === "pickup" ? "Retrait au laboratoire" : "Livraison par coursier";
}

/**
 * Les lignes du bloc d'acheminement, dans l'ordre où on les lit.
 *
 * Le **créneau** y figure : c'est l'heure à laquelle le client doit être là, ou
 * celle à laquelle le coursier passe. Une feuille qui dit le lieu sans dire
 * l'heure oblige à rouvrir l'application pour la seule information qui décide de
 * la journée.
 */
function fulfillmentLines(fulfillment: SheetFulfillment): readonly string[] {
  const address = fulfillment.address;
  const window = fulfillment.window;
  return [
    ...(fulfillment.pickupLabel === null ? [] : [fulfillment.pickupLabel]),
    ...(address === null
      ? []
      : [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`]),
    // `start` peut manquer — « avant 8 h » est une fenêtre valide, et la rendre
    // « null – 08:00 » serait pire que de ne rien dire.
    ...(window === null
      ? []
      : [window.start === null ? `Avant ${window.end}` : `${window.start} – ${window.end}`]),
    ...(fulfillment.contact === null
      ? []
      : [`${fulfillment.contact.name} · ${fulfillment.contact.phone}`]),
  ].filter((line) => line !== "");
}

/** Le document en cours de dessin. `pdfkit` tient la plume, on tient le plan. */
type Doc = PDFKit.PDFDocument;

interface TextOptions {
  readonly size: number;
  readonly bold?: boolean;
  readonly width?: number;
}

/** Pose un texte à une position absolue. `lineBreak: false` sauf largeur donnée. */
function put(doc: Doc, text: string, x: number, y: number, options: TextOptions): void {
  doc
    .font(options.bold === true ? BOLD : REGULAR)
    .fontSize(options.size)
    .fillColor(BLACK)
    .text(
      text,
      x,
      y,
      options.width === undefined ? { lineBreak: false } : { width: options.width },
    );
}

/**
 * Un texte cadré à DROITE sur `right`.
 *
 * La largeur est **mesurée par `pdfkit`** (`widthOfString`), ce qui est tout
 * l'intérêt de la bascule : la version précédente portait une table de 190
 * largeurs de glyphes recopiée à la main, avec ses cas d'accents et ses
 * exceptions. Une table recopiée est une table qui se trompe un jour.
 */
function putRight(
  doc: Doc,
  text: string,
  right: number,
  y: number,
  size: number,
  bold = false,
): void {
  const width = doc
    .font(bold ? BOLD : REGULAR)
    .fontSize(size)
    .widthOfString(text);
  put(doc, text, right - width, y, { size, bold });
}

/**
 * Une petite capitale espacée — « CLIENT », « ACHEMINEMENT ».
 *
 * `characterSpacing` est ce que la maquette appelle `letter-spacing` ; sans lui
 * ces libellés se lisent comme un mot compact.
 */
function putCaps(doc: Doc, text: string, x: number, y: number): void {
  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(BLACK)
    .text(text, x, y, { lineBreak: false, characterSpacing: 0.7 });
}

/** Un filet horizontal. La couleur est REMISE à noir : l'état graphique est global. */
function bar(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  thickness: number,
  color = BLACK,
): void {
  doc.save().rect(x, y, width, thickness).fill(color).restore();
  doc.fillColor(BLACK);
}

/** Un filet sur toute la largeur utile. */
function rule(doc: Doc, y: number, thickness: number, color = BLACK): void {
  bar(doc, CONTENT_LEFT, y, CONTENT_WIDTH, thickness, color);
}

/** L'en-tête : le titre, la référence, les dates, la mention de l'exemplaire. */
function header(doc: Doc, sheet: PricedSheet): number {
  let y = MARGIN_Y;
  put(doc, "BON DE COMMANDE", CONTENT_LEFT, y, { size: 16, bold: true });
  putRight(doc, `Passée le ${longDate(sheet.placedAt)}`, CONTENT_RIGHT, y + 3, 10);
  y += 5.5 * MM;
  put(doc, sheet.reference, CONTENT_LEFT, y, { size: 13, bold: true });
  if (sheet.requestedFor !== null) {
    putRight(doc, `Souhaitée le ${longDate(sheet.requestedFor)}`, CONTENT_RIGHT, y, 10);
  }
  y += 5 * MM;
  putRight(doc, "EXEMPLAIRE CHIFFRÉ", CONTENT_RIGHT, y, 9, true);
  y += 5 * MM;
  rule(doc, y, 2);
  return y + 2;
}

/** Les deux blocs de tête : à qui, et par quelle voie. */
function parties(doc: Doc, sheet: ClientSheet, top: number): number {
  const half = CONTENT_LEFT + CONTENT_WIDTH / 2;
  const y = top + 5 * MM;
  putCaps(doc, "CLIENT", CONTENT_LEFT, y);
  putCaps(doc, "ACHEMINEMENT", half, y);
  const body = y + 5 * MM;
  put(doc, sheet.customer.tradeName, CONTENT_LEFT, body, { size: 13, bold: true });
  put(doc, methodLabel(sheet.fulfillment), half, body, { size: 12, bold: true });

  // La raison sociale n'est répétée que si elle diffère de l'enseigne : sinon on
  // écrirait deux fois le même nom, l'un sous l'autre.
  if (sheet.customer.legalName !== sheet.customer.tradeName) {
    put(doc, sheet.customer.legalName, CONTENT_LEFT, body + 5.5 * MM, { size: 10 });
  }

  let right = body + 5.5 * MM;
  for (const line of fulfillmentLines(sheet.fulfillment)) {
    put(doc, line, half, right, { size: 11 });
    right += 4.4 * MM;
  }
  const bottom = right + 2 * MM;
  rule(doc, bottom, 1);
  return bottom + 1;
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
  putRight(doc, "SKU", X_SKU_RIGHT, y, 9);
  putRight(doc, "PU HT", X_UNIT_RIGHT, y, 9);
  putRight(doc, "Total HT", CONTENT_RIGHT, y, 9);
  const bottom = y + 4 * MM;
  rule(doc, bottom, 1);
  return bottom + 1;
}

/** Une ligne d'article, filet compris. Rend le bas de la ligne. */
function articleRow(doc: Doc, line: ClientSheet["lines"][number], top: number): number {
  const labels = line.priceLabels.join(" · ");
  const y = top + 4.6 * MM;
  put(doc, String(line.quantity), CONTENT_LEFT, y - 1.2 * MM, { size: 14, bold: true });
  // Le nom est BORNÉ à sa colonne : `pdfkit` l'habille plutôt que de le laisser
  // courir sous le SKU. C'est ce qu'une mesure à la main ne savait pas faire.
  put(doc, line.productName, X_NAME, y, {
    size: 11.5,
    width: X_SKU_RIGHT - COL_SKU - X_NAME,
  });
  putRight(doc, line.sku, X_SKU_RIGHT, y + 0.8 * MM, 8.5);
  putRight(doc, unitPrice(line.unitPriceMillicents), X_UNIT_RIGHT, y, 10.5);
  putRight(doc, money(line.lineTotalCents), CONTENT_RIGHT, y, 10.5, true);

  let bottom = y + 4.6 * MM;
  if (labels !== "") {
    // Les libellés tarifaires sous le nom : ce sont eux qui expliquent un prix
    // qui n'est pas celui du catalogue, et un client qui ne les voit pas appelle.
    //
    // ⚠️ Posés SOUS la ligne de base du nom, pas dessus : à −1,6 mm ils la
    // chevauchaient, et deux textes superposés ne se lisent ni l'un ni l'autre.
    put(doc, labels, X_NAME, bottom + 0.4 * MM, { size: 8.5 });
    bottom += 4 * MM;
  }
  rule(doc, bottom, 0.6, ROW_GRAY);
  return bottom + 0.6;
}

/** Les lignes du pavé de totaux, dans l'ordre où la référence les pose. */
function totalRows(
  sheet: PricedSheet,
): readonly { label: string; value: string; rule?: boolean; strong?: boolean }[] {
  const totals = sheet.money;
  const net = Math.max(0, totals.subtotalCents - totals.discountCents);
  return [
    { label: "Sous-total", value: money(totals.subtotalCents) },
    ...(totals.discountCents === 0
      ? []
      : [{ label: "Remise", value: money(-totals.discountCents) }]),
    ...(totals.deliveryFeeCents === 0
      ? []
      : [{ label: "Livraison", value: money(totals.deliveryFeeCents) }]),
    // La surtaxe s'ajoute APRÈS la remise : on ne fait pas de geste commercial
    // sur une pénalité de retard.
    ...(totals.lateFeeCents === 0
      ? []
      : [{ label: "Surtaxe de commande tardive", value: money(totals.lateFeeCents) }]),
    {
      label: "Total avant TVA",
      value: money(net + totals.deliveryFeeCents + totals.lateFeeCents),
      rule: true,
    },
    // Le détail par taux vient de la COMMANDE, qui l'a figé. `null` = commande
    // antérieure au gel : on dit le total, ce qui est vrai, plutôt qu'un détail
    // reconstitué qui pourrait ne pas être celui qu'on a facturé.
    ...(totals.vatShares === null
      ? [{ label: "dont TVA", value: money(totals.vatCents) }]
      : totals.vatShares.map((share) => ({
          label: `dont TVA ${String(share.rate).replace(".", ",")} %`,
          value: money(share.amountCents),
        }))),
    { label: "Total TTC", value: money(totals.totalCents), rule: true, strong: true },
  ];
}

/** Le pavé de totaux, cadré à droite, et la mention qui l'accompagne. */
function totals(doc: Doc, sheet: ClientSheet, top: number): number {
  const blockLeft = CONTENT_RIGHT - 78 * MM;
  let y = top + 5 * MM;
  put(doc, "Exemplaire chiffré — destiné au client et à sa comptabilité.", CONTENT_LEFT, y, {
    size: 9,
    width: blockLeft - CONTENT_LEFT - 6 * MM,
  });
  for (const row of totalRows(sheet)) {
    if (row.rule === true) {
      bar(doc, blockLeft, y, CONTENT_RIGHT - blockLeft, 1);
      y += 2 * MM;
    }
    put(doc, row.label, blockLeft, y, { size: 10.5, bold: row.strong === true });
    putRight(doc, row.value, CONTENT_RIGHT, y, 11, row.strong === true);
    y += 5 * MM;
  }
  return y;
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
 * est devenue vraie, pas celui de l'impression — deux tirages de la même
 * révision portent donc la même mention, et c'est ce qu'on veut.
 *
 * « Ce n'est pas une facture » n'est pas une précaution de juriste : le seul
 * écart entre les deux pièces est un numéro de série que la plateforme n'a pas,
 * et un document chiffré muet là-dessus sera classé comme une facture par le
 * premier comptable qui le reçoit.
 */
function footer(doc: Doc, sheet: ClientSheet, top: number): void {
  let y = top + 4 * MM;
  rule(doc, y, 1);
  y += 3 * MM;
  put(doc, "Ce n'est pas une facture.", CONTENT_LEFT, y, { size: 9, bold: true });
  putRight(doc, "Reçu par : ______________", CONTENT_RIGHT, y, 9);
  y += 4 * MM;
  put(
    doc,
    "Aucun numéro de série, aucune mention légale : la facture est émise séparément.",
    CONTENT_LEFT,
    y,
    { size: 9 },
  );
  putRight(doc, "La Folie Coffee — B2B", CONTENT_RIGHT, y, 9);
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
 * Dessine le bon dans un document ouvert.
 *
 * La pagination est **ici** et non chez `pdfkit` : lui saurait ajouter une page
 * dès que le curseur déborde, mais pas qu'on ne doit couper ni entre une ligne
 * et son filet, ni juste avant les totaux.
 */
function draw(doc: Doc, sheet: ClientSheet): void {
  let y = tableHead(doc, sheet, parties(doc, sheet, header(doc, sheet)), true);

  for (const line of sheet.lines) {
    if (y > PAGE_HEIGHT - MARGIN_Y - ROW_SPACE - TAIL_SPACE) {
      doc.addPage();
      y = tableHead(doc, sheet, MARGIN_Y - 5 * MM, false);
    }
    y = articleRow(doc, line, y);
  }

  if (y > PAGE_HEIGHT - MARGIN_Y - TAIL_SPACE) {
    doc.addPage();
    y = MARGIN_Y;
  }
  footer(doc, sheet, note(doc, sheet, totals(doc, sheet, y)));
}

/**
 * Rend le PDF du bon de commande. **Déterministe** : mêmes entrées, mêmes octets.
 *
 * Asynchrone parce que `pdfkit` écrit dans un flux ; le handler qui l'appelle
 * l'était déjà, et c'est le seul prix de la bascule.
 */
export async function renderOrderSheetPdf(sheet: ClientSheet): Promise<Buffer> {
  const issued = new Date(sheet.issuedAt);
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    // 🔴 Les dates sortent de la RÉVISION, pas de l'horloge ; `Producer` et
    // `Creator` sont posés en dur pour que le numéro de version de `pdfkit`
    // n'entre pas dans les octets. Sans ça, une montée de dépendance changerait
    // un document déjà archivé — et l'écriture sans verrou cesserait d'être sûre.
    info: {
      Title: `Bon de commande ${sheet.reference}`,
      Author: "La Folie Coffee",
      Producer: "La Folie Coffee",
      Creator: "La Folie Coffee",
      CreationDate: issued,
      ModDate: issued,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => {
    doc.on("end", () => {
      resolve();
    });
  });
  draw(doc, sheet);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/**
 * La **clé de rangement**, et la révision y figure.
 *
 * Le port du stockage dit qu'« une même clé écrase : c'est ce qui fait qu'un
 * remplacement reste un remplacement ». Un chemin sans révision ferait donc
 * disparaître, au premier avenant, le PDF qui circule déjà — le seul document
 * que le client peut opposer. Chaque révision garde le sien.
 *
 * La clé ne vient jamais du client : elle se dérive d'identifiants vérifiés.
 */
export function orderSheetPdfKey(sheet: OrderSheet): string {
  return `orders/${sheet.orderId}/bon-de-commande-r${String(sheet.revision)}.pdf`;
}

/** Le nom proposé au téléchargement — lisible sur un bureau, pas une clé opaque. */
export function orderSheetPdfFileName(sheet: OrderSheet): string {
  return `bon-de-commande-${sheet.reference}.pdf`;
}
