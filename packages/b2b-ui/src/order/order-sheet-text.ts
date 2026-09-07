import type {
  AtelierSheetLine,
  ClientSheetLine,
  OrderSheet,
  SheetMoney,
  StaffSheetLine,
} from '@lfd/contracts';

import {
  formatCents,
  formatMillicents,
  formatOrderDate,
  formatOrderInstant,
  fulfillmentLabel,
} from './order-format';

/**
 * **Le bon de commande en texte brut.** Pur : rend une chaîne, ne touche ni au
 * DOM ni au disque — c'est l'app qui déclenche le téléchargement, et un test
 * peut en lire le contenu sans navigateur.
 *
 * ## Ce qu'il remplace, et pourquoi
 *
 * `renderDeliveryNote` produisait un document dont l'en-tête était **toujours**
 * `BON DE LIVRAISON`, et dont la quatrième ligne pouvait dire « Acheminement :
 * Retrait au laboratoire ». Un bon de livraison pour une commande que personne
 * ne livre. Le document tirait son nom d'un de ses champs.
 *
 * Il n'y a **qu'une pièce** : un bon de commande, qui porte un mode
 * d'acheminement comme il porte une date. Celui qui réceptionne un colis et
 * celui qui retire au comptoir cochent le même papier.
 *
 * ## Ce qu'il ne décide pas
 *
 * **Ni ce qu'il montre, ni à qui.** Il reçoit une feuille déjà projetée par le
 * serveur : s'il n'y a pas de montants dessus, c'est qu'il n'y en a pas à
 * imprimer, et aucune option ne les fera revenir. Un `withPrices` ici serait une
 * option de rendu pour une règle d'audience — et le jour où quelqu'un imprime
 * pour le quai de livraison, il le passerait à `true`.
 *
 * Il ne porte pas non plus de **QR** : le jeton de remise n'est pas sur la
 * feuille, et ce papier voyage dans le carton.
 */

/** Quantité cadrée à droite sur 3 caractères, pour que la colonne s'aligne. */
function pad(quantity: number): string {
  return `${quantity}`.padStart(3, ' ');
}

/** Un montant cadré à droite, pour que la colonne des totaux tombe juste. */
function amount(text: string, width = 12): string {
  return text.padStart(width, ' ');
}

/** Le bloc d'adresse, s'il y en a une de figée. */
function addressLines(sheet: OrderSheet): readonly string[] {
  const address = sheet.fulfillment.address;
  if (address === null) {
    return [];
  }
  return [
    `Adresse       : ${address.ligne1}`,
    ...(address.ligne2 === '' ? [] : [`                ${address.ligne2}`]),
    `                ${address.codePostal} ${address.ville}`,
  ];
}

/** L'en-tête : ce que la feuille dit d'elle-même avant de dire son contenu. */
function headerLines(sheet: OrderSheet): readonly string[] {
  return [
    'BON DE COMMANDE',
    '',
    `Commande      : ${sheet.reference}`,
    `Passée le     : ${formatOrderDate(sheet.placedAt)}`,
    ...(sheet.requestedFor === null
      ? []
      : [`Souhaitée le  : ${formatOrderDate(sheet.requestedFor)}`]),
    `Acheminement  : ${fulfillmentLabel(sheet.fulfillment.method)}`,
    ...addressLines(sheet),
  ];
}

/** Une ligne d'atelier ou de staff : le SKU l'ouvre, c'est par lui qu'on la retrouve. */
function skuLine(line: AtelierSheetLine | StaffSheetLine): string {
  return `  ${pad(line.quantity)} × ${line.productName} (${line.sku})`;
}

/**
 * Une ligne chiffrée : quantité, article, prix unitaire, total.
 *
 * Le prix unitaire passe par `formatMillicents` — jusqu'à cinq décimales,
 * affichées seulement si elles existent. Les afficher toujours ferait passer
 * chaque prix rond pour un prix calculé.
 */
