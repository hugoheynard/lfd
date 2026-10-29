/**
 * **De quelle ancienne référence cet article est-il né ?**
 * (`plan-tarif-date-sur-une-reference.md`, § 6 — le report du L7c).
 *
 * Un port à lui (ISP) : seul le report d'un prix négocié pose cette question,
 * pour refuser de « reporter » sur une référence qui n'est pas née de
 * l'ancienne — ce qui serait une pose déguisée.
 */
export abstract class DetachmentOriginReader {
  /**
   * Le SKU de la déclinaison d'origine (`catalog_items.detached_from_sku`) de
   * l'article EN VENTE vendu sous ce SKU, ou `null` — article inconnu,
   * retiré, ou né autrement que d'un détachement.
   */
  abstract detachedFromOf(shopSku: string): Promise<string | null>;
}
