import type {
  OrderRevisionDiscountRefusal,
  OrderRevisionLineRefusal,
  OrderRevisionQuoteView,
} from "@lfd/contracts";

import type { RevisableOrder } from "../../domain/entities/order-revision.js";
import type { BasketDiscountRefusal } from "../../domain/services/basket-discount-replay.js";
import type { KeptLineRefusal } from "../../domain/services/kept-line-prices.js";
import type { QuotedRevision } from "./order-revising.service.js";

/**
 * **Le devis dit au lecteur** : la commande recomposée, l'écart avec la
 * révision courante, quelles lignes gardent leur prix d'origine (R3), et ce
 * que la modification refusera — par ligne et par remise, avec ses deux prix
 * (`documentation/promotions/plan-remises-acquises.md`, § 10.4). Partagé par
 * le devis de la modification et celui d'une demande (M4).
 */
export function quoteViewOf(
  current: RevisableOrder,
  quoted: QuotedRevision,
): OrderRevisionQuoteView {
  const { revision, refusals } = quoted;
  const { state } = revision;
  const previous = new Set(current.lines.map((line) => line.sku));
  const lineRefusals = new Map(
    refusals.flatMap((refusal) =>
      refusal.kind === "below_threshold" ? [] : [[refusal.sku, lineRefusalOf(refusal)] as const],
    ),
  );
  return {
    revision: current.revision,
    lines: state.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
      unitPriceMillicents: line.unitPriceMillicents,
      vatRate: line.vatRate,
      lineTotalCents: line.lineTotalCents,
      priceFrozen: previous.has(line.sku),
      refusal: lineRefusals.get(line.sku) ?? null,
    })),
    subtotalCents: state.subtotalCents,
    discountCents: state.discountCents,
    deliveryFeeCents: state.deliveryFeeCents,
    lateFeeCents: state.lateFeeCents,
    voucherDiscountCents: state.voucherDiscountCents,
    vatCents: state.vatCents,
    totalCents: state.totalCents,
    previousTotalCents: current.totalCents,
    differenceCents: state.totalCents - current.totalCents,
    changes: revision.changes,
    discountRefusals: refusals.flatMap((refusal) =>
      refusal.kind === "below_threshold" ? [discountRefusalOf(refusal)] : [],
    ),
  };
}

function lineRefusalOf(refusal: KeptLineRefusal): OrderRevisionLineRefusal {
  return refusal.kind === "withdrawn"
    ? { kind: "withdrawn" }
    : { kind: "price_changed", frozen: refusal.frozen, current: refusal.current };
}

function discountRefusalOf(refusal: BasketDiscountRefusal): OrderRevisionDiscountRefusal {
  return {
    kind: "below_threshold",
    label: refusal.label,
    minQuantity: refusal.minQuantity,
    sku: refusal.sku,
    quantity: refusal.quantity,
  };
}
