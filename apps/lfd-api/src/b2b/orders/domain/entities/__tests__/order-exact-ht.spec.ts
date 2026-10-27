import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  InvalidOrderPaymentError,
  MisplacedPickupDiscountError,
} from "../../errors/order-errors.js";
import {
  ExactVatMethodForCompanyError,
  LateFeeOnPersonalOrderError,
} from "../../errors/order-vat-method-errors.js";
import { exactAmountsOf } from "../order-exact-amounts.js";
import { Order, type DraftOrderInput } from "../order.js";

/**
 * **La commande d'un particulier, composée en TTC** — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 4, § 5, lot C2).
 * Le client paie Σ quantité × étiquette, moins ses remises, plus son port ;
 * la TVA s'extrait par taux au centime supérieur ; les colonnes HT
 * s'additionnent exactement.
 */
const ADDRESS: BillingAddressPayload = {
  label: "",
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};

const DELIVERED: DraftOrderInput["fulfillment"] = {
  method: "delivery",
  deliveryZoneId: "zone_1",
  deliveryAddress: ADDRESS,
  deliveryAddressId: null,
  pickupAddress: null,
};

/** Banana bread : 19,90521 € HT à 5,5 % — étiquette 21,00 €. */
const BANANA = {
  sku: "BAN-001",
  productName: "Banana bread",
  unitPriceMillicents: 1_990_521,
  vatRate: 5.5,
  quantity: 1,
};

function input(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    companyId: null,
    billedCompanyId: null,
    principal: null,
    placedByUserId: "user_1",
    placedByStaffId: null,
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
      pickupAddress: ADDRESS,
    },
    requestedDeliveryDate: null,
    note: "",
    catalogVersionId: null,
    lines: [BANANA],
    discountCents: 0,
    discountAdjustment: null,
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

