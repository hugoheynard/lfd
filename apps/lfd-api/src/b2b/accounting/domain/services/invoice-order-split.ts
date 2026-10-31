import {
  DELIVERY_VAT_RATE,
  splitOrderByRate,
  type RatedCents,
  type VatExtra,
  type VatVentilationInput,
} from "@lfd/money";

import { InvoiceDossierLateFeeRateMissingError } from "../errors/invoice-dossier-errors.js";
import {
  chainedBasketDiscountsOf,
  unchainedBasketDiscountsGap,
  type InvoiceBasketDiscountSplit,
} from "./invoice-basket-discount-split.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";
import { normalizedVatRate } from "./invoice-lines.js";

/**
 * **Un bon découpé par taux, en centimes** — ce que la facture additionne
 * (plan `plan-remises-ventilees-bon-par-bon.md`, R1-R3).
 *
 * Recalculé depuis les lignes et les montants FIGÉS du bon, jamais depuis la
 * règle du jour, dans l'ordre de `ventilateVat` : la remise de retrait sur ses
 * lignes éligibles, le bon de fidélité sur le net laissé, le port qui suit la
 * marchandise sur les bases brutes.
 *
 * Les remises sont **bornées** comme `ventilateVat` les a bornées en calculant
 * le total du bon. Un bon d'avant le 2026-09-06 peut avoir figé une remise
 * supérieure à son panier (`90eac6979`) ; la facture ne déduit que ce que le bon
 * a réellement déduit, et c'est aussi ce que recompose
 * `invoice-order-consistency.ts`.
 */
export interface OrderInvoiceSplit {
  readonly pickupDiscount: readonly RatedCents[];
  readonly voucher: readonly RatedCents[];
  /** Vide sauf pour un port en mode `follows_goods`. */
  readonly followingDelivery: readonly RatedCents[];
  /** Le port au taux normal, en centimes ; `0` sinon. */
  readonly standardDeliveryCents: number;
  /** Ce que la remise de retrait a réellement déduit. */
  readonly pickupDiscountCents: number;
  /** Ce que le bon de fidélité a réellement déduit. */
  readonly voucherCents: number;
  /**
   * Ses remises de panier une par une, quand il en porte plusieurs aux parts
   * figées (lot M5) ; `null` : sa remise est toute dans `pickupDiscount`,
   * sous la clé de la remise client, comme avant M5.
   */
  readonly basketDiscounts: readonly InvoiceBasketDiscountSplit[] | null;
}

/**
 * Découpe un bon. Un bon qui porte une surtaxe sans taux arrête le dossier,
 * comme la facture.
 *
 * @throws {InvoiceDossierLateFeeRateMissingError}
 */
export function splitInvoiceOrder(order: FrozenInvoiceOrder): OrderInvoiceSplit {
  const following = order.deliveryVatMode === "follows_goods" && order.deliveryFeeCents !== 0;
  const input = ventilationInputOf(order, following);
  const split = splitOrderByRate(input);
  const chained = chainedBasketDiscountsOf(order, input.lines);
  // Plusieurs remises figées : chacune garde ses parts, et le bon de fidélité
  // se découpe sur ce qu'elles laissent — l'ordre de `ventilateVat`. Le port
  // se découpe sur les bases brutes, qu'aucune remise ne touche.
  const pickupDiscount = chained?.eligibleDiscount ?? split.eligibleDiscount;
  const voucher = chained?.voucher ?? split.discount;
  return {
    pickupDiscount,
    voucher,
    followingDelivery: following ? (split.extras[0] ?? []) : [],
    standardDeliveryCents: following ? 0 : order.deliveryFeeCents,
    pickupDiscountCents: sumOf(pickupDiscount),
    voucherCents: sumOf(voucher),
    basketDiscounts: chained?.discounts ?? null,
  };
}

/**
 * Pourquoi ce bon, qui porte plusieurs remises, sera facturé sous la remise
 * client sans détail — `null` s'il ne l'est pas. Pour la journalisation.
 */
export function basketDiscountFallbackOf(order: FrozenInvoiceOrder): string | null {
  return unchainedBasketDiscountsGap(order, ventilationInputOf(order, false).lines);
}

function ventilationInputOf(order: FrozenInvoiceOrder, following: boolean): VatVentilationInput {
  // Seul le port qui suit la marchandise a besoin d'être découpé : celui au
  // taux normal et la surtaxe ont chacun un seul taux. Le bon de fidélité ne
  // touche ni l'un ni l'autre.
  const extras: VatExtra[] = following
    ? [{ htCents: order.deliveryFeeCents, followsGoods: true }]
    : [];
  return {
    lines: order.lines.map((line) => ({
      htCents: line.lineTotalCents,
      vatRate: normalizedVatRate(line.vatRate, order.reference),
      discountEligible: line.pickupDiscountEligible ?? true,
    })),
    eligibleDiscountCents: order.discountCents,
    discountCents: order.voucherDiscountCents,
    extras,
  };
}

/** La surtaxe du bon sur son taux ; un bon qui en porte une sans taux arrête le dossier. */
export function lateFeeOf(order: FrozenInvoiceOrder): RatedCents | null {
  if (order.lateFeeCents === 0) {
    return null;
  }
  if (order.lateFeeVatRate === null) {
    throw new InvoiceDossierLateFeeRateMissingError(order.reference);
  }
  return { vatRate: order.lateFeeVatRate, amountCents: order.lateFeeCents };
}

/** Le port au taux normal, sur son taux. */
export function standardDeliveryOf(split: OrderInvoiceSplit): RatedCents | null {
  return split.standardDeliveryCents === 0
    ? null
    : { vatRate: DELIVERY_VAT_RATE, amountCents: split.standardDeliveryCents };
}

function sumOf(parts: readonly RatedCents[]): number {
  return parts.reduce((total, part) => total + part.amountCents, 0);
}
