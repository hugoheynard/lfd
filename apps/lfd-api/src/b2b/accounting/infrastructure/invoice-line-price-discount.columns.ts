import { priceStepsSchema } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import {
  promotionPriceDiscountOf,
  type InvoicePriceDiscount,
} from "../domain/services/invoice-price-discount.js";

/**
 * Les colonnes de la trace de prix d'une ligne de commande que la facture lit
 * pour chiffrer la remise d'une promotion « dans le prix affiché » (plan
 * `plan-remise-par-ligne.md`, § 18.6, point 2). La ligne d'un bon de
 * livraison ne porte pas la trace : elle la reprend de la ligne de commande
 * au même article et au même prix (`priceDiscountOfNoteLine`).
 */
export const ORDER_LINE_PRICE_TRACE_SELECT = {
  basePriceMillicents: true,
  pricingSteps: true,
  pricingFloored: true,
  pricingClampedToZero: true,
} as const;

interface TracedLineRow {
  readonly sku: string;
  readonly unitPriceMillicents: number;
  readonly basePriceMillicents: number | null;
  readonly pricingSteps: Prisma.JsonValue;
  readonly pricingFloored: boolean | null;
  readonly pricingClampedToZero: boolean | null;
}

/** La remise d'une ligne de commande ; `undefined` quand la trace se tait ou ne se lit pas. */
export function priceDiscountOfOrderLine(row: TracedLineRow): InvoicePriceDiscount | undefined {
  if (row.basePriceMillicents === null || row.pricingFloored === null) {
    return undefined;
  }
  const steps = priceStepsSchema.safeParse(row.pricingSteps);
  if (!steps.success) {
    return undefined;
  }
  const trace = {
    basePriceMillicents: row.basePriceMillicents,
    steps: steps.data,
    floored: row.pricingFloored,
    clampedToZero: row.pricingClampedToZero,
  };
  return promotionPriceDiscountOf(trace, row.unitPriceMillicents) ?? undefined;
}

/**
 * La remise d'une ligne de bon de livraison : celle de la ligne de commande
 * au même article ET au même prix — un BL recopie la commande (invariant 3
 * du plan-cadre des BL). Deux lignes de commande candidates aux remises
 * différentes : on se tait plutôt que d'en choisir une.
 */
export function priceDiscountOfNoteLine(
  orderLines: readonly TracedLineRow[],
  noteLine: { readonly sku: string; readonly unitPriceMillicents: number },
): InvoicePriceDiscount | undefined {
  const candidates = orderLines
    .filter((l) => l.sku === noteLine.sku && l.unitPriceMillicents === noteLine.unitPriceMillicents)
    .map(priceDiscountOfOrderLine);
  const [first] = candidates;
  const same = candidates.every(
    (c) =>
      c?.grossUnitPriceMillicents === first?.grossUnitPriceMillicents &&
      c?.labels.join("\u001f") === first?.labels.join("\u001f"),
  );
  return same ? first : undefined;
}
