/** Ce que le commerce, et lui seul, sait pour l'étiquette d'un sac. */
export interface OrderBagLabelFacts {
  /**
   * `#rrggbb` — la couleur des papiers du fournil (la règle du bon de
   * commande, lue à l'impression) ; `null` : pas de carré, jamais une teinte
   * devinée.
   */
  readonly color: string | null;
  /**
   * L'URL du QR de retrait, celle des courriels et du bon de commande ; vide
   * quand le jeton ne se montre pas (commande non réglée) ou que l'origine du
   * back-office n'est pas configurée : pas de QR.
   */
  readonly handoverUrl: string;
}

/**
 * **Ce que l'étiquette d'un sac lit au commerce** (2026-10-25, demande de
 * Hugo) — DÉCLARÉ par le colisage, IMPLÉMENTÉ par le commerce, qui tient la
 * couleur et le jeton de retrait. Même figure que
 * {@link DeliveryNoteReprintsReader} : le colisage ne lit jamais ses tables.
 */
export abstract class OrderBagLabelReader {
  /** `null` : commande inconnue du commerce. */
  abstract factsOf(orderId: string): Promise<OrderBagLabelFacts | null>;
}
