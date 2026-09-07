import type { OrderSheet, PricedSheet } from "@lfd/contracts";

import type { PdfLine } from "../../../../platform/pdf/pdf-writer.js";
import { renderTextPdf } from "../../../../platform/pdf/pdf-writer.js";

/**
 * **Le bon de commande en PDF** — l'exemplaire qu'on tend au client.
 *
 * ## Ce qui le distingue des autres rendus
 *
 * Les rendus texte et papier sont des fonctions pures qu'on recalcule à la
 * demande. Celui-ci est **écrit une fois et rangé** : le papier qui est parti du
 * comptoir est un fait, au même titre qu'un prix figé sur une ligne. Recalculer
 * après un avenant donnerait un document qui ne ressemble plus à celui que le
 * client a dans la poche — et c'est exactement la situation où il appelle.
 *
 * D'où la seule propriété qui compte ici : **le rendu est déterministe**. Il ne
 * lit ni horloge ni aléa ; `issuedAt` est l'instant de la révision, porté par la
 * feuille. Deux rendus de la même révision donnent les mêmes octets.
 *
 * ## Ce qu'il ne porte pas
 *
 * **Aucun QR.** Le jeton de remise n'est pas sur la feuille, donc ce rendu ne
 * peut pas l'imprimer — c'est une erreur de compilation, pas une consigne. Deux
 * raisons se rejoignent : le papier d'une livraison voyage dans le carton, où un
 * coursier scannerait son propre colis ; et ce fichier-ci est **archivé sous une
 * clé qui porte la révision**, donc y déposer un secret en ferait une copie
 * permanente dans un stockage objet.
 */

/**
 * Largeur de la colonne d'article, en caractères. Les lignes qui l'utilisent
 * sont en **chasse fixe** : sans ça, les montants arriveraient en escalier, et
 * un tableau de prix qu'on relit deux fois est déjà un doute.
 */
const NAME_WIDTH = 34;

function pad(value: number, width = 3): string {
  return `${String(value)}`.padStart(width, " ");
}

function money(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/** Une ligne du décompte : libellé à gauche, montant cadré à droite. */
function amountRow(label: string, value: string): string {
  return `  ${label.padEnd(NAME_WIDTH + 4, " ")}${value.padStart(11, " ")}`;
}

/** Le total d'unités — ce qu'on recompte à la réception. */
function totalUnits(sheet: OrderSheet): number {
  return sheet.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** L'en-tête : ce que la feuille dit d'elle-même avant de dire son contenu. */
function headerLines(sheet: OrderSheet): readonly PdfLine[] {
  const address = sheet.fulfillment.address;
  return [
    { text: "BON DE COMMANDE", bold: true, size: 16 },
    { text: "" },
    { text: `Commande      : ${sheet.reference}`, bold: true },
    { text: `Passée le     : ${sheet.placedAt.slice(0, 10)}` },
    ...(sheet.requestedFor === null ? [] : [{ text: `Souhaitée le  : ${sheet.requestedFor}` }]),
    {
      text: `Acheminement  : ${sheet.fulfillment.method === "pickup" ? "Retrait" : "Livraison par coursier"}`,
    },
    ...(address === null
      ? []
      : [
          { text: `Adresse       : ${address.ligne1}` },
          ...(address.ligne2 === "" ? [] : [{ text: `                ${address.ligne2}` }]),
          { text: `                ${address.codePostal} ${address.ville}` },
        ]),
  ];
}

/** Le décompte, dans l'ordre où les termes se sont appliqués à la commande. */
function moneyLines(sheet: PricedSheet): readonly PdfLine[] {
  const { money: totals } = sheet;
  return [
    { text: "" },
    { text: "DÉCOMPTE", bold: true },
    { text: amountRow("Sous-total HT", money(totals.subtotalCents)), mono: true },
    ...(totals.discountCents === 0
      ? []
      : [{ text: amountRow("Remise", `−${money(totals.discountCents)}`), mono: true }]),
    ...(totals.deliveryFeeCents === 0
      ? []
      : [{ text: amountRow("Coursier", money(totals.deliveryFeeCents)), mono: true }]),
    // La surtaxe s'ajoute APRÈS la remise : on ne fait pas de geste commercial
    // sur une pénalité de retard.
    ...(totals.lateFeeCents === 0
      ? []
      : [{ text: amountRow("Surtaxe", money(totals.lateFeeCents)), mono: true }]),
    { text: amountRow("TVA", money(totals.vatCents)), mono: true },
    { text: amountRow("Total TTC", money(totals.totalCents)), mono: true, bold: true },
  ];
}

/**
 * Les articles, rendus selon ce que la feuille porte vraiment.
 *
 * La distinction se fait **sur la feuille**, pas sur la ligne : narrower
 * `sheet.audience` à l'intérieur d'un `map` ne narrowe pas l'élément, et le
 * compilateur a raison de le refuser — une ligne d'atelier n'a pas de montant,
 * une ligne de client n'a pas de SKU, et aucune n'a les deux.
 */
function articleLines(sheet: OrderSheet): readonly PdfLine[] {
  const rows: readonly PdfLine[] =
    sheet.audience === "atelier"
      ? sheet.lines.map((line) => ({
          text: `  ${pad(line.quantity)} × ${line.productName.padEnd(NAME_WIDTH, " ")}${line.sku}`,
          mono: true,
        }))
      : sheet.lines.map((line) => ({
          text: `  ${pad(line.quantity)} × ${line.productName.padEnd(NAME_WIDTH, " ")}${money(line.lineTotalCents).padStart(11, " ")}`,
          mono: true,
        }));
  return [
    { text: "" },
    { text: "ARTICLES", bold: true },
    ...rows,
    { text: "" },
    { text: `Total articles : ${String(totalUnits(sheet))}` },
  ];
}

/**
 * Le pied. « **Arrêté** » et non « tiré » : l'instant est celui où la révision
 * est devenue vraie, pas celui de l'impression — deux tirages de la même
 * révision portent donc la même mention, et c'est ce qu'on veut.
 *
 * « Ce n'est pas une facture » sur les exemplaires chiffrés : le seul écart
 * entre les deux pièces est un numéro de série que la plateforme n'a pas, et un
 * document chiffré muet là-dessus sera classé comme une facture par le premier
 * comptable qui le reçoit.
 */
function footerLines(sheet: OrderSheet): readonly PdfLine[] {
  return [
    { text: "" },
    { text: `Arrêté le ${sheet.issuedAt.slice(0, 10)} · révision ${String(sheet.revision)}` },
    ...(sheet.audience === "atelier" ? [] : [{ text: "Ce n'est pas une facture." }]),
    { text: "La Folie Coffee — B2B" },
  ];
}

/** Les lignes du document, avant mise en page. Pure, et donc éprouvable seule. */
export function orderSheetPdfLines(sheet: OrderSheet): readonly PdfLine[] {
  return [
    ...headerLines(sheet),
    ...articleLines(sheet),
    ...(sheet.audience === "atelier" ? [] : moneyLines(sheet)),
    ...(sheet.note === "" ? [] : [{ text: "" }, { text: `Note : ${sheet.note}` }]),
    ...footerLines(sheet),
  ];
}

/** Rend le PDF du bon de commande. Déterministe : mêmes entrées, mêmes octets. */
export function renderOrderSheetPdf(sheet: OrderSheet): Buffer {
  return renderTextPdf(orderSheetPdfLines(sheet));
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
