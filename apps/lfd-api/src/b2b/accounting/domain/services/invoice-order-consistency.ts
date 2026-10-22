import type { FrozenInvoiceOrder, InconsistentOrder } from "./invoice-dossier.types.js";
import { splitInvoiceOrder } from "./invoice-order-split.js";

/**
 * **Un bon dont le total ne se recompose pas** à partir de ses propres montants
 * figés : `Σ lignes − remise − bon de fidélité + port + surtaxe + TVA`.
 *
 * Les remises sont celles que la facture déduit, **bornées** comme le bon
 * les a bornées (`invoice-order-split.ts`, 2026-10-22) : une remise figée
 * au-delà du panier — bons d'avant `90eac6979` — n'est plus déduite en entier
 * par la facture, et n'est donc plus un écart. La règle ne suppose aucun cas :
 * tout bon qui ne vérifie pas l'égalité est signalé (décision de Hugo,
 * 2026-10-08). Les trois écarts du plan (§3.4) supposent cette égalité
 * bon par bon ; sans elle, ils ne s'additionnent plus en la différence. L'écart
 * de ces bons devient donc un **quatrième terme nommé**, et la somme reste
 * exacte au centime.
 *
 * `gapCents` = total recomposé − total figé : ce que la facture, qui recompose,
 * compte de plus que le bon pour ce même bon.
 */
export function inconsistentOrders(
  orders: readonly FrozenInvoiceOrder[],
): readonly InconsistentOrder[] {
  return orders
    .map((order) => ({ order, recomposed: recomposedTotalCents(order) }))
    .filter(({ order, recomposed }) => recomposed !== order.totalCents)
    .map(({ order, recomposed }) => ({
      reference: order.reference,
      recomposedTotalCents: recomposed,
      totalCents: order.totalCents,
      gapCents: recomposed - order.totalCents,
    }));
}

function recomposedTotalCents(order: FrozenInvoiceOrder): number {
  const goods = order.lines.reduce((total, line) => total + line.lineTotalCents, 0);
  const split = splitInvoiceOrder(order);
  return (
    goods -
    split.pickupDiscountCents -
    split.voucherCents +
    order.deliveryFeeCents +
    order.lateFeeCents +
    order.vatCents
  );
}
