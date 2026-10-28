import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  InvalidOrderPaymentError,
  MisplacedPickupDiscountError,
} from "../../errors/order-errors.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order, type DraftOrderInput } from "../order.js";

/**
 * La remise de retrait sur ses seules lignes éligibles — la garde de
 * l'agrégat (V1) et la ventilation (R1) du plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`.
 */
const ADDRESS: BillingAddressPayload = {
  label: "",
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};

/** Le pain à 5,5 %, remisé ; la boisson à 20 %, exclue. 10 € HT chacun. */
const PAIN: OrderLineInput = {
  sku: "PAI-001",
  productName: "Pain",
  unitPriceMillicents: millicentsFromCents(1_000),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: 1,
  productId: "p_pain",
  categoryId: "c_pains",
};
const BOISSON: OrderLineInput = {
  sku: "BOI-001",
  productName: "Jus",
  unitPriceMillicents: millicentsFromCents(1_000),
  vatRate: 20,
  saleUnit: "piece",
  quantity: 1,
  pickupDiscountEligible: false,
  productId: "p_jus",
  categoryId: "c_boissons",
};
const TEN_PERCENT = { mode: "percent", bp: 1_000 } as const;

/**
 * Une commande de SOCIÉTÉ par défaut : la remise de retrait y est un montant
 * HT (`line_ht`). Depuis la voie B (plan
 * `documentation/pricing/plan-centime-particuliers.md`, lot C2), celle d'un
 * particulier se prend sur le TTC — cf. le dernier bloc et
 * `order-exact-ht.spec.ts`.
 */
function input(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    companyId: "co_1",
    billedCompanyId: "co_1",
    principal: null,
    placedByStaffId: null,
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    placedByUserId: "user_1",
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: ADDRESS,
    },
    requestedDeliveryDate: null,
    note: "",
    catalogVersionId: null,
    lines: [PAIN, BOISSON],
    discountCents: 100,
    discountAdjustment: TEN_PERCENT,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTerms", revision: null, fileId: null },
    locale: null,
    ...over,
  };
}

function placed(over: Partial<DraftOrderInput> = {}): ReturnType<Order["toPersistence"]> {
  const order = Order.draft(input(over));
  order.deferPayment();
  return order.toPersistence();
}

describe("Order.draft — la remise de retrait sur les lignes éligibles", () => {
  /** L'exemple du §3 : la base à 20 % reste entière. */
  it("ventile la remise sur les seules lignes éligibles", () => {
    const state = placed();

    // (1000 − 100) × 5,5 % = 49,5 → 50 ; 1000 × 20 % = 200.
    expect(state.vatShares).toEqual([
      { rate: 5.5, amountCents: 50 },
      { rate: 20, amountCents: 200 },
    ]);
    expect(state.totalCents).toBe(2_000 - 100 + 250);
  });

  it("fige le drapeau, le produit et la famille sur chaque ligne", () => {
    const lines = placed().lines.map((line) => ({
      sku: line.sku,
      eligible: line.pickupDiscountEligible,
      productId: line.productId,
      categoryId: line.categoryId,
    }));

    expect(lines).toEqual([
      { sku: "PAI-001", eligible: true, productId: "p_pain", categoryId: "c_pains" },
      { sku: "BOI-001", eligible: false, productId: "p_jus", categoryId: "c_boissons" },
    ]);
  });

  /** V1 : avant, l'agrégat recalculait sur le sous-total entier et refusait ce bon. */
  it("recalcule l'assiette lui-même, sur le drapeau des lignes", () => {
    expect(() => placed({ discountCents: 200 })).toThrow(InvalidOrderPaymentError);
  });

  it("tient une ligne sans drapeau pour éligible — les bons d'avant", () => {
    const { pickupDiscountEligible: _dropped, ...unflagged } = BOISSON;

    expect(placed({ lines: [PAIN, unflagged], discountCents: 200 }).discountCents).toBe(200);
  });

  /**
   * Le bon de fidélité garde toutes les lignes pour assiette, après la remise —
   * un bon n'existe que pour un particulier, donc en TTC (plan du centime,
   * § 5 R2-R3) : pain 10,55 € et jus 12,00 € TTC, remise 10 % du pain = 1,06 €.
   */
  it("laisse le bon se ventiler sur toutes les lignes", () => {
    const state = placed({
      companyId: null,
      billedCompanyId: null,
      discountCents: 106,
      voucher: { id: "v_1", valueCents: 190 },
    });

    expect(state.voucherTtcCents).toBe(190);
    // Le bon se découpe au prorata du net (949 / 1 200) : 84 et 106. Le pain :
    // 1 055 − 106 − 84 = 865 → ⌈45,09⌉ = 46 ; le jus : 1 200 − 106 = 1 094 → ⌈182,33⌉ = 183.
    expect(state.vatShares).toEqual([
      { rate: 5.5, amountCents: 46 },
      { rate: 20, amountCents: 183 },
    ]);
    expect(state.totalCents).toBe(1_055 + 1_200 - 106 - 190);
  });
});

/** V5 du plan : une remise de retrait n'existe que sur une commande retirée. */
describe("Order.draft — la remise de retrait seulement sur un retrait", () => {
  const FEE = { mode: "amount", cents: 1_500 } as const;
  const FREE = { mode: "amount", cents: 0 } as const;
  const DELIVERED: DraftOrderInput["fulfillment"] = {
    method: "delivery",
    deliveryZoneId: "zone_1",
    deliveryAddress: ADDRESS,
    deliveryAddressId: null,
    pickupAddress: null,
  };

  it("refuse une remise de retrait sur une livraison avec port", () => {
    expect(() =>
      placed({ fulfillment: DELIVERED, deliveryFeeCents: 1_500, deliveryFeeAdjustment: FEE }),
    ).toThrow(new MisplacedPickupDiscountError("not_picked_up"));
  });

  it("refuse une remise de retrait sur une livraison à 0 €", () => {
    expect(() =>
      placed({ fulfillment: DELIVERED, deliveryFeeCents: 0, deliveryFeeAdjustment: FREE }),
    ).toThrow(new MisplacedPickupDiscountError("not_picked_up"));
  });

  it("refuse une remise figée qui rend zéro, sur une livraison", () => {
    expect(() => placed({ fulfillment: DELIVERED, lines: [BOISSON], discountCents: 0 })).toThrow(
      new MisplacedPickupDiscountError("not_picked_up"),
    );
  });

  it("refuse un retrait remisé qui porterait des frais de livraison", () => {
    expect(() => placed({ deliveryFeeCents: 1_500, deliveryFeeAdjustment: FEE })).toThrow(
      new MisplacedPickupDiscountError("with_delivery_fee"),
    );
  });

  it("accepte le retrait remisé, sans port", () => {
    expect(placed().discountCents).toBe(100);
  });

  it("accepte la livraison avec son port, sans remise", () => {
    const state = placed({
      fulfillment: DELIVERED,
      discountCents: 0,
      discountAdjustment: null,
      deliveryFeeCents: 1_500,
      deliveryFeeAdjustment: FEE,
    });

    expect(state.deliveryFeeCents).toBe(1_500);
    expect(state.discountCents).toBe(0);
  });
});
