/**
 * **Les bons à constater** (plan
 * `documentation/comptabilite/facturation/plan-zero-faille.md`, lot ZL) :
 * les bons au compte dont le jour de service est passé et dont aucune remise
 * n'a été attestée. Ils ne sont dans aucune facture tant qu'on ne l'a pas
 * fait — cette liste est ce qui empêche qu'ils y manquent en silence.
 * Types seulement : aucune valeur, rien n'entre dans le paquet exécuté.
 * Montants en centimes.
 */

/** Un bon livrable, sans date de livraison, dont le jour est passé. */
export interface UnconfirmedDeliveryView {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly companyId: string;
  /** La raison sociale de la société qui a commandé (le site, pour un sous-compte). */
  readonly companyName: string;
  /** `AAAA-MM-JJ` — le jour de retrait ou de livraison demandé. */
  readonly serviceDay: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly totalCents: number;
}

/** `GET admin/accounting/unconfirmed-deliveries` — du jour le plus ancien au plus récent. */
export interface UnconfirmedDeliveriesView {
  /** `AAAA-MM-JJ` — aujourd'hui à Paris : les bons d'un jour ANTÉRIEUR sont listés. */
  readonly before: string;
  readonly orders: readonly UnconfirmedDeliveryView[];
}