function pricedLine(line: ClientSheetLine | StaffSheetLine): string {
  const label = 'sku' in line ? `${line.productName} (${line.sku})` : line.productName;
  return `  ${pad(line.quantity)} × ${label.padEnd(34, ' ')}${amount(
    formatMillicents(line.unitPriceMillicents),
  )}${amount(formatCents(line.lineTotalCents))}`;
}

/** Le décompte, dans l'ordre où les termes se sont appliqués à la commande. */
function moneyLines(money: SheetMoney): readonly string[] {
  return [
    '',
    'DÉCOMPTE',
    `  Sous-total HT ${amount(formatCents(money.subtotalCents), 26)}`,
    ...(money.discountCents === 0
      ? []
      : [`  Remise        ${amount(`−${formatCents(money.discountCents)}`, 26)}`]),
    ...(money.deliveryFeeCents === 0
      ? []
      : [`  Coursier      ${amount(formatCents(money.deliveryFeeCents), 26)}`]),
    // La surtaxe s'ajoute APRÈS la remise : on ne fait pas de geste commercial
    // sur une pénalité de retard.
    ...(money.lateFeeCents === 0
      ? []
      : [`  Surtaxe       ${amount(formatCents(money.lateFeeCents), 26)}`]),
    `  TVA           ${amount(formatCents(money.vatCents), 26)}`,
    `  Total TTC     ${amount(formatCents(money.totalCents), 26)}`,
  ];
}

/** Nombre d'unités toutes lignes confondues — ce qu'on compte à la réception. */
function totalUnits(sheet: OrderSheet): number {
  return sheet.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Le pied. **Deux mentions, et aucune n'est décorative.**
 *
 * L'heure de tirage et la révision : sans elles, deux versions du même bon
 * circulent après un avenant sans qu'on puisse les distinguer. « Arrêté »
 * plutôt que « tiré » parce que l'instant est celui où la révision est devenue
 * vraie, pas celui du rendu — deux tirages de la même révision portent la même
 * date, et c'est ce qu'on veut.
 *
 * « Ce n'est pas une facture » sur les exemplaires chiffrés : le seul écart
 * entre les deux pièces est un numéro de série que la plateforme n'a pas, et un
 * document chiffré muet là-dessus sera classé comme une facture par le premier
 * comptable qui le reçoit.
 */
function footerLines(sheet: OrderSheet): readonly string[] {
  return [
    '',
    `Arrêté le ${formatOrderInstant(sheet.issuedAt)} · révision ${sheet.revision}`,
    ...(sheet.audience === 'atelier' ? [] : ["Ce n'est pas une facture."]),
    'La Folie Coffee — B2B',
  ];
}

/** Les articles, rendus selon ce que la feuille porte vraiment. */
function articleLines(sheet: OrderSheet): readonly string[] {
  return [
    '',
    'ARTICLES',
    ...(sheet.audience === 'atelier' ? sheet.lines.map(skuLine) : sheet.lines.map(pricedLine)),
    '',
    `Total articles : ${totalUnits(sheet)}`,
  ];
}

/** Le décompte n'existe que sur les feuilles qui portent des montants. */
function pricedSection(sheet: OrderSheet): readonly string[] {
  return sheet.audience === 'atelier' ? [] : moneyLines(sheet.money);
}

/**
 * Rend le bon de commande. La feuille décide de tout : le rendu ne choisit ni
 * ce qu'il montre, ni à qui.
 */
export function renderOrderSheetText(sheet: OrderSheet): string {
  return [
    ...headerLines(sheet),
    ...articleLines(sheet),
    ...pricedSection(sheet),
    ...(sheet.note === '' ? [] : ['', `Note : ${sheet.note}`]),
    ...footerLines(sheet),
  ].join('\n');
}

/**
 * Le nom de fichier proposé. **L'audience y figure** : deux exemplaires de la
 * même commande ne doivent pas se confondre sur un bureau, et celui qui n'a pas
 * de montants doit se reconnaître sans être ouvert.
 */
export function orderSheetFileName(sheet: OrderSheet): string {
  return `bon-de-commande-${sheet.reference}-${sheet.audience}.txt`;
}
