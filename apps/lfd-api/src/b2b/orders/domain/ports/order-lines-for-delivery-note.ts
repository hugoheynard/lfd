/** Une ligne de commande figée, telle que le bon de livraison la recopie. */
export interface DeliveryNoteOrderLine {
  readonly sku: string;
  readonly productName: string;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
  readonly unitPriceTtcCents: number | null;
  readonly lineTotalTtcCents: number | null;
}

/** Une commande confirmée par un arrêt du plan, vue du bon de livraison. */
export interface DeliveryNoteOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly lines: readonly DeliveryNoteOrderLine[];
}

/**
 * **Ce que le bon de livraison lit d'une commande** (plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`, § 6) — port de
 * lecture DÉCLARÉ par les commandes, qui possèdent `orders` et `order_lines`,
 * et implémenté dans `b2b/orders/infrastructure/`. `b2b/delivery-notes/` ne lit
 * jamais ces tables en Prisma direct ; aucune porte ne le tient à l'intérieur
 * de `b2b` (vérifié le 2026-10-24) : c'est la relecture qui le vérifie.
 */
export abstract class OrderLinesForDeliveryNote {
  /**
   * Les commandes de `orderIds` que l'arrêt de `closedAt` a confirmées —
   * `status = confirmed` et `confirmedAt = closedAt`, le marqueur que
   * `releaseFromPlan` lit déjà (plan E1, § 6, bloquant 3). Une commande que
   * `planWhere` a écartée, ou confirmée par un autre arrêt, n'y est pas.
   */
  abstract confirmedByPlan(
    orderIds: readonly string[],
    closedAt: Date,
  ): Promise<readonly DeliveryNoteOrder[]>;
}
