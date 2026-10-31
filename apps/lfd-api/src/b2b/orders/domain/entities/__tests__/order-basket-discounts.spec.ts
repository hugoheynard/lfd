import { discountCentsOf, type BillingAddressPayload, type CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { InvalidOrderPaymentError } from "../../errors/order-errors.js";
import { composeExactOrder } from "../../services/exact-order-composition.js";
import { lineHtBasketStepsOf } from "../order-basket-discounts.js";
import { Order, type DraftOrderInput, type OrderToPlace } from "../order.js";

/**
 * **La passation fige ses remises de panier, une ligne par remise** — `documentation/promotions/promotions.md`, § 2.11, lot M3. Ce que l'agrégat rend ici est ce que `order_discounts`
 * reçoit ; le déclencheur différé exige Σ montants = `discount_cents`, et
 * Σ parts par taux = montant de la remise.
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
const LABEL = { fr: "Remise retrait", en: "Pickup discount", it: "Sconto ritiro" };

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
    pickupDiscountEligible: false,
  },
];
/** HT des deux lignes éligibles : 7 × 1,33 + 3 × 3,17. */
const ELIGIBLE_HT = 7 * 133 + 3 * 317;

function input(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
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
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
    ...over,
  };
}

function placed(over: Partial<DraftOrderInput>): OrderToPlace {
  const order = Order.draft(input(over));
  order.deferPayment();
  return order.toPersistence();
}

function proWith(adjustment: CartAdjustment): OrderToPlace {
  return placed({
    discountAdjustment: adjustment,
    discountCents: discountCentsOf(adjustment, ELIGIBLE_HT),
    discountPromotionId: "promo_1",
    discountLabel: LABEL,
  });
}

/** Un particulier : la remise arrive en TTC, par la composition que l'agrégat rejoue. */
function individualWith(adjustment: CartAdjustment): OrderToPlace {
  const personal = { companyId: null, billedCompanyId: null } as const;
  const composed = composeExactOrder({
    lines: LINES,
    discountAdjustment: adjustment,
    deliveryFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucherFaceCents: 0,
  });
  return placed({
    ...personal,
    salesTerms: { document: "salesTerms", revision: null, fileId: null },
    discountAdjustment: adjustment,
    discountCents: composed.pickupDiscount.ttcCents,
    discountPromotionId: "promo_1",
    discountLabel: LABEL,
  });
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe("les remises de panier figées par la passation (M3)", () => {
  it("line_ht : une remise de rang 1, égale à discount_cents, ventilée par taux", () => {
    const state = proWith(TEN_PERCENT);

    expect(state.basketDiscounts).toHaveLength(1);
    const [discount] = state.basketDiscounts;
    expect(discount).toMatchObject({
      rank: 1,
      promotionId: "promo_1",
      adjustment: TEN_PERCENT,
      label: LABEL,
      amountCents: state.discountCents,
      amountTtcCents: null,
      baseCents: ELIGIBLE_HT,
      coveredLines: [0, 1],
    });
    expect(discount?.vatShares.map((share) => share.rate)).toEqual([5.5, 20]);
    expect(sum(discount?.vatShares.map((share) => share.htCents) ?? [])).toBe(state.discountCents);
    expect(discount?.vatShares.every((share) => share.ttcCents === undefined)).toBe(true);
  });

  it("line_ht : un montant fixe suit le même chemin", () => {
    const state = proWith({ mode: "amount", cents: 250 });

    expect(state.basketDiscounts.map((discount) => discount.amountCents)).toEqual([250]);
    expect(sum(state.basketDiscounts[0]?.vatShares.map((share) => share.htCents) ?? [])).toBe(250);
  });

  it("exact_ht : HT et TTC de la remise, parts par taux complètes", () => {
    const state = individualWith(TEN_PERCENT);

    const [discount] = state.basketDiscounts;
    expect(discount?.amountCents).toBe(state.discountCents);
    expect(discount?.amountTtcCents).toBe(state.discountTtcCents);
    const shares = discount?.vatShares ?? [];
    expect(sum(shares.map((share) => share.htCents))).toBe(state.discountCents);
    expect(sum(shares.map((share) => share.ttcCents ?? Number.NaN))).toBe(state.discountTtcCents);
    expect(discount?.coveredLines).toEqual([0, 1]);
  });

  it("aucune remise : aucune ligne", () => {
    expect(placed({}).basketDiscounts).toEqual([]);
  });

  /**
   * Une remise arrondie à zéro n'a pas de ligne : une part vide ne somme à
   * rien, et le déclencheur la refuserait. Les colonnes gardent l'ajustement.
   */
  it("une remise de montant nul n'a pas de ligne, l'ajustement reste figé", () => {
    const tiny: CartAdjustment = { mode: "percent", bp: 1 };
    const state = placed({
      lines: [{ ...CROISSANT, quantity: 1 }],
      discountAdjustment: tiny,
      discountCents: discountCentsOf(tiny, 133),
    });

    expect(state.discountCents).toBe(0);
    expect(state.discountAdjustment).toEqual(tiny);
    expect(state.basketDiscounts).toEqual([]);
  });

  it("refuse une remise que la chaîne ne redonne pas au centime", () => {
    const lines = [{ amountCents: 1_000, vatRate: 5.5, eligible: true }];

    expect(() => lineHtBasketStepsOf(lines, TEN_PERCENT, 99)).toThrow(InvalidOrderPaymentError);
    expect(lineHtBasketStepsOf(lines, TEN_PERCENT, 100)[0]?.amountCents).toBe(100);
  });
});
