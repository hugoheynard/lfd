import type { VatShare } from "@lfd/money";

import { computeOrderTotals } from "../services/vat.js";
import { OrderLine } from "../value-objects/order-line.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import {
  ensureDeliveryFeeMatches,
  ensureDiscountMatches,
  ensureLateFeeMatches,
  ensurePickupDiscountOnlyOnPickup,
  voucherDiscountOf,
} from "./order-amount-guards.js";
import { clienteleOf } from "./order-fulfillment.js";
import type { DraftOrderInput, OrderFulfillmentInput } from "./order-shapes.js";
import type { OrderRateAmounts } from "../value-objects/order-rate-amounts.js";

/**
 * **Les montants d'une commande, selon sa méthode** — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 4, § 6).
 *
 * Deux compositions, une forme de sortie : `line_ht` (ci-dessous, le calcul
 * d'avant la voie B, inchangé) et `exact_ht` (`order-exact-amounts.ts`). Sorti
 * d'`order.ts` le 2026-10-27, quand la seconde est arrivée.
 */

/**
 * Les TTC des termes sans colonne TTC propre — d'une commande `exact_ht`
 * seulement. Positifs, comme leurs HT ; le bon y est sa valeur faciale imputée.
 */
export interface OrderTtcTerms {
  readonly discountCents: number;
  readonly voucherCents: number;
  readonly deliveryFeeCents: number;
}

/** Ce que l'agrégat fige : HT de chaque terme, TVA, total, et les TTC s'il y en a. */
export interface DraftedAmounts {
  readonly vatMethod: OrderVatMethod;
  readonly lines: readonly OrderLine[];
  readonly subtotalCents: number;
  /** HT — la colonne `discount_cents`. */
  readonly discountCents: number;
  /** HT — la colonne `delivery_fee_cents`. */
  readonly deliveryFeeCents: number;
  /** HT — la colonne `voucher_discount_cents`. */
  readonly voucherDiscountCents: number;
  readonly vatCents: number;
  readonly vatShares: readonly VatShare[];
  readonly totalCents: number;
  /** `null` pour `line_ht`. */
  readonly ttcTerms: OrderTtcTerms | null;
  /** La part de chaque taux, taux croissants ; `null` pour `line_ht`. */
  readonly ttcByRate: readonly OrderRateAmounts[] | null;
}

/**
 * **`line_ht`** — le calcul pro, et celui de toute commande d'avant la voie B.
 * Le corps de l'ancien `Order.draft`, déplacé sans changer une opération : les
 * vingt paniers figés (`order-pro-frozen.spec.ts`) le tiennent.
 *
 * Les montants reçus sont HT, l'ajustement figé doit les reproduire.
 */
export function lineHtAmountsOf(
  input: DraftOrderInput,
  fulfillment: OrderFulfillmentInput,
): DraftedAmounts {
  // 🔴 **L'audience est décidée UNE fois, ici** — le seul endroit qui la
  // connaisse au moment où elle est encore vraie. Chaque ligne scelle alors
  // son taxe compris, ou ne le scelle pas ; le document, plus tard, n'a plus
  // qu'à regarder ce qu'il a (R3, 2026-09-21).
  const clientele = clienteleOf(input.companyId);
  const lines = input.lines.map((line) => OrderLine.create(line, clientele));
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  // L'assiette de la remise de retrait, relue sur le drapeau des lignes —
  // jamais reçue de l'appelant (V1 du plan des exclusions).
  const eligibleSubtotalCents = lines.reduce(
    (sum, line) => (line.pickupDiscountEligible ? sum + line.lineTotalCents : sum),
    0,
  );
  ensureDiscountMatches(input, eligibleSubtotalCents);
  ensureLateFeeMatches(input, subtotalCents);
  ensureDeliveryFeeMatches(input, subtotalCents);
  ensurePickupDiscountOnlyOnPickup(input, fulfillment);
  const voucherDiscountCents = voucherDiscountOf(
    input.voucher,
    input.companyId,
    subtotalCents - input.discountCents,
  );
  // 🔴 **Une seule définition du TTC**, et elle est dans la ventilation : la
  // surtaxe et les frais s'ajoutent APRÈS la remise — on ne fait pas de geste
  // commercial sur une pénalité de retard —, règle appliquée dans
  // `ventilateVat`, où les extras sont proratisés sur le sous-total brut quand
  // les lignes le sont sur le net.
  const { vatCents, vatShares, totalCents } = computeOrderTotals({
    lines: lines.map((line) => ({
      htCents: line.lineTotalCents,
      vatRate: line.vatRate,
      discountEligible: line.pickupDiscountEligible,
    })),
    discountCents: input.discountCents,
    voucherDiscountCents,
    deliveryFeeCents: input.deliveryFeeCents,
    deliveryVatMode: input.deliveryVatMode,
    lateFeeCents: input.lateFeeCents,
    lateFeeVatRate: input.lateFeeAdjustment?.vatRatePercent ?? null,
  });
  return {
    vatMethod: "line_ht",
    lines,
    subtotalCents,
    discountCents: input.discountCents,
    deliveryFeeCents: input.deliveryFeeCents,
    voucherDiscountCents,
    vatCents,
    vatShares,
    totalCents,
    ttcTerms: null,
    ttcByRate: null,
  };
}
