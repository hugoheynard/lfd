import type { CartAdjustment } from "@lfd/contracts";
import type { TtcComposedLine } from "@lfd/money";

import { InvalidOrderLineError, InvalidOrderPaymentError } from "../errors/order-errors.js";
import {
  ExactVatMethodForCompanyError,
  LateFeeOnPersonalOrderError,
} from "../errors/order-vat-method-errors.js";
import { composeExactOrder } from "../services/exact-order-composition.js";
import { OrderLine, type OrderLineInput } from "../value-objects/order-line.js";
import { ensurePickupDiscountOnlyOnPickup, ensureVoucherUsable } from "./order-amount-guards.js";
import type { DraftedAmounts } from "./order-amounts.js";
import type { DraftOrderInput, OrderFulfillmentInput } from "./order-shapes.js";

/**
 * **`exact_ht`** — la commande d'un particulier, composée en TTC (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 4 et § 5).
 *
 * Les montants reçus sont **dans l'unité de la méthode** : la remise retrait
 * et le port arrivent en TTC, le bon à sa valeur faciale TTC (§ 10, Q2). Les
 * gardes gardent leur logique — l'ajustement figé reproduit le montant
 * retenu — mais rejouent la composition et comparent des TTC.
 *
 * Puis l'agrégat fige le HT ET le TTC de chaque terme : les colonnes HT
 * gardent leur sens et s'additionnent exactement (Σ HT des lignes − remises
 * HT + port HT + TVA = total), le total est Σ TTC — ce que Stripe prélève.
 *
 * @throws {ExactVatMethodForCompanyError} une commande de société.
 * @throws {LateFeeOnPersonalOrderError} une surtaxe de retard (R5).
 * @throws {InvalidOrderPaymentError} remise ou port qui ne découle pas de son ajustement.
 * @throws {MisplacedPickupDiscountError} remise de retrait hors d'un retrait.
 */
export function exactAmountsOf(
  input: DraftOrderInput,
  fulfillment: OrderFulfillmentInput,
): DraftedAmounts {
  if (input.companyId !== null) {
    throw new ExactVatMethodForCompanyError();
  }
  if (input.lateFeeCents !== 0 || input.lateFeeAdjustment !== null) {
    throw new LateFeeOnPersonalOrderError();
  }
  if (input.voucher !== null) {
    ensureVoucherUsable(input.voucher, input.companyId);
  }
  const composition = composeExactOrder({
    lines: input.lines,
    discountAdjustment: input.discountAdjustment,
    deliveryFeeAdjustment: input.deliveryFeeAdjustment,
    deliveryVatMode: input.deliveryVatMode,
    voucherFaceCents: input.voucher?.valueCents ?? 0,
  });
  ensureTtcMatches(
    input.discountAdjustment,
    input.discountCents,
    composition.pickupDiscount.ttcCents,
    "La remise retenue, taxe comprise, ne correspond pas à l'ajustement appliqué.",
  );
  ensureTtcMatches(
    input.deliveryFeeAdjustment,
    input.deliveryFeeCents,
    composition.deliveryFee.ttcCents,
    "Les frais de livraison, taxe comprise, ne correspondent pas à leur zone.",
  );
  ensurePickupDiscountOnlyOnPickup(input, fulfillment);
  const lines = input.lines.map((line, i) =>
    OrderLine.ofTtc(line, composedLine(line, composition.lines[i])),
  );
  return {
    vatMethod: "exact_ht",
    lines,
    subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    discountCents: composition.pickupDiscount.htCents,
    deliveryFeeCents: composition.deliveryFee.htCents,
    voucherDiscountCents: composition.voucher.htCents,
    vatCents: composition.total.vatCents,
    // La forme de `ventilateVat` : une part par taux réellement taxé, croissant.
    vatShares: composition.byRate
      .filter((part) => part.vatCents !== 0)
      .map((part) => ({ rate: part.vatRate, amountCents: part.vatCents })),
    totalCents: composition.total.ttcCents,
    ttcByRate: composition.byRate.map((part) => ({
      rate: part.vatRate,
      htCents: part.htCents,
      vatCents: part.vatCents,
      ttcCents: part.ttcCents,
    })),
    ttcTerms: {
      discountCents: composition.pickupDiscount.ttcCents,
      voucherCents: composition.voucher.ttcCents,
      deliveryFeeCents: composition.deliveryFee.ttcCents,
    },
  };
}

/**
 * Le montant TTC reçu est-il celui que l'ajustement figé produit ? Sans
 * ajustement, aucun montant — une remise ou un port sans trace ne se fige pas.
 *
 * @throws {InvalidOrderPaymentError}
 */
function ensureTtcMatches(
  adjustment: CartAdjustment | null,
  receivedCents: number,
  composedCents: number,
  refusal: string,
): void {
  const expected = adjustment === null ? 0 : composedCents;
  if (receivedCents !== expected) {
    throw new InvalidOrderPaymentError(refusal);
  }
}

/** La ligne composée de même rang — la composition en rend une par ligne. */
function composedLine(
  line: OrderLineInput,
  composed: TtcComposedLine | undefined,
): TtcComposedLine {
  if (composed === undefined) {
    throw new InvalidOrderLineError(line.sku, "aucune composition taxe comprise pour cette ligne");
  }
  return composed;
}
