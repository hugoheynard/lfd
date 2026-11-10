import type { InvoiceAllowance, RatedCents } from "@lfd/money";

import type { InvoiceBasketDiscountSplit } from "./invoice-basket-discount-split.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";
import type { OrderInvoiceSplit } from "./invoice-order-split.js";

/**
 * **Les remises de panier de la facture, par clé** — `documentation/promotions/promotions.md`, § 2.11,
 * et Q-M2, lot M5.
 *
 * Tant qu'aucun bon de la facture ne porte plusieurs remises, rien ne change :
 * une seule clé, {@link COMPANY_DISCOUNT_KEY}, qui additionne la remise de
 * chaque bon — la facture, sa ventilation figée et son XML restent ceux d'hier,
 * au caractère près (la règle même du papier du bon au lot M4).
 *
 * Dès qu'un bon en porte plusieurs, la clé devient (promotion, taux) : les
 * parts d'une même promotion se somment sur tous les bons de la facture, une
 * BG-20 par promotion et par taux. Les bons d'une seule remise y entrent sous
 * la clé de leur promotion, avec les parts d'hier. Une remise sans promotion
 * (reprise d'avant L9, ou bon dont les parts ne tombent pas juste) garde la
 * clé de la remise client. Le libellé d'une promotion est celui du bon le
 * plus ancien qui en porte un (Q-M2, mandat du 2026-10-31).
 */

/** La remise client — la clé d'avant M5, et celle d'une remise sans promotion. */
export const COMPANY_DISCOUNT_KEY = "company_discount";
/** Le préfixe de la clé d'une promotion : un identifiant opaque n'est jamais un motif. */
export const BASKET_PROMOTION_PREFIX = "basket_promotion:";

interface KeyedAllowance {
  label: string | undefined;
  readonly byRate: RatedCents[];
}

/** Les remises de panier de ces bons, une entrée par clé, la remise client d'abord. */
export function basketDiscountAllowances(
  orders: readonly FrozenInvoiceOrder[],
  splits: readonly OrderInvoiceSplit[],
): readonly InvoiceAllowance[] {
  if (splits.every((split) => split.basketDiscounts === null)) {
    return [{ key: COMPANY_DISCOUNT_KEY, byRate: splits.flatMap((s) => s.pickupDiscount) }];
  }
  const byKey = new Map<string, KeyedAllowance>([
    [COMPANY_DISCOUNT_KEY, { label: undefined, byRate: [] }],
  ]);
  for (const index of chronologicalIndices(orders)) {
    const split = splits[index];
    const order = orders[index];
    if (split === undefined || order === undefined) {
      continue;
    }
    for (const discount of discountsOf(order, split)) {
      addTo(byKey, discount);
    }
  }
  return [...byKey].map(([key, allowance]) =>
    allowance.label === undefined
      ? { key, byRate: allowance.byRate }
      : { key, label: allowance.label, byRate: allowance.byRate },
  );
}

function addTo(byKey: Map<string, KeyedAllowance>, discount: InvoiceBasketDiscountSplit): void {
  const key =
    discount.promotionId === null
      ? COMPANY_DISCOUNT_KEY
      : `${BASKET_PROMOTION_PREFIX}${discount.promotionId}`;
  const allowance = byKey.get(key) ?? { label: undefined, byRate: [] };
  allowance.byRate.push(...discount.byRate);
  // La remise client additionne des remises sans promotion : aucun libellé
  // ne parle pour toutes.
  if (key !== COMPANY_DISCOUNT_KEY && allowance.label === undefined) {
    allowance.label = labelOf(discount.label);
  }
  byKey.set(key, allowance);
}

/** Un bon d'une seule remise garde les parts d'hier, sous la clé de sa promotion. */
function discountsOf(
  order: FrozenInvoiceOrder,
  split: OrderInvoiceSplit,
): readonly InvoiceBasketDiscountSplit[] {
  if (split.basketDiscounts !== null) {
    return split.basketDiscounts;
  }
  const frozen = order.basketDiscounts ?? [];
  const single = frozen.length === 1 ? frozen[0] : undefined;
  return [
    {
      promotionId: single?.promotionId ?? null,
      label: single?.label ?? null,
      byRate: split.pickupDiscount,
    },
  ];
}

/** Un libellé vide n'en est pas un : le XML écrira le repli. */
function labelOf(label: string | null): string | undefined {
  return label === null || label.trim() === "" ? undefined : label;
}

/** Du bon le plus ancien au plus récent ; à égalité, l'ordre reçu. */
function chronologicalIndices(orders: readonly FrozenInvoiceOrder[]): readonly number[] {
  return orders
    .map((order, index) => ({ at: order.createdAt.getTime(), index }))
    .sort((left, right) => left.at - right.at || left.index - right.index)
    .map((entry) => entry.index);
}
