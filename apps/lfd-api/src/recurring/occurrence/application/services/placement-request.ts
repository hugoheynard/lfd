import type { RecurringDeltaLine } from "@lfd/contracts";

import type { Basket } from "../../../basket/domain/entities/basket.js";
import type { OccurrencePlacementRequest } from "../../../channels/commerce/occurrence-placement.js";
import type { Occurrence } from "../../domain/entities/occurrence.js";

type Line = { readonly sku: string; readonly quantity: number };

/**
 * **Ce que le commerce reçoit pour passer une échéance** : les lignes de la
 * dérogation, sinon celles du gabarit ; leur écart avec le gabarit ; et la
 * version des CGV que le panier applique au jour servi (plan § 7). `null`
 * pour un panier sans société, qui n'est jamais servi.
 */
export function placementRequestOf(
  basket: Basket,
  occurrence: Occurrence,
): OccurrencePlacementRequest | null {
  const companyId = basket.companyId;
  if (companyId === null) {
    return null;
  }
  const { lines, note, serviceDay } = occurrence.snapshot;
  const template = basket.lines.map(plain);
  const served = lines === null ? template : lines.map(plain);
  return {
    basketId: basket.id,
    serviceDay: serviceDay.toString(),
    buyerUserId: basket.buyerUserId,
    companyId,
    routing: basket.routing,
    lines: served,
    note: lines === null ? basket.note : note,
    deltas: deltasOf(template, served),
    salesTerms: basket.salesTermsOn(serviceDay),
  };
}

function plain(line: Line): Line {
  return { sku: line.sku, quantity: line.quantity };
}

/** L'écart, SKU par SKU, entre les lignes du jour et celles du gabarit. */
function deltasOf(
  template: readonly Line[],
  served: readonly Line[],
): OccurrencePlacementRequest["deltas"] {
  const quantities = new Map<string, number>();
  for (const line of served) {
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
  }
  for (const line of template) {
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) - line.quantity);
  }
  const added: RecurringDeltaLine[] = [];
  const removed: RecurringDeltaLine[] = [];
  for (const [sku, difference] of quantities) {
    if (difference > 0) {
      added.push({ sku, quantity: difference });
    } else if (difference < 0) {
      removed.push({ sku, quantity: -difference });
    }
  }
  return { added, removed };
}
