import type { BillingAddressPayload, CartAdjustment } from "@lfd/contracts";
import { lineTotalCents, millicentsFromCents, saleQuantity } from "@lfd/money";

import { chainLineHtBasketDiscounts } from "../../services/basket-discounts.js";
import { composeExactOrder } from "../../services/exact-order-composition.js";
import { Order, type DraftOrderInput, type OrderToPlace } from "../order.js";
import type { DraftBasketDiscount } from "../order-shapes.js";
import {
  deliveryPromotion,
  draftFrom,
  pickupPromotion,
  type DraftSpec,
} from "./priced-input.fixture.js";

/**
 * **Plusieurs remises de panier sur une commande** — `documentation/promotions/promotions.md`, § 2.11, lot M7. L'agrégat rejoue la chaîne de M1 sur ses
 * lignes, fige une remise par étape, et laisse les colonnes uniques à `NULL`
 * (arbitrage n° 1 du § 18.8).
 */

const POINT: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};
const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_000 };

const CROISSANT: DraftOrderInput["lines"][number] = {
  sku: "VIE-001",
  productName: "Croissant",
  unitPriceMillicents: millicentsFromCents(133),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: 7,
};

/** Trois lignes, deux taux ; la troisième est exclue de la remise. */
const LINES: DraftOrderInput["lines"] = [
  CROISSANT,
  {
    sku: "BOI-001",
    productName: "Jus",
    unitPriceMillicents: millicentsFromCents(317),
    vatRate: 20,
    saleUnit: "piece",
    quantity: 3,
  },
  {
    sku: "GAT-001",
    productName: "Gâteau",
    unitPriceMillicents: millicentsFromCents(900),
    vatRate: 5.5,
    saleUnit: "piece",
    quantity: 1,
  },
];

const BASE: DraftSpec = {
  companyId: "co_1",
  billedCompanyId: "co_1",
  principal: null,
  placedByUserId: "usr_1",
  placedByStaffId: null,
  buyerKind: "registered",
  agreed: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  fulfillment: {
    method: "pickup",
    deliveryZoneId: null,
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddress: { ...POINT, siteId: "site_a" },
  },
  requestedDeliveryDate: null,
  note: "",
  catalogVersionId: null,
  lines: LINES,
  voucher: null,
  salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
  locale: null,
};

function placed(over: Partial<DraftSpec>): OrderToPlace {
  const order = Order.draft(draftFrom(BASE, over));
  order.deferPayment();
  return order.toPersistence();
}

const GENERIC = { fr: "Remises", en: "Discounts", it: "Sconti" };
const FIVE_PERCENT: CartAdjustment = { mode: "percent", bp: 500 };

/** 10 % sur les deux lignes éligibles, puis 5 % sur le seul croissant. */
const CUMULATED: readonly DraftBasketDiscount[] = [
  {
    promotionId: "promo_a",
    adjustment: TEN_PERCENT,
    label: null,
    coveredLines: [0, 1],
    terms: null,
  },
  { promotionId: "promo_b", adjustment: FIVE_PERCENT, label: null, coveredLines: [0], terms: null },
];

/** Les deux promotions cumulables qui produisent {@link CUMULATED} ; le gâteau hors portée. */
const CUMULATIVE_AT_PICKUP = [
  pickupPromotion(TEN_PERCENT, { id: "promo_a", excludedSkus: ["GAT-001"], cumulative: true }),
  pickupPromotion(FIVE_PERCENT, {
    id: "promo_b",
    excludedSkus: ["BOI-001", "GAT-001"],
    cumulative: true,
  }),
];

/** Le total HT que la chaîne de M1 rend sur ces lignes — ce que la composition enverra. */
function chainedHt(discounts: readonly DraftBasketDiscount[]): readonly number[] {
  return chainLineHtBasketDiscounts(
    LINES.map((line) => ({
      htCents: lineTotalCents(line.unitPriceMillicents, saleQuantity(line.quantity, line.saleUnit)),
      vatRate: line.vatRate,
    })),
    discounts,
  ).steps.map((step) => step.amountCents);
}

