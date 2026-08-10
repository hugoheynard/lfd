import type { OrderView } from '@lfd/contracts';

import type { OrderDocument } from './order-detail/order-detail';
import { formatOrderDate, fulfillmentLabel } from './order-format';

/**
 * Les **documents d'une commande** : ce qu'on peut en tirer, et ce qu'on ne peut
 * pas encore.
 *
 * La liste vit ici plutôt que dans chaque app parce que la disponibilité est une
 * vérité de la plateforme, pas une politique d'écran : une facture n'est pas
 * « masquée au client et visible au staff », elle **n'existe pas encore**. Les
 * deux côtés doivent dire la même chose, sinon le commercial promet au téléphone
 * un document que le client ne verra jamais arriver.
 */

/** Clés stables — l'app les reçoit sur `documentAsked` et branche dessus. */
export const ORDER_DOC_DELIVERY_NOTE = 'delivery-note';
export const ORDER_DOC_INVOICE = 'invoice';

/**
 * Ce qu'une commande propose au téléchargement.
 *
 * **Bon de livraison** — généré depuis la commande elle-même : c'est une liste
 * de préparation, pas une pièce comptable, rien n'a à être émis en amont. Il n'a
 * en revanche aucun sens sur un brouillon ou une commande annulée.
 *
 * **Facture** — annoncée mais **indisponible**, et c'est volontaire : une
 * facture porte un numéro dans une série continue et des mentions légales.
 * Aucune numérotation n'existe côté serveur ; en fabriquer une dans le
 * navigateur produirait un document sans valeur que quelqu'un finirait par
 * envoyer à son comptable.
 */
export function orderDocuments(order: OrderView): readonly OrderDocument[] {
  const settled = order.status !== 'draft' && order.status !== 'cancelled';
  return [
    {
      key: ORDER_DOC_DELIVERY_NOTE,
      label: 'Bon de livraison',
      icon: 'contracts',
      ...(settled
        ? { hint: 'Généré depuis la commande.' }
        : { unavailable: 'Disponible une fois la commande passée.' }),
    },
    {
      key: ORDER_DOC_INVOICE,
      label: 'Facture',
      icon: 'receipt',
      unavailable: 'Émise après facturation — pas encore disponible.',
    },
  ];
}

/** Le nom de fichier proposé pour le bon de livraison d'une commande. */
export function deliveryNoteFileName(order: OrderView): string {
  return `bon-de-livraison-${order.orderNumber}.txt`;
}

/**
 * Le **bon de livraison**, en texte brut. Pur : rend une chaîne, ne touche ni au
 * DOM ni au disque — c'est l'app qui déclenche le téléchargement, et un test
 * peut lire le contenu sans navigateur.
 *
 * Il porte les quantités et l'acheminement, **pas les montants** : celui qui
 * réceptionne coche des articles, il n'a pas à connaître les prix négociés — et
 * le document circule souvent hors de l'entreprise cliente.
 */
export function renderDeliveryNote(order: OrderView): string {
  const address =
    order.fulfillmentMethod === 'delivery' ? order.deliveryAddress : order.pickupAddress;

  const lines = [
    'BON DE LIVRAISON',
    '',
    `Commande      : ${order.orderNumber}`,
    `Passée le     : ${formatOrderDate(order.placedAt)}`,
    ...(order.requestedDeliveryDate === null
      ? []
      : [`Souhaitée le  : ${formatOrderDate(order.requestedDeliveryDate)}`]),
    `Acheminement  : ${fulfillmentLabel(order.fulfillmentMethod)}`,
    ...(address === null
      ? []
      : [
          `Adresse       : ${address.ligne1}`,
          ...(address.ligne2 === '' ? [] : [`                ${address.ligne2}`]),
          `                ${address.codePostal} ${address.ville}`,
        ]),
    '',
    'ARTICLES',
    ...order.lines.map((line) => `  ${pad(line.quantity)} × ${line.productName} (${line.sku})`),
    '',
    `Total articles : ${totalUnits(order)}`,
    ...(order.note === '' ? [] : ['', `Note : ${order.note}`]),
    '',
    'La Folie Coffee — B2B',
  ];
  return lines.join('\n');
}

/** Nombre d'unités toutes lignes confondues — ce qu'on compte à la réception. */
function totalUnits(order: OrderView): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Quantité cadrée à droite sur 3 caractères, pour que la colonne s'aligne. */
function pad(quantity: number): string {
  return `${quantity}`.padStart(3, ' ');
}
