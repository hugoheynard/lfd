import {
  OrderComposition,
  type ArrangedContent,
  type ResolvedContent,
} from "../order-composition.service.js";
import type { OrderContent } from "../order-content.js";

/**
 * `OrderComposition.draftOf` rend la remise et le port **dans l'unité de la
 * méthode** — plan `documentation/pricing/plan-centime-particuliers.md`
 * (§ 5, lot C2) : HT tels que `CartAdjustments` les rend pour `line_ht`, TTC
 * par la composition de l'agrégat pour `exact_ht`.
 */
const CONTENT: OrderContent = {
  fulfillmentMethod: "pickup",
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: null,
  note: "",
  lines: [{ sku: "BAN-001", quantity: 1 }],
};

const ARRANGED: ArrangedContent = {
  agreed: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  bookAddressId: null,
  deliveryVatMode: "standard",
};

function resolved(fulfillment: Partial<ResolvedContent["fulfillment"]> = {}): ResolvedContent {
  return {
    lines: [
      {
        sku: "BAN-001",
        productName: "Banana bread",
        unitPriceMillicents: 1_990_521,
        vatRate: 5.5,
        quantity: 1,
      },
    ],
    subtotalCents: 1_991,
    known: new Map(),
    audience: "b2c",
    fulfillment: {
      deliveryZoneId: null,
      deliveryAddress: null,
      pickupAddress: null,
      // Ce que `CartAdjustments` rend : 10 % du HT de ligne arrondi.
      discountCents: 199,
      discountAdjustment: { mode: "percent", bp: 1_000 },
      ineligibleSkus: new Set(),
      deliveryFeeAdjustment: null,
      deliveryFeeCents: 0,
      globalWindowMode: null,
      ...fulfillment,
    },
  };
}

describe("OrderComposition.draftOf — l'unité de la méthode", () => {
  it("line_ht : la remise HT de `CartAdjustments`, telle quelle", () => {
    const draft = OrderComposition.draftOf(CONTENT, resolved(), ARRANGED, "line_ht");

    expect(draft.discountCents).toBe(199);
    expect(draft.deliveryFeeCents).toBe(0);
  });

  it("exact_ht : la remise sur le TTC — 10 % de 21,00 € = 2,10 €", () => {
    const draft = OrderComposition.draftOf(CONTENT, resolved(), ARRANGED, "exact_ht");

    expect(draft.discountCents).toBe(210);
  });

  it("exact_ht : le port converti au mode de TVA arrangé", () => {
    const fee = {
      deliveryFeeAdjustment: { mode: "amount" as const, cents: 1_000 },
      deliveryFeeCents: 1_000,
    };
    const noDiscount = { discountCents: 0, discountAdjustment: null };

    const standard = OrderComposition.draftOf(
      { ...CONTENT, fulfillmentMethod: "delivery" },
      resolved({ ...fee, ...noDiscount }),
      ARRANGED,
      "exact_ht",
    );
    const follows = OrderComposition.draftOf(
      { ...CONTENT, fulfillmentMethod: "delivery" },
      resolved({ ...fee, ...noDiscount }),
      { ...ARRANGED, deliveryVatMode: "follows_goods" },
      "exact_ht",
    );

    expect(standard.deliveryFeeCents).toBe(1_200);
    expect(follows.deliveryFeeCents).toBe(1_055);
    expect(standard.discountCents).toBe(0);
  });
});
