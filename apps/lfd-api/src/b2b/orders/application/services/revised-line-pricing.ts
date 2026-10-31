import type { OrderLineInput as OrderLineRequest } from "@lfd/contracts";

import type { RevisableDiscount } from "../../domain/services/basket-discount-replay.js";
import { keptLineRefusals, type KeptLineRefusal } from "../../domain/services/kept-line-prices.js";
import {
  ensureKeptMinimums,
  keptQuantityChanges,
  revisedLineRequests,
} from "../../domain/services/revised-lines.js";
import type { OrderLineInput, OrderLineSnapshot } from "../../domain/value-objects/order-line.js";
import type { OrderVatMethod } from "../../domain/value-objects/order-vat-method.js";
import type { OrderLinePricing } from "./order-line-pricing.service.js";
import type { OrderParties } from "./order-parties.js";

/**
 * **Ce que la composition reçoit d'une commande qu'on révise** : ses lignes
 * figées et ses remises de panier à rejouer
 * (`documentation/promotions/plan-remises-acquises.md`, § 10). `null` à la
 * passation.
 */
export interface RevisedFrom {
  readonly lines: readonly OrderLineSnapshot[];
  readonly discounts: readonly RevisableDiscount[];
}

/** Les lignes d'une révision, et les refus de prix que le devis montre et que la révision lève. */
export interface RevisedLines {
  readonly lines: readonly OrderLineInput[];
  readonly refusals: readonly KeptLineRefusal[];
}

/**
 * **Les lignes tarifées d'une révision.** Les NOUVELLES passent par la
 * résolution qui facture ; les autres reprennent leur prix figé (R3).
 *
 * Une ligne gardée dont la quantité CHANGE est d'abord tenue au minimum du
 * catalogue (dérogation à R3, Hugo, 2026-10-29), puis **retarifée au moment
 * pour sa quantité révisée** (plan des remises acquises, § 10.1) : égale au
 * figé, elle garde son figé ; différente, ou sortie du catalogue, elle est un
 * refus — que le devis rend et que la révision lève. Dans le devis, la ligne
 * refusée garde son prix figé, pour que le total montré soit celui d'un prix
 * convenu, jamais celui d'un prix substitué.
 *
 * Même règle pour l'équipe (M4) : aucune dérogation.
 */
export async function priceRevisedLines(
  linePricing: OrderLinePricing,
  requested: readonly OrderLineRequest[],
  parties: OrderParties,
  revised: RevisedFrom,
  vatMethod: OrderVatMethod,
): Promise<RevisedLines> {
  const split = revisedLineRequests(revised.lines, requested);
  const changes = keptQuantityChanges(revised.lines, split);
  const minimums = await linePricing.minimumsOf(
    changes.map((change) => change.sku),
    parties,
  );
  ensureKeptMinimums(changes, minimums);
  const repriced = await linePricing.repriceKept(
    changes.map((change) => ({
      sku: change.sku,
      quantity: change.quantity,
      saleUnit: change.saleUnit,
    })),
    parties,
  );
  const refusals = keptLineRefusals(revised.lines, changes, repriced, vatMethod);
  const fresh =
    split.fresh.length === 0 ? [] : await linePricing.resolve(split.fresh, parties, "checkout");
  const freshBySku = new Map(fresh.map((entry) => [entry.line.sku, entry.line]));
  const lines = split.order
    .map((sku) => split.frozen.get(sku) ?? freshBySku.get(sku))
    .filter((line): line is OrderLineInput => line !== undefined);
  return { lines, refusals };
}
