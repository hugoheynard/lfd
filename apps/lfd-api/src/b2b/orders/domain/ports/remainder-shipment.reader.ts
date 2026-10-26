/**
 * **Un reste de commande, pour les courriels** (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 17, lot L4d).
 *
 * Le courriel d'un envoi de rang > 1 ne peut pas se lire sur la commande :
 * son contenu et son état sont ceux de SON bon de livraison (choix 3). Port
 * étroit, de lecture seule — les deux courriels n'ont besoin que de savoir
 * combien de pièces part, et si le reste a déjà été remis.
 */
export interface RemainderShipment {
  /** Le nombre de pièces du reste — la somme des lignes de son BL. */
  readonly pieces: number;
  /** Le reste a déjà changé de mains : plus rien à annoncer. */
  readonly handedOver: boolean;
}

export abstract class RemainderShipmentReader {
  /**
   * Le reste `(commande, rang)`, ou `null` quand il n'existe pas ou que son BL
   * est annulé — un abonné de fond n'a alors plus rien à annoncer.
   */
  abstract find(orderId: string, rank: number): Promise<RemainderShipment | null>;
}
