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
  readonly pickupDiscountEligible: boolean;
}

/** Une valeur JSON écrite sur la commande, transmise sans être lue. */
export type DeliveryNoteOrderJson =
  | string
  | number
  | boolean
  | null
  | readonly DeliveryNoteOrderJson[]
  | { readonly [key: string]: DeliveryNoteOrderJson | undefined };

/**
 * Les totaux d'une commande, tels que le bon de livraison les recopie (plan
 * plan E4a (`documentation/commandes/bon-de-livraison.md`)) : les colonnes
 * d'`orders` telles qu'écrites, JSON compris, sans interprétation.
 */
export interface DeliveryNoteOrderTerms {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly deliveryVatMode: string | null;
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: DeliveryNoteOrderJson | null;
  readonly vatShares: DeliveryNoteOrderJson | null;
  readonly vatCents: number;
  readonly totalCents: number;
  /**
   * Les TTC figés des termes d'une commande `exact_ht` (plan
   * `documentation/pricing/plan-centime-particuliers.md`, § 7) ; `null` pour
   * une commande `line_ht` — la méthode se lit là.
   */
  readonly ttcTerms: DeliveryNoteOrderTtcTerms | null;
}

/** Les TTC de la remise retrait, du bon imputé et du port. */
export interface DeliveryNoteOrderTtcTerms {
  readonly discountCents: number;
  readonly voucherCents: number;
  readonly deliveryFeeCents: number;
}

/** Une commande confirmée par un arrêt du plan, vue du bon de livraison. */
export interface DeliveryNoteOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly lines: readonly DeliveryNoteOrderLine[];
  readonly terms: DeliveryNoteOrderTerms;
}

/**
 * **Ce que le bon de livraison lit d'une commande** (plan
 * plan E1 (`documentation/commandes/bon-de-livraison.md`), § 6) — port de
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
