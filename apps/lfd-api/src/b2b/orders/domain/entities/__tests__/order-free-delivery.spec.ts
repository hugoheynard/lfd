import type { BillingAddressPayload, CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents, orderPretaxCents } from "@lfd/money";

import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order } from "../order.js";
import type { RevisableOrder } from "../order-revision.js";
import type { OrderToPlace } from "../order-shapes.js";
import {
  deliveryPromotion,
  draftFrom,
  replayedOf,
  type DraftSpec,
} from "./priced-input.fixture.js";

/**
 * **Le franco, chiffré par l'agrégat** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, 1b ; décisions de
 * Hugo du 2026-11-05) : la base du seuil est le HT des marchandises APRÈS les
 * remises et AVANT le bon ; au franco, le frais facturé vaut 0 et la commande
 * fige le seuil et ce que la livraison aurait coûté ; une révision rejuge le
 * franco contre le seuil qu'on lui passe (le figé, choisi par le chargement).
 *
 * Panier de référence : 10 × 2,00 € HT à 5,5 % = 20,00 € HT ; course 12,00 €
 * HT, TVA du port standard (20 %).
 */

const ADDRESS: BillingAddressPayload = {
  label: "",
  ligne1: "2 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const FEE: CartAdjustment = { mode: "amount", cents: 1_200 };
const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_000 };

const line = (qty: number): OrderLineInput => ({
  sku: "VIE-001",
  productName: "Croissant",
  unitPriceMillicents: millicentsFromCents(200),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: qty,
});

const PRO: DraftSpec = {
  companyId: "co_1",
  billedCompanyId: "co_1",
  principal: null,
  placedByStaffId: null,
  buyerKind: "registered",
  agreed: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  placedByUserId: "usr_1",
  fulfillment: {
    method: "delivery",
    deliveryZoneId: "zone_1",
    deliveryAddress: ADDRESS,
    deliveryAddressId: null,
    pickupAddress: null,
  },
  requestedDeliveryDate: null,
  note: "",
  catalogVersionId: null,
  lines: [line(10)],
  deliveryFee: FEE,
  voucher: null,
  salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
  locale: null,
};

const PERSONAL: DraftSpec = {
  ...PRO,
  companyId: null,
  billedCompanyId: null,
  salesTerms: { document: "salesTerms", revision: null, fileId: null },
};

function stateOf(base: DraftSpec, over: Partial<DraftSpec> = {}): OrderToPlace {
  const order = Order.draft(draftFrom(base, over));
  order.deferPayment();
  return order.toPersistence();
}

describe("Order.draft — le franco d'une commande pro (line_ht)", () => {
  it("atteint pile au seuil : rien de facturé, le seuil et le montant offert figés", () => {
    const state = stateOf(PRO, { freeDeliveryThresholdCents: 2_000 });

    expect(state.deliveryFeeCents).toBe(0);
    expect(state.deliveryFeeAdjustment).toEqual(FEE);
    expect(state.freeDelivery).toEqual({
      thresholdCents: 2_000,
      waivedCents: 1_200,
      waivedTtcCents: null,
    });
    // 20,00 € HT + 1,10 € de TVA, sans course.
    expect(state.totalCents).toBe(2_110);
  });

  it("manqué d'un centime : la course est facturée au barème", () => {
    const state = stateOf(PRO, { freeDeliveryThresholdCents: 2_001 });

    expect(state.freeDelivery).toBeNull();
    expect(state.deliveryFeeCents).toBe(1_200);
    expect(state.totalCents).toBe(3_550);
  });

  it("atteint AVANT la remise seulement : manqué, la base est le HT remisé", () => {
    const state = stateOf(PRO, {
      freeDeliveryThresholdCents: 2_000,
      promotions: [deliveryPromotion(TEN_PERCENT)],
    });

    expect(state.discountCents).toBe(200);
    expect(state.freeDelivery).toBeNull();
    expect(state.deliveryFeeCents).toBe(1_200);
  });

  it("atteint APRÈS la remise : le HT remisé atteint le seuil, la course est offerte", () => {
    const state = stateOf(PRO, {
      freeDeliveryThresholdCents: 1_800,
      promotions: [deliveryPromotion(TEN_PERCENT)],
    });

    expect(state.freeDelivery?.thresholdCents).toBe(1_800);
    expect(state.deliveryFeeCents).toBe(0);
  });

  /** Régression : sans seuil, la commande est celle d'avant le franco, au centime. */
  it("sans seuil : strictement inchangé", () => {
    const state = stateOf(PRO, { freeDeliveryThresholdCents: null });

    expect(state.freeDelivery).toBeNull();
    expect(state.deliveryFeeCents).toBe(1_200);
    expect(state.totalCents).toBe(3_550);
  });

  it("zone à frais nul : rien à offrir, aucun franco figé", () => {
    const state = stateOf(PRO, {
      freeDeliveryThresholdCents: 0,
      deliveryFee: { mode: "amount", cents: 0 },
    });

    expect(state.freeDelivery).toBeNull();
    expect(state.deliveryFeeCents).toBe(0);
  });
});

