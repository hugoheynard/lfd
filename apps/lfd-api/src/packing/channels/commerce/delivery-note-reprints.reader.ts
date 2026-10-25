/**
 * **« Le bon de livraison a changé depuis son impression »**, vu du poste de
 * colisage (plan E6 (`documentation/commandes/bon-de-livraison.md`),
 * § 14) — DÉCLARÉ par le colisage, IMPLÉMENTÉ par le commerce, qui tient les
 * BL : le colisage ne lit jamais leurs tables.
 */
export abstract class DeliveryNoteReprintsReader {
  /** Parmi ces commandes, celles dont un BL vivant a été imprimé puis a changé. */
  abstract reprintNeededAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>>;
}
