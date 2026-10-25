/** Une ligne qui sort de la réserve : l'article, son nom figé, combien. */
export interface ShopReleaseLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Ce que le commerce envoie en boutique depuis la réserve d'une journée. */
export interface ShopRelease {
  /** `AAAA-MM-JJ` — la journée de la réserve. */
  readonly serviceDay: string;
  /** Le point qui reçoit, opaque ; son nom du moment, `null` s'il n'en a pas. */
  readonly siteId: string;
  readonly siteLabel: string | null;
  /** Le réassort d'origine `reserve` né du même geste, opaque. */
  readonly resupplyId: string;
  readonly lines: readonly ShopReleaseLine[];
}

/**
 * **La sortie de réserve vers une boutique** (plan A1, lot A1.4,
 * `documentation/commandes/annulation/plan-a1-4-envoyer-en-boutique.md` § 2)
 * — déclaré ET implémenté par le colisage, appelé par le commerce DANS la
 * transaction de « Envoyer en boutique », APRÈS l'écriture du réassort. Même
 * figure que {@link ShortfallDesk}.
 *
 * `send` verrouille la réserve article par article, triés par SKU (l'ordre de
 * `releaseToStock`), et fait sortir chaque quantité par
 * `PackingStock.sendToShop` : un libre insuffisant refuse
 * (`ReserveShortForShopError`, 409), et le refus défait tout, réassort
 * compris. Le fait `packing_stock.sent_to_shop` est journalisé dans la même
 * transaction.
 *
 * `packing → b2b` reste interdit : le colisage ne sait pas qui l'appelle.
 */
export abstract class ReserveShopRelease {
  abstract send(release: ShopRelease): Promise<void>;
}
