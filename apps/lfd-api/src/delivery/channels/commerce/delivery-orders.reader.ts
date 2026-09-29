/**
 * Ce que la livraison sait d'une commande : de quoi la répartir et la
 * signaler, rien d'autre. Aucun montant, aucune adresse — le détail d'un arrêt
 * est celui de la feuille de route (plan de tournée, lot 3, C4).
 *
 * `status` est RÉDUIT à ce que la composition distingue : `cancelled` ou
 * `active`. L'énuméré des statuts reste au commerce.
 */
export interface DeliveryOrderRef {
  readonly orderId: string;
  readonly reference: string;
  readonly status: "active" | "cancelled";
}

/** Une commande relue par son identifiant, où qu'elle en soit aujourd'hui. */
export interface DeliveryOrderFacts extends DeliveryOrderRef {
  /** Son jour demandé aujourd'hui (`AAAA-MM-JJ`), ou `null`. */
  readonly day: string | null;
  /** Encore en livraison, ou passée en retrait au comptoir. */
  readonly delivery: boolean;
}

/**
 * **Les livraisons, vues par la composition** — ce que la livraison DÉCLARE et
 * que le commerce implémente (`b2b/orders/infrastructure/`), relié dans
 * `appBootstrap` (C4, C15).
 *
 * La livraison ne lit pas `public.orders` : le filtre « attendue ce jour »
 * est celui de la file du comptoir et de la feuille de route, écrit UNE fois
 * côté commerce (`expectedOnWhere`). Deux lecteurs, une vérité.
 */
export abstract class DeliveryOrdersReader {
  /**
   * Les livraisons attendues ce jour-là, annulées COMPRISES (c'est au statut
   * de le dire), brouillons exclus.
   */
  abstract expectedOn(day: string): Promise<readonly DeliveryOrderRef[]>;

  /** Ces commandes, quel que soit leur jour, leur mode ou leur statut. Les inconnues sont absentes. */
  abstract byIds(orderIds: readonly string[]): Promise<readonly DeliveryOrderFacts[]>;
}
