import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

/**
 * La commande **vivante** — non annulée — qui porte un bon de fidélité.
 *
 * Au plus une par bon : l'index unique partiel
 * `orders_loyalty_voucher_live_key` le tient en base (plan des points, §11 bis
 * B3). Les commandes annulées qui l'ont porté ne sont jamais rendues.
 */
export interface VoucherOrder {
  readonly voucherId: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  /** La part du bon imputée, HT. */
  readonly voucherDiscountCents: number;
  /** Le jour de service (`AAAA-MM-JJ`), ou `null` si la commande n'en porte pas. */
  readonly serviceDay: string | null;
}

/**
 * Les commandes qui portent des bons — lu par la fidélité pour son rattrapage
 * de nuit et pour l'écran des bons (plan des points, C5, §11 bis S4, S6).
 *
 * Même forme que `CompletedOrderReader` : la fidélité ne lit pas les tables de
 * la commande, c'est la commande qui expose ce qu'elle en montre.
 */
export abstract class VoucherOrderReader {
  /** Pour chaque bon cité, sa commande vivante — absent de la table s'il n'en a pas. */
  abstract liveOrdersCarrying(
    voucherIds: readonly string[],
  ): Promise<ReadonlyMap<string, VoucherOrder>>;
}
