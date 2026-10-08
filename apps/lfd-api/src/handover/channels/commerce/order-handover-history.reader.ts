import type { HandoverVia } from "../../domain/services/handover.js";

/** Le retrait d'une commande, tel que le retrait l'a attesté. */
export interface OrderHandoverHistoryFact {
  readonly orderId: string;
  readonly handedOverAt: Date;
  /** `scan`, `manual` ou `deposit` (déposé à la porte sans personne). */
  readonly via: HandoverVia;
  /** Une preuve de remise à la porte existe : le retrait s'est fait chez le client. */
  readonly atDoor: boolean;
}

/**
 * **Le retrait de ces commandes, pour le dossier de facturation** (plan
 * `documentation/comptabilite/facturation/simulateur-dossier-de-facturation.md`,
 * DF3).
 *
 * Le retrait DÉCLARE et IMPLÉMENTE ce port, le commerce le lit — même figure
 * que `HandoverProofReader`. `order_handover` et `order_handover_proof` lui
 * appartiennent ; le commerce ne lit pas leurs tables.
 *
 * Par lot : un dossier porte des dizaines de bons, une lecture par bon serait
 * un N+1.
 *
 * `order_departure` n'est PAS rendu : il ne garde que le dernier départ
 * (un second départ l'écrase), alors que la livraison garde chaque arrêt —
 * c'est elle qui raconte les départs et les retours (DF3, 2026-10-08).
 */
export abstract class OrderHandoverHistoryReader {
  /** Le retrait de chacune de ces commandes ; absente de la carte = jamais retirée. */
  abstract ofOrders(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, OrderHandoverHistoryFact>>;
}