function cumulatedPro(over: Partial<DraftSpec> = {}): OrderToPlace {
  return placed({ promotions: CUMULATIVE_AT_PICKUP, ...over });
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe("plusieurs remises de panier (M7)", () => {
  it("line_ht : une remise par étape, dans l'ordre, Σ = discount_cents, colonnes uniques à NULL", () => {
    const state = cumulatedPro();

    expect(state.basketDiscounts.map((discount) => [discount.rank, discount.promotionId])).toEqual([
      [1, "promo_a"],
      [2, "promo_b"],
    ]);
    expect(state.basketDiscounts.map((discount) => discount.amountCents)).toEqual(
      chainedHt(CUMULATED),
    );
    expect(sum(state.basketDiscounts.map((discount) => discount.amountCents))).toBe(
      state.discountCents,
    );
    expect(state.discountAdjustment).toBeNull();
    expect(state.discountPromotionId).toBeNull();
    expect(state.discountLabel).toEqual(GENERIC);
    expect(state.basketDiscounts[1]?.coveredLines).toEqual([0]);
    for (const discount of state.basketDiscounts) {
      expect(sum(discount.vatShares.map((share) => share.htCents))).toBe(discount.amountCents);
    }
  });

  it("line_ht : le total retombe — net des lignes + TVA = TTC", () => {
    const state = cumulatedPro();
    expect(state.subtotalCents - state.discountCents + state.vatCents).toBe(state.totalCents);
  });

  it("exact_ht : la composition en liste fige HT, TTC et parts de chaque remise", () => {
    const composed = composeExactOrder({
      lines: LINES,
      discountAdjustment: null,
      basketDiscounts: CUMULATED,
      deliveryFeeAdjustment: null,
      deliveryVatMode: "standard",
      voucherFaceCents: 0,
    });
    const state = placed({
      companyId: null,
      billedCompanyId: null,
      salesTerms: { document: "salesTerms", revision: null, fileId: null },
      promotions: CUMULATIVE_AT_PICKUP,
    });

    expect(state.totalCents).toBe(composed.total.ttcCents);
    expect(state.discountTtcCents).toBe(composed.pickupDiscount.ttcCents);
    expect(state.basketDiscounts.map((discount) => discount.amountTtcCents)).toEqual(
      composed.basketDiscounts.map((term) => term.ttcCents),
    );
    expect(sum(state.basketDiscounts.map((discount) => discount.amountCents))).toBe(
      state.discountCents,
    );
  });

  it("fige les deux remises que la caisse a cumulées, et les termes qui les rejouent", () => {
    const state = cumulatedPro();

    expect(state.basketDiscounts.map((discount) => discount.coveredLines)).toEqual([[0, 1], [0]]);
    // Le gâteau n'est couvert par aucune : il sort de l'assiette, drapeau compris.
    expect(state.lines.map((line) => line.pickupDiscountEligible)).toEqual([true, true, false]);
  });

  // « refuse un total que la chaîne ne redonne pas », « une remise unique à
  // côté », « une liste d'une seule remise », « un drapeau d'éligibilité
  // faux », « une remise que la chaîne ramène à zéro », « au-delà de cinq » :
  // des formes qu'aucun panier ne produit depuis L7 (2a). Les gardes restent,
  // en filet : `order-cumulated-guards.spec.ts`.

  it("admet des remises cumulées sur une commande livrée : elles viennent de promotions", () => {
    const delivered = (fee: number): OrderToPlace =>
      cumulatedPro({
        fulfillment: {
          method: "delivery",
          deliveryZoneId: "zone_1",
          deliveryAddress: POINT,
          deliveryAddressId: null,
          pickupAddress: null,
        },
        deliveryFee: { mode: "amount", cents: fee },
        promotions: [
          deliveryPromotion(TEN_PERCENT, {
            id: "promo_a",
            excludedSkus: ["GAT-001"],
            cumulative: true,
          }),
          deliveryPromotion(FIVE_PERCENT, {
            id: "promo_b",
            excludedSkus: ["BOI-001", "GAT-001"],
            cumulative: true,
          }),
        ],
      });
    expect(delivered(500).basketDiscounts).toHaveLength(2);
  });
});