/** Σ HT des lignes − remises HT + port HT + TVA = total — sans colonne d'écart. */
function expectAdditive(state: ReturnType<Order["toPersistence"]>): void {
  const ht = state.subtotalCents - state.discountCents - state.voucherDiscountCents;
  expect(ht + state.deliveryFeeCents + state.vatCents).toBe(state.totalCents);
  expect(state.vatShares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(state.vatCents);
}

describe("Order.draft — la part figée de chaque taux (ttc_by_rate)", () => {
  const JUICE = {
    sku: "JUS-001",
    productName: "Jus",
    unitPriceMillicents: 250_000,
    vatRate: 20,
    quantity: 2,
  };

  it("est la composition par taux : HT, TVA, TTC, taux croissants", () => {
    const state = placed({
      lines: [BANANA, JUICE],
      discountAdjustment: { mode: "percent", bp: 1_000 },
      discountCents: 270,
    });

    expect(state.ttcByRate).toEqual([
      { rate: 5.5, htCents: 1_791, vatCents: 99, ttcCents: 1_890 },
      { rate: 20, htCents: 450, vatCents: 90, ttcCents: 540 },
    ]);
  });

  it("somme vers le total, et sa TVA vers celle de la commande", () => {
    const state = placed({ lines: [BANANA, JUICE] });
    const parts = state.ttcByRate ?? [];

    expect(parts.reduce((sum, part) => sum + part.ttcCents, 0)).toBe(state.totalCents);
    expect(parts.reduce((sum, part) => sum + part.vatCents, 0)).toBe(state.vatCents);
    expect(parts.every((part) => part.htCents + part.vatCents === part.ttcCents)).toBe(true);
  });
});

describe("Order.draft — un particulier paie la somme des étiquettes (exact_ht)", () => {
  it("banana bread à 21,00 € : 21,00 € prélevés, HT 19,90, TVA 1,10", () => {
    const state = placed();

    expect(state.vatMethod).toBe("exact_ht");
    expect(state.totalCents).toBe(2_100);
    expect(state.subtotalCents).toBe(1_990);
    expect(state.vatShares).toEqual([{ rate: 5.5, amountCents: 110 }]);
    expect(state.lines[0]).toMatchObject({
      lineTotalCents: 1_990,
      unitPriceTtcCents: 2_100,
      lineTotalTtcCents: 2_100,
    });
    expect(state.discountTtcCents).toBe(0);
    expect(state.voucherTtcCents).toBe(0);
    expect(state.deliveryFeeTtcCents).toBe(0);
    expectAdditive(state);
  });

  it("trente articles à 0,50 € : 15,00 €, TVA 2,50 répartie, HT 12,50", () => {
    const fifty = { ...BANANA, unitPriceMillicents: 41_667, vatRate: 20 };
    const state = placed({
      lines: Array.from({ length: 30 }, (_, i) => ({ ...fifty, sku: `ART-${String(i)}` })),
    });

    expect(state.totalCents).toBe(1_500);
    expect(state.vatCents).toBe(250);
    expect(state.subtotalCents).toBe(1_250);
    expect(state.lines.every((line) => line.lineTotalTtcCents === 50)).toBe(true);
    expectAdditive(state);
  });

  it("scelle l'étiquette et quantité × étiquette sur la ligne", () => {
    const state = placed({ lines: [{ ...BANANA, quantity: 3 }] });

    expect(state.lines[0]).toMatchObject({ unitPriceTtcCents: 2_100, lineTotalTtcCents: 6_300 });
    expect(state.totalCents).toBe(6_300);
  });

  it("prend la remise retrait en pourcentage sur le TTC : −10 % de 21,00 = 2,10 €", () => {
    const state = placed({
      discountCents: 210,
      discountAdjustment: { mode: "percent", bp: 1_000 },
    });

    expect(state.discountTtcCents).toBe(210);
    expect(state.totalCents).toBe(1_890);
    expectAdditive(state);
  });

  it("convertit une remise fixe saisie HT en TTC au taux des lignes : 2,00 € HT → 2,11 €", () => {
    const state = placed({
      discountCents: 211,
      discountAdjustment: { mode: "amount", cents: 200 },
    });

    expect(state.discountTtcCents).toBe(211);
    expect(state.discountAdjustment).toEqual({ mode: "amount", cents: 200 });
    expect(state.totalCents).toBe(1_889);
    expectAdditive(state);
  });

  it("refuse une remise reçue en HT : la garde compare des TTC", () => {
    expect(() =>
      placed({ discountCents: 200, discountAdjustment: { mode: "amount", cents: 200 } }),
    ).toThrow(InvalidOrderPaymentError);
  });

  it("convertit le port standard à 20 % : 10,00 € HT → 12,00 € TTC", () => {
    const state = placed({
      fulfillment: DELIVERED,
      deliveryFeeCents: 1_200,
      deliveryFeeAdjustment: { mode: "amount", cents: 1_000 },
    });

    expect(state.deliveryFeeTtcCents).toBe(1_200);
    expect(state.deliveryFeeCents).toBe(1_000);
    expect(state.totalCents).toBe(3_300);
    expect(state.vatShares).toEqual([
      { rate: 5.5, amountCents: 110 },
      { rate: 20, amountCents: 200 },
    ]);
    expectAdditive(state);
  });

  it("convertit le port qui suit la marchandise à son taux : 10,00 € HT → 10,55 €", () => {
    const state = placed({
      fulfillment: DELIVERED,
      deliveryFeeCents: 1_055,
      deliveryFeeAdjustment: { mode: "amount", cents: 1_000 },
      deliveryVatMode: "follows_goods",
    });

    expect(state.totalCents).toBe(2_100 + 1_055);
    expect(state.vatShares.map((share) => share.rate)).toEqual([5.5]);
    expectAdditive(state);
  });

  it("applique un port en pourcentage au TTC des marchandises (R1 bis)", () => {
    const state = placed({
      fulfillment: DELIVERED,
      deliveryFeeCents: 105,
      deliveryFeeAdjustment: { mode: "percent", bp: 500 },
    });

    expect(state.deliveryFeeTtcCents).toBe(105);
    expect(state.totalCents).toBe(2_205);
    expectAdditive(state);
  });

  it("refuse un port reçu en HT", () => {
    expect(() =>
      placed({
        fulfillment: DELIVERED,
        deliveryFeeCents: 1_000,
        deliveryFeeAdjustment: { mode: "amount", cents: 1_000 },
      }),
    ).toThrow(InvalidOrderPaymentError);
  });

  it("refuse une remise retrait sur une livraison, comme le pro", () => {
    expect(() =>
      placed({
        fulfillment: DELIVERED,
        discountCents: 210,
        discountAdjustment: { mode: "percent", bp: 1_000 },
        deliveryFeeCents: 1_200,
        deliveryFeeAdjustment: { mode: "amount", cents: 1_000 },
      }),
    ).toThrow(MisplacedPickupDiscountError);
  });

  it("impute le bon à sa valeur faciale TTC : un bon de 5 € retire 5,00 €", () => {
    const order = Order.draft(input({ voucher: { id: "v1", valueCents: 500 } }));
    order.payByCard("pi_test");
    const state = order.toPersistence();

    expect(state.voucherTtcCents).toBe(500);
    expect(state.totalCents).toBe(1_600);
    // Le registre décompte la valeur faciale (R6), la colonne HT garde sa part.
    expect(order.voucherFaceCents).toBe(500);
    expect(order.voucherDiscountCents).toBe(state.voucherDiscountCents);
    expect(state.voucherDiscountCents).toBeLessThan(500);
    expectAdditive(state);
  });

  it("borne le bon au TTC restant après la remise", () => {
    const state = placed({
      discountCents: 210,
      discountAdjustment: { mode: "percent", bp: 1_000 },
      voucher: { id: "v1", valueCents: 5_000 },
    });

    expect(state.voucherTtcCents).toBe(1_890);
    expect(state.totalCents).toBe(0);
    expect(state.vatCents).toBe(0);
  });

  it("garde une ligne offerte à 0 HT, 0 TVA", () => {
    const state = placed({ lines: [BANANA, { ...BANANA, sku: "OFF-1", unitPriceMillicents: 0 }] });

    expect(state.lines[1]).toMatchObject({ lineTotalCents: 0, lineTotalTtcCents: 0 });
    expect(state.totalCents).toBe(2_100);
  });

  it("tient Σ HT + TVA = total et TVA ≥ HT × taux sur des paniers à deux taux", () => {
    for (let cents = 1; cents <= 400; cents += 7) {
      const state = placed({
        lines: [
          { ...BANANA, unitPriceMillicents: millicentsFromCents(cents), quantity: 3 },
          {
            ...BANANA,
            sku: "B",
            unitPriceMillicents: millicentsFromCents(cents + 13),
            vatRate: 20,
          },
        ],
        discountCents: 0,
      });
      expectAdditive(state);
      for (const share of state.vatShares) {
        const ht = state.lines
          .filter((line) => line.vatRate === share.rate)
          .reduce((sum, line) => sum + line.lineTotalCents, 0);
        expect(share.amountCents * 100).toBeGreaterThanOrEqual(ht * share.rate);
      }
    }
  });
});

describe("Order.draft — les refus propres à exact_ht", () => {
  it("R5 : refuse une surtaxe de retard sur une commande de particulier", () => {
    expect(() =>
      Order.draft(
        input({
          lateFeeCents: 100,
          lateFeeAdjustment: { adjustment: { mode: "amount", cents: 100 }, vatRatePercent: 20 },
        }),
      ),
    ).toThrow(LateFeeOnPersonalOrderError);
  });

  it("refuse de composer en TTC une commande de société", () => {
    const fulfillment = input().fulfillment;
    expect(() => exactAmountsOf(input({ companyId: "co_1" }), fulfillment)).toThrow(
      ExactVatMethodForCompanyError,
    );
  });

  it("une société reste line_ht, même sans aucune autre différence", () => {
    const order = Order.draft(input({ companyId: "co_1", billedCompanyId: "co_1" }));
    order.deferPayment();
    const state = order.toPersistence();

    expect(state.vatMethod).toBe("line_ht");
    expect(state.totalCents).toBe(2_101);
    expect(state.lines[0]?.unitPriceTtcCents).toBeNull();
  });
});
