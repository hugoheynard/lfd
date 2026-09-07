import type { OrderView } from '@lfd/contracts';

import type { OrderDocument } from './order-detail/order-detail';

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

/**
 * Clés stables — l'app les reçoit sur `documentAsked` et branche dessus.
 *
 * 🔴 `delivery-note` est devenu `order-sheet` le 2026-09-07. Il n'existe pas de
 * « bon de livraison » : la même pièce partait pour un RETRAIT sous un en-tête
 * qui annonçait une livraison. Le renommage est sans migration — cette clé ne
 * traverse ni le réseau ni la base, elle ne circule qu'entre la lib et l'écran
 * qui l'écoute.
 */
export const ORDER_DOC_ORDER_SHEET = 'order-sheet';
export const ORDER_DOC_INVOICE = 'invoice';

/**
 * Ce qu'une commande propose au téléchargement.
 *
 * **Bon de commande** — généré depuis la commande elle-même : c'est une liste de
 * préparation, pas une pièce comptable, rien n'a à être émis en amont. Il n'a en
 * revanche aucun sens sur un brouillon ou une commande annulée.
 *
 * Il n'y a **pas** de « bon de livraison » : une seule pièce, qui porte un mode
 * d'acheminement. Celui qui réceptionne un colis et celui qui retire au comptoir
 * cochent le même papier.
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
      key: ORDER_DOC_ORDER_SHEET,
      label: 'Bon de commande',
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

/**
 * ⚠️ Le rendu du bon **a déménagé** dans `order-sheet-text.ts`, et il ne prend
 * plus une `OrderView` mais un `OrderSheet` — la feuille projetée par le
 * serveur. C'est ce qui fait que l'audience (et donc la présence des montants)
 * n'est plus une décision d'écran.
 */
