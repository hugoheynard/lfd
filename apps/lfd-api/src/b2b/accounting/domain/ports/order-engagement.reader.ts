import type { OrderCollectionStateName } from "../entities/order-collection.js";

/** Ce que la comptabilité sait d'UNE commande, réduit à ce que l'annulation demande. */
export interface OrderEngagementFacts {
  /** Sa facture 380, si elle en a une. `issuedOn` en `AAAA-MM-JJ`. */
  readonly invoice: { readonly number: string; readonly issuedOn: string } | null;
  /** Sa ligne `order_collection` ; `null` : aucune (elle vaut `due`). */
  readonly collection: {
    readonly state: OrderCollectionStateName;
    /** L'échéance figée de son lot (`AAAA-MM-JJ`), `null` hors lot ou lot d'avant. */
    readonly collectionDay: string | null;
    /** L'arrêté ACTIF de sa ligne, `null` sans arrêté. */
    readonly statementId: string | null;
  } | null;
  /**
   * Un rejet bancaire sur une ligne qui l'a portée : relevé `active` → sa
   * ligne → un `collection_return` (C5.5). Un relevé ne porte que les bons
   * débités par SA ligne : le rejet trouvé est bien celui de cette commande.
   */
  readonly rejectedBefore: boolean;
}

/**
 * Port de **lecture** : l'engagement comptable d'une commande, pour
 * l'annulation (plan `documentation/order/plan-annulation-de-commande.md`,
 * C5.5). Sous le verrou de la ligne `orders` de l'appelant, la lecture fait
 * autorité : aucun écrivain d'état n'y passe sans prendre la même ligne.
 */
export abstract class OrderEngagementReader {
  abstract factsOf(orderId: string): Promise<OrderEngagementFacts>;
}