describe("Order.draft — le franco d'une commande de particulier (exact_ht)", () => {
  it("atteint : port TTC nul, le TTC offert figé à côté du HT", () => {
    const state = stateOf(PERSONAL, { freeDeliveryThresholdCents: 2_000 });

    expect(state.vatMethod).toBe("exact_ht");
    expect(state.deliveryFeeCents).toBe(0);
    expect(state.deliveryFeeTtcCents).toBe(0);
    expect(state.freeDelivery).toEqual({
      thresholdCents: 2_000,
      waivedCents: 1_200,
      waivedTtcCents: 1_440,
    });
    expect(state.totalCents).toBe(2_110);
  });

  it("le seuil se compte en HT : 21,10 € TTC n'atteint pas un seuil de 21,00 €", () => {
    const state = stateOf(PERSONAL, { freeDeliveryThresholdCents: 2_100 });

    expect(state.freeDelivery).toBeNull();
    expect(state.deliveryFeeTtcCents).toBe(1_440);
  });

  it("le bon de fidélité ne fait pas perdre le franco : il s'impute après", () => {
    const state = stateOf(PERSONAL, {
      freeDeliveryThresholdCents: 2_000,
      voucher: { id: "vch_1", valueCents: 500 },
    });

    expect(state.freeDelivery?.waivedTtcCents).toBe(1_440);
    expect(state.deliveryFeeTtcCents).toBe(0);
    expect(state.voucherTtcCents).toBe(500);
    expect(state.totalCents).toBe(1_610);
  });

  it("atteint avant la remise seulement : manqué", () => {
    const state = stateOf(PERSONAL, {
      freeDeliveryThresholdCents: 2_000,
      promotions: [deliveryPromotion(TEN_PERCENT)],
    });

    expect(state.freeDelivery).toBeNull();
    expect(state.deliveryFeeTtcCents).toBe(1_440);
  });
});

/** La commande telle qu'une révision la relit, depuis son état persisté. */
function revisableOf(state: OrderToPlace): RevisableOrder {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-1",
    revision: 0,
    vatMethod: state.vatMethod,
    companyId: state.companyId,
    billedCompanyId: state.billedCompanyId,
    principal: null,
    placedByUserId: state.placedByUserId,
    placedByStaffId: null,
    buyerKind: "registered",
    status: "placed",
    paymentStatus: "not_required",
    shortfallDecided: false,
    discountPromotionId: state.discountPromotionId,
    discountAdjustment: state.discountAdjustment,
    discountLabel: state.discountLabel,
    discountCents: state.discountCents,
    discountTtcCents: state.discountTtcCents,
    activeDiscounts: [],
    totalCents: state.totalCents,
    pretaxCents: orderPretaxCents(state),
    stripePaymentIntentId: null,
    cancelledAt: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    serviceDay: null,
    supply: state.supply,
    entryShortcut: state.entryShortcut,
    entryOrigin: state.entryOrigin,
    fulfillment: {
      method: state.fulfillmentMethod,
      deliveryZoneId: state.deliveryZoneId,
      deliveryAddress: state.deliveryAddress,
      deliveryAddressId: null,
      pickupAddress: null,
    },
    agreed: state.agreed,
    note: "",
    lines: state.lines,
    deliveryVatMode: state.deliveryVatMode,
    deliveryFeeAdjustment: state.deliveryFeeAdjustment,
    freeDeliveryThresholdCents: state.freeDelivery?.thresholdCents ?? null,
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: state.salesTerms,
    locale: null,
    catalogVersionId: null,
    customerCancellation: state.customerCancellation,
    customerCancellableUntil: state.customerCancellableUntil,
  };
}

describe("Order.revise — le franco rejugé contre le seuil figé", () => {
  const current = revisableOf(stateOf(PRO, { freeDeliveryThresholdCents: 2_000 }));
  // Ce que le chargement passe à la révision dans la même zone : le barème
  // et le seuil FIGÉS (`PricingContext`, 1b).
  const frozen: Partial<DraftSpec> = {
    deliveryFee: current.deliveryFeeAdjustment ?? undefined,
    freeDeliveryThresholdCents: current.freeDeliveryThresholdCents,
    replayed: replayedOf(current),
  };

  it("repassé sous le seuil : le frais revient, au barème figé, et le total monte", () => {
    const revision = Order.revise(
      current,
      draftFrom(PRO, { ...frozen, lines: [line(9)] }),
    ).revision;

    expect(revision.state.freeDelivery).toBeNull();
    expect(revision.state.deliveryFeeCents).toBe(1_200);
    expect(revision.totalAfterCents).toBeGreaterThan(revision.totalBeforeCents);
  });

  it("resté au-dessus du seuil : toujours offert, le seuil figé reconduit", () => {
    const revision = Order.revise(
      current,
      draftFrom(PRO, { ...frozen, lines: [line(12)] }),
    ).revision;

    expect(revision.state.deliveryFeeCents).toBe(0);
    expect(revision.state.freeDelivery).toEqual({
      thresholdCents: 2_000,
      waivedCents: 1_200,
      waivedTtcCents: null,
    });
  });
});
