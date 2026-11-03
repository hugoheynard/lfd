import type {
  FulfillmentMethod,
  OrderDiscountView,
  ShopQuoteLineView,
  ShopQuoteView,
} from "@lfd/contracts";
import { ttcCentsOf } from "@lfd/money";

import type { OrderVoucher } from "../../domain/entities/order.js";
import {
  draftedAmountsOf,
  type DraftAmountsInput,
  type DraftedAmounts,
} from "../../domain/entities/order-amounts.js";
import type { BasketAmounts, BasketTerms } from "../../domain/services/basket-pricing-context.js";
import { pickupDiscountBaseOf } from "../../domain/services/pickup-discount-base.js";
import type { OrderLine } from "../../domain/value-objects/order-line.js";
import type { OrderVatMethod } from "../../domain/value-objects/order-vat-method.js";

/**
 * Le décompte **et** ce que le bon a baissé du TTC. Deux champs plutôt qu'une
 * vue élargie : le devis anonyme ne doit pas porter la clé (contrat servi,
 * plan des points E2.1), et un spread de la vue l'y ferait passer.
 */
export interface ShopCartQuote {
  readonly view: ShopQuoteView;
  readonly voucherTotalEffectCents: number;
}

/** Ce que les montants lisent de la commande que le devis annonce. */
export interface QuotedOrder {
  readonly companyId: string | null;
  readonly voucher: OrderVoucher | null;
  /** `null` : l'acheminement n'est pas encore choisi. */
  readonly method: FulfillmentMethod | null;
  readonly vatMethod: OrderVatMethod;
}

/**
 * **L'adaptateur `BasketAmounts` → `ShopQuoteView`** (plan
 * `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`, § 2.5,
 * lot L2). Les totaux sortent de `draftedAmountsOf` — la composition par
 * méthode (`AMOUNTS_BY_METHOD`) que l'agrégat appelle à la passation —, pas
 * d'une entrée de `ventilateVat` assemblée ici : c'était l'écart É15, deux
 * assemblages de la même ventilation qui divergeaient en silence dès qu'un
 * terme n'était ajouté que d'un côté.
 *
 * Le contrat servi ne change pas : les termes y restent HT (ceux que la
 * commande figera), le total est ce qui sera débité.
 */
export function shopQuoteOf(priced: BasketAmounts, order: QuotedOrder): ShopCartQuote {
  const input: DraftAmountsInput = {
    companyId: order.companyId,
    voucher: order.voucher,
    ...priced.terms,
  };
  const amounts = draftedAmountsOf(input, { method: order.method }, order.vatMethod);
  const lines = amounts.lines.map(lineViewOf);
  const { terms } = priced;
  const cumulated = terms.basketDiscounts;
  const base = pickupDiscountBaseOf(
    terms.discountAdjustment !== null || cumulated !== undefined,
    amounts.lines.map((line, index) => ({
      sku: line.sku,
      lineTotalCents: line.lineTotalCents,
      lineTotalTtcCents: lines[index]?.lineTotalTtcCents ?? null,
      eligible: line.pickupDiscountEligible,
    })),
  );
  const view: ShopQuoteView = {
    lines,
    subtotalHtCents: amounts.subtotalCents,
    discountCents: amounts.discountCents,
    discountAdjustment: terms.discountAdjustment,
    ...(cumulated === undefined ? {} : { discounts: discountViewsOf(cumulated, amounts) }),
    ...(base === null ? {} : { pickupDiscountBase: base }),
    voucherDiscountCents: amounts.voucherDiscountCents,
    deliveryFeeCents: amounts.deliveryFeeCents,
    deliveryVatMode: terms.deliveryVatMode,
    vat: amounts.vatShares.map((share) => ({ rate: share.rate, amountCents: share.amountCents })),
    totalCents: amounts.totalCents,
  };
  return {
    view: withAwaiting(withEndedDiscounts(withDiscountLabel(view, terms), priced), priced),
    voucherTotalEffectCents: voucherEffectOf(input, order, amounts),
  };
}

/**
 * La ligne de la commande → sa vue publique. 🔴 **Rien de la trace ne
 * franchit** : cette réponse est servie sans jeton, et la règle de tri est
 * celle de `ShopItemView` — « qu'est-ce que c'est, et combien ça coûte ».
 * Le TTC d'une ligne pro n'est pas scellé par la commande : il se dérive de
 * son HT arrondi une fois, comme le devis l'a toujours servi.
 */
function lineViewOf(line: OrderLine): ShopQuoteLineView {
  return {
    sku: line.sku,
    quantity: line.quantity,
    saleUnit: line.saleUnit,
    unitPriceMillicents: line.unitPriceMillicents,
    lineTotalCents: line.lineTotalCents,
    lineTotalTtcCents: line.lineTotalTtcCents ?? ttcCentsOf(line.lineTotalCents, line.vatRate),
    vatRatePercent: line.vatRate,
  };
}

/** Une entrée par remise cumulée (M7), montants de l'étape que la commande figera. */
function discountViewsOf(
  cumulated: NonNullable<BasketTerms["basketDiscounts"]>,
  amounts: DraftedAmounts,
): OrderDiscountView[] {
  return cumulated.map((discount, index) => {
    const step = amounts.basketSteps[index];
    return {
      ...(discount.label === null ? {} : { label: discount.label }),
      adjustment: discount.adjustment,
      amountCents: step?.amountCents ?? 0,
      amountTtcCents: step?.amountTtcCents ?? null,
    };
  });
}

/**
 * La baisse de TTC que le bon procure : le total sans le bon moins le total
 * avec (`MyShopQuoteView.voucherTotalEffectCents`), les deux par la même
 * composition — aucune seconde règle d'arrondi.
 */
function voucherEffectOf(
  input: DraftAmountsInput,
  order: QuotedOrder,
  amounts: DraftedAmounts,
): number {
  if (input.voucher === null) {
    return 0;
  }
  const without = draftedAmountsOf(
    { ...input, voucher: null },
    { method: order.method },
    order.vatMethod,
  );
  return without.totalCents - amounts.totalCents;
}

/**
 * Le nom de la remise UNIQUE, quand une promotion la fait (décision du
 * 2026-11-01) : absent sans remise, sans libellé (remise d'un point d'avant
 * les promotions) et quand `discounts` porte déjà chaque nom (M7).
 */
function withDiscountLabel(
  view: ShopQuoteView,
  terms: Pick<BasketTerms, "discountLabel">,
): ShopQuoteView {
  const label = terms.discountLabel ?? null;
  return label === null || view.discounts !== undefined || view.discountCents === 0
    ? view
    : { ...view, discountLabel: label };
}

/** Les remises à heures finies aujourd'hui (plan jours et heures, § 8) ; absent sinon. */
function withEndedDiscounts(view: ShopQuoteView, priced: BasketAmounts): ShopQuoteView {
  return priced.ended.length === 0
    ? view
    : {
        ...view,
        endedDiscounts: priced.ended.map((entry) => ({
          label: entry.label,
          endedAt: entry.endedAt,
        })),
      };
}

/** Ce que le décompte attend encore (§ 2.5) ; absent quand c'est le prix de la commande. */
function withAwaiting(view: ShopQuoteView, priced: BasketAmounts): ShopQuoteView {
  return priced.awaiting.length === 0 ? view : { ...view, awaiting: priced.awaiting };
}
